/*
 * Boots the built page in a headless DOM and exercises the things a
 * crew would notice if they broke: route derivation, the move list,
 * the command deck, build mode, backstage modes, a failed call, the
 * print sheet, and the self-rebuild round trip.
 *
 * jsdom has no layout, so anything that depends on measurement (the
 * sheet snap heights, popover placement, pinch and pan) is asserted
 * only as far as it can be. Those paths are checked in a browser.
 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const frag = fs.readFileSync("ghost-light.html", "utf8");
const doc = "<!doctype html><html><head></head><body>" + frag + "</body></html>";

const errors = [];
const dom = new JSDOM(doc, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: new (require("jsdom").VirtualConsole)()
    .on("jsdomError", e => errors.push("jsdomError: " + e.message))
    .on("error", (...a) => errors.push("console.error: " + a.join(" ")))
});
const w = dom.window, d = w.document;

function step(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { console.log("  FAIL " + name + " :: " + e.message); errors.push(name + ": " + e.message); }
}
async function stepA(name, fn) {
  try { await fn(); console.log("  ok   " + name); }
  catch (e) { console.log("  FAIL " + name + " :: " + e.message); errors.push(name + ": " + e.message); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* Find a control by the words on it. Tests should break when the
   interface stops saying what it does, not when a class is renamed. */
function byText(text, sel, root) {
  const scope = root || d;
  return [...scope.querySelectorAll(sel || "button")]
    .find(b => b.textContent.trim().toLowerCase().includes(text.toLowerCase()));
}
function need(text, sel, root) {
  const el = byText(text, sel, root);
  if (!el) throw new Error("no control saying " + JSON.stringify(text));
  return el;
}
function moveTexts() { return [...d.querySelectorAll("#moves .mv")].map(n => n.textContent); }
function sceneChips() { return [...d.querySelectorAll("#scenebar .chip:not(.add)")]; }
function openBuild() {
  d.getElementById("btn-setup").click();
  need("Build the show").click();
}
function goToScene(i) {
  if (!d.querySelector("#scenebar .chip")) openBuild();
  sceneChips()[i].click();
}

setTimeout(async () => {
  console.log("--- load ---");
  console.log(errors.length ? errors.join("\n") : "  no load errors");

  step("role modal is the first thing on a fresh device", () => {
    if (!d.querySelector(".scrim")) throw new Error("no role picker");
  });
  step("pick stage manager", () => {
    d.querySelectorAll(".pick button")[0].click();
    if (d.querySelector(".scrim")) throw new Error("modal did not close");
  });

  console.log("--- the run screen ---");
  step("the ground plan is on screen, not hidden behind a toggle", () => {
    const svg = d.querySelector("svg.plan");
    if (!svg) throw new Error("no svg");
    if (d.getElementById("planwrap").classList.contains("hide")) throw new Error("plan hidden");
    if (byText("show stage map")) throw new Error("there is still a map toggle");
    if (d.querySelectorAll(".pc").length < 5) throw new Error("pieces not drawn");
  });
  step("opens on whatever scene the SM last called", () => {
    const state = JSON.parse(d.getElementById("state").textContent);
    const expected = state.scenes[state.liveIndex];
    if (d.getElementById("grab-nm").textContent !== expected.name)
      throw new Error("sheet says " + d.getElementById("grab-nm").textContent);
    if (!d.getElementById("grab-k").textContent.includes("On stage now"))
      throw new Error("does not say it is live");
  });
  step("the sheet header carries scene, position and move count", () => {
    const num = d.getElementById("grab-num").textContent;
    if (!/^\d+\/\d+$/.test(num)) throw new Error("position reads " + num);
    if (!/move|preset|no change/.test(d.getElementById("grab-ct").textContent))
      throw new Error("no move count");
  });
  step("the topbar carries only the show, the status and Setup", () => {
    const btns = d.querySelectorAll(".top button");
    if (btns.length !== 1) throw new Error(btns.length + " buttons in the topbar");
    if (btns[0].textContent.trim() !== "Setup") throw new Error("not Setup: " + btns[0].textContent);
  });
  step("sync chip says device-only when there is no artifact runtime", () => {
    const c = d.getElementById("syncchip");
    if (!/device/i.test(c.textContent)) throw new Error("chip says " + c.textContent);
    if (!c.classList.contains("warn")) throw new Error("not flagged");
  });
  step("nothing scrolls the document — the deck cannot be pushed off screen", () => {
    const css = d.getElementById("sheet").textContent;
    if (!/html,body\{[^}]*overflow:hidden/.test(css)) throw new Error("body can scroll");
    if (!/\.deck\{[^}]*safe-b/.test(css)) throw new Error("deck ignores the home indicator");
  });

  console.log("--- moves are derived, never typed ---");
  step("scene 1 is the preset, and says so", () => {
    goToScene(0);
    d.getElementById("btn-setup").click();          // leave build mode
    if (!/preset/i.test(d.querySelector("#moves .empty").textContent))
      throw new Error("no preset message");
  });
  step("scene 2 lists real moves", () => {
    goToScene(1);
    d.getElementById("btn-setup").click();
    const t = moveTexts();
    if (t.length < 3) throw new Error("only " + t.length + " moves");
    if (!t.some(x => /Sofa/.test(x))) throw new Error("no sofa move");
  });
  step("the curtain is called first", () => {
    if (!/curtain/i.test(moveTexts()[0])) throw new Error("first move is " + moveTexts()[0]);
  });
  step("a curtain move says open or close, not in or out", () => {
    const verb = d.querySelector("#moves .mv .verb").textContent;
    if (verb !== "Open" && verb !== "Close") throw new Error("verb reads " + verb);
    if (/curtain (in|out)/i.test(moveTexts().join(" ")))
      throw new Error("the old in/out wording is still in the list");
  });
  step("sofa goes wing SR to stage with nothing in between", () => {
    const row = moveTexts().find(x => /Sofa/.test(x));
    if (!/Wing SR/.test(row)) throw new Error("no origin: " + row);
    if (!/Stage DS?[RCL]|Stage \w\w[RCL]/.test(row)) throw new Error("no destination: " + row);
    if (/Crossover/.test(row)) throw new Error("routed the long way: " + row);
  });
  step("aux to wing SR is direct — they share a side", () => {
    goToScene(2);
    d.getElementById("btn-setup").click();
    const row = moveTexts().find(x => /Door unit/.test(x));
    if (!row) throw new Error("door unit does not move into scene 3");
    if (/Crossover/.test(row)) throw new Error("routed via the crossover: " + row);
  });
  step("stage to aux passes through wing SR, because that is the only door", () => {
    const row = moveTexts().find(x => /Lamppost/.test(x));
    if (!row) throw new Error("lamppost does not move");
    if (!/Wing SR/.test(row)) throw new Error("skipped the wing: " + row);
  });
  step("a piece that sits still in a wing is not called as a move", () => {
    goToScene(4);
    d.getElementById("btn-setup").click();
    if (moveTexts().some(x => /Bench/.test(x))) throw new Error("bench listed but it did not move");
    if (!moveTexts().length) throw new Error("scene 5 should still have moves");
  });
  step("a move list row selects the piece on the plan", () => {
    [...d.querySelectorAll("#moves .mv")].find(n => /Sofa/.test(n.textContent)).click();
    const sel = d.querySelector(".pc.sel");
    if (!sel) throw new Error("nothing selected on the plan");
    const row = [...d.querySelectorAll("#moves .mv")].find(n => /Sofa/.test(n.textContent));
    if (!row.classList.contains("sel")) throw new Error("row not marked");
    row.click();
    if (d.querySelector(".pc.sel")) throw new Error("tapping again did not deselect");
  });

  console.log("--- the deck ---");
  step("GO is the primary target and the biggest control", () => {
    const go = d.querySelector("#deck .go");
    if (!go) throw new Error("no GO");
    if (!/Call next scene/i.test(go.textContent)) throw new Error("GO says " + go.textContent);
    if (d.querySelectorAll("#deck .sec").length !== 1) throw new Error("more than one secondary");
  });
  step("only two controls in the deck during a run", () => {
    if (d.querySelectorAll("#deck button").length !== 2)
      throw new Error(d.querySelectorAll("#deck button").length + " controls");
  });
  step("GO keeps its slot while looking ahead (motor memory)", () => {
    goToScene(1);
    d.getElementById("btn-setup").click();
    const go = d.querySelector("#deck .go");
    if (!go) throw new Error("GO vanished while browsing");
    if (!/Call next scene/i.test(go.textContent)) throw new Error("GO changed job: " + go.textContent);
  });
  step("looking ahead is stated, and leaving it is one tap", () => {
    if (!/Looking ahead/i.test(d.getElementById("grab-k").textContent))
      throw new Error("does not say you are ahead");
    if (d.getElementById("jump").classList.contains("hide")) throw new Error("no way back");
    need("Back to live", "button", d.getElementById("jump"));
    need("Call this one", "button", d.getElementById("jump"));
  });
  step("back to live", () => {
    need("Back to live", "button", d.getElementById("jump")).click();
    if (!d.getElementById("jump").classList.contains("hide")) throw new Error("still browsing");
  });

  console.log("--- build mode ---");
  step("Build is one tap from Setup, and swaps the whole screen", () => {
    openBuild();
    if (!d.body.classList.contains("mode-build")) throw new Error("not in build mode");
    if (d.getElementById("buildpane").classList.contains("hide")) throw new Error("no build pane");
    if (!d.getElementById("scenesheet").classList.contains("hide")) throw new Error("run sheet still showing");
    if (sceneChips().length !== 5) throw new Error(sceneChips().length + " scene chips");
  });
  step("Setup becomes Done, so there is one way out", () => {
    if (d.getElementById("btn-setup").textContent !== "Done") throw new Error("no exit");
  });
  step("name, curtain and note are in reach without opening anything", () => {
    const strip = d.getElementById("scenestrip");
    const ins = strip.querySelectorAll("input");
    if (ins.length !== 2) throw new Error(ins.length + " fields in the scene strip");
    if (ins[0].value !== w.GL.S.scenes[3].name) throw new Error("name field shows " + ins[0].value);
    const cs = strip.querySelectorAll(".seg.curtains button");
    if (cs.length !== 3) throw new Error(cs.length + " curtain toggles, expected main, mid and scrim");
    if (![...cs].every(b => /open|closed/.test(b.textContent)))
      throw new Error("a toggle does not say which way it is set");
    ins[1].value = "Watch the rake";
    ins[1].dispatchEvent(new w.Event("input"));
    if (w.GL.S.scenes[3].note !== "Watch the rake") throw new Error("note not saved");
  });
  step("every set piece in the show is in the tray", () => {
    const chips = d.querySelectorAll("#tray .pchip:not(.add)");
    if (chips.length !== 8) throw new Error(chips.length + " tray chips");
    if ([...chips].some(c => !c.querySelector(".sw"))) throw new Error("a chip has no colour");
    if ([...chips].some(c => c.classList.contains("out")))
      throw new Error("every piece is in this scene, none should read as absent");
  });
  step("tapping a piece opens its inspector, docked clear of the plan", () => {
    goToScene(1);
    d.querySelector("#tray .pchip:not(.add)").click();
    const pop = d.querySelector("#inspector .insp");
    if (!pop) throw new Error("no inspector");
    if (!byText("Wing SR", "button", pop)) throw new Error("no zone shortcut");
  });
  step("nothing on the plan resizes — the only handle turns", () => {
    if (d.querySelector(".pc.sel .grip, .pc.sel .grip-hit"))
      throw new Error("a resize grip is still on the plan");
    if (!d.querySelector(".pc.sel .spin")) throw new Error("no turn handle on the selected piece");
    if (d.querySelectorAll(".pc:not(.sel) .spin").length)
      throw new Error("unselected pieces carry a handle too");
  });
  step("size is typed in feet, and reads back in feet and inches", () => {
    const pop = d.querySelector("#inspector .insp");
    const wf = [...pop.querySelectorAll("input")].find(
      i => i.previousSibling && /Width/.test(i.previousSibling.textContent));
    if (!wf) throw new Error("no width field");
    if (!/^\d+'( \d+")?$/.test(wf.value)) throw new Error("width reads " + wf.value);
    const id = d.querySelector(".pc.sel").getAttribute("data-id");
    wf.value = "6'6\"";
    wf.dispatchEvent(new w.Event("change"));
    const piece = w.GL.S.pieces.find(p => p.id === id);
    if (w.GL.fmtFeet(w.GL.toFeet(piece.w)) !== "6' 6\"")
      throw new Error("stored " + w.GL.fmtFeet(w.GL.toFeet(piece.w)));
    if (wf.value !== "6' 6\"") throw new Error("field shows " + wf.value);
  });
  step("feet are read the way a person types them", () => {
    const P = w.GL.parseFeet, F = w.GL.fmtFeet;
    [["8", 8], ["8'", 8], ["8'6", 8.5], ["8'6\"", 8.5], ["18\"", 1.5],
     ["8.5", 8.5], ["6 ft 3 in", 6.25]].forEach(([raw, want]) => {
      if (Math.abs(P(raw) - want) > 1e-9) throw new Error(raw + " read as " + P(raw));
    });
    if (P("") !== null || P("abc") !== null) throw new Error("nonsense should not parse");
    if (F(8.5) !== "8' 6\"" || F(8) !== "8'" || F(0.5) !== "6\"")
      throw new Error("formatted " + F(8.5) + " / " + F(8) + " / " + F(0.5));
  });
  step("a piece turns to any angle, and snaps only when it is nearly square", () => {
    const A = w.GL.angleTo, c = { x: 0, y: 0 };
    if (A(c, { x: 0, y: -10 }) !== 0) throw new Error("handle straight up is not 0");
    if (A(c, { x: 10, y: 0 }) !== 90) throw new Error("handle to the right is not 90");
    if (A(c, { x: 0, y: 10 }) !== 180) throw new Error("handle down is not 180");
    // 37 degrees is a deliberate angle and must survive
    const p37 = { x: Math.sin(37 * Math.PI / 180), y: -Math.cos(37 * Math.PI / 180) };
    if (A(c, p37) !== 37) throw new Error("37 was pulled to " + A(c, p37));
    // 44 is within the snap window of 45
    const p44 = { x: Math.sin(44 * Math.PI / 180), y: -Math.cos(44 * Math.PI / 180) };
    if (A(c, p44) !== 45) throw new Error("44 did not snap to 45, got " + A(c, p44));
  });
  step("the turn field takes a typed angle and Straighten clears it", () => {
    const pop = d.querySelector("#inspector .insp");
    const t = [...pop.querySelectorAll("input")].find(
      i => i.previousSibling && /Turn/.test(i.previousSibling.textContent));
    if (!t) throw new Error("no turn field");
    const id = d.querySelector(".pc.sel").getAttribute("data-id");
    t.value = "30";
    t.dispatchEvent(new w.Event("change"));
    const sc = w.GL.S.scenes[w.GL.viewIdx];
    if (!sc.place[id] || sc.place[id].r !== 30)
      throw new Error("stored " + (sc.place[id] && sc.place[id].r));
    if (!/rotate\(30\)/.test(d.querySelector('.pc[data-id="' + id + '"]').getAttribute("transform")))
      throw new Error("the plan did not turn it");
    need("Straighten", "button", d.querySelector("#inspector .insp")).click();
    if (sc.place[id].r !== 0) throw new Error("Straighten left it at " + sc.place[id].r);
  });
  step("one tap sends a piece to the aux stage", () => {
    const pop = d.querySelector("#inspector .insp");
    need("Aux", "button", pop).click();
    const state = JSON.parse(d.getElementById("state").textContent);
    const id = d.querySelector(".pc.sel").getAttribute("data-id");
    // read the drawn plan, not #state — that is the last published snapshot
    if (!d.querySelector('.pc[data-id="' + id + '"]')) throw new Error("piece vanished");
    if (!/Aux stage/.test(d.querySelector("#inspector .insp .tag").textContent))
      throw new Error("popover still says " + d.querySelector("#inspector .insp .tag").textContent);
    if (state.scenes.length !== 5) throw new Error("state unexpectedly changed");
  });
  step("all three line sets are tracked, and each is called by name", () => {
    const held = d.querySelector(".pc.sel");
    w.GL.select(null);                       // the strip yields to the inspector
    const sc = w.GL.S.scenes[w.GL.viewIdx];
    if (w.GL.CURTAINS.length !== 3) throw new Error("expected main, mid and scrim");
    sc.mid = "closed";
    w.GL.render();
    const strip = d.getElementById("scenestrip");
    const mid = [...strip.querySelectorAll(".seg.curtains button")]
      .find(b => /MID/.test(b.textContent));
    if (!/closed/.test(mid.textContent)) throw new Error("toggle reads " + mid.textContent);
    if (!mid.classList.contains("on")) throw new Error("closed is not marked");
    mid.click();
    if (sc.mid !== "open") throw new Error("tapping did not reopen it");
    if (held) w.GL.select(held.getAttribute("data-id"));   // put the selection back
  });
  step("a curtain the theatre never closes is never called", () => {
    const a = { curtain: "closed" }, b = { curtain: "open" };
    const moves = w.GL.movesBetween(
      { curtain: "closed", place: {} }, { curtain: "open", place: {} });
    if (moves.length !== 1) throw new Error(moves.length + " curtain moves, expected 1");
    if (moves[0].verb !== "Open") throw new Error("said " + moves[0].verb);
    if (!a || !b) throw new Error("unreachable");
  });
  step("the plan carries a rod for each, and the scrim does not clash with the modal backdrop", () => {
    if (d.querySelectorAll("svg.plan .curtain").length !== 6)
      throw new Error("expected two panels per curtain");
    if (d.querySelector("svg.plan .scrim"))
      throw new Error("a curtain uses .scrim, which is the modal backdrop class");
  });
  step("a piece that does not move stays put instead of vanishing", () => {
    need("Same as last scene", "button", d.querySelector("#inspector .insp")).click();
    if (!d.querySelector(".pc.sel")) throw new Error("piece left the scene");
  });
  step("striking a piece takes it off the plan and greys its tray chip", () => {
    const id = d.querySelector(".pc.sel").getAttribute("data-id");
    need("Off for this scene", "button", d.querySelector("#inspector .insp")).click();
    if (d.querySelector('.pc[data-id="' + id + '"]')) throw new Error("still drawn");
    const chip = [...d.querySelectorAll("#tray .pchip")].find(c => c.classList.contains("out"));
    if (!chip) throw new Error("tray does not show it is out of this scene");
    need("Bring into this scene", "button", d.querySelector("#inspector .insp")).click();
    if (!d.querySelector('.pc[data-id="' + id + '"]')) throw new Error("could not bring it back");
  });
  step("editing does not publish — it goes to Save & sync", () => {
    if (!/Unsaved/i.test(d.getElementById("syncchip").textContent))
      throw new Error("chip says " + d.getElementById("syncchip").textContent);
    if (!/Save/i.test(d.querySelector("#deck .go").textContent))
      throw new Error("deck does not offer a save");
  });
  step("add a scene copies the one before it", () => {
    const before = sceneChips().length;
    d.querySelector("#scenebar .chip.add").click();
    if (sceneChips().length !== before + 1) throw new Error("no scene added");
    d.getElementById("btn-setup").click();                 // out to the run screen
    if (d.querySelectorAll("#moves .mv").length !== 0)
      throw new Error("a copied scene should have no moves into it");
  });
  step("delete asks first, then deletes", () => {
    openBuild();
    const before = sceneChips().length;
    sceneChips().find(c => c.classList.contains("cur")).click();   // current chip opens details
    need("Delete this scene").click();
    if (!d.querySelector(".scrim")) throw new Error("deleted without asking");
    need("Delete", "button", d.querySelector(".modal")).click();
    if (sceneChips().length !== before - 1) throw new Error("not deleted");
  });
  step("add a new set piece", () => {
    need("New piece", "#tray button").click();
    const m = d.querySelector(".modal");
    m.querySelector("input").value = "Ladder";
    need("Add piece", "button", m).click();
    if (!w.GL.S.pieces.some(p => p.name === "Ladder")) throw new Error("not added");
    if (!d.querySelector("#inspector .insp")) throw new Error("new piece is not selected and shown");
  });
  step("leaving build puts the run screen back", () => {
    d.getElementById("btn-setup").click();
    if (d.body.classList.contains("mode-build")) throw new Error("still building");
    if (d.getElementById("scenesheet").classList.contains("hide")) throw new Error("no move list");
    if (!d.querySelector("#deck .go")) throw new Error("no GO");
  });

  console.log("--- crew ---");
  step("crew get no GO and cannot reach build", () => {
    d.getElementById("btn-setup").click();
    need("Stage manager", "button", d.querySelector(".modal")).click();  // opens role picker
    d.querySelectorAll(".pick button")[1].click();                       // Crew
    if (d.querySelector("#deck .go")) throw new Error("crew can call the show");
    if (d.querySelectorAll("#deck .sec").length !== 2) throw new Error("crew need back and ahead");
    d.getElementById("btn-setup").click();
    if (byText("Build the show")) throw new Error("crew offered build mode");
    d.querySelector(".scrim").click();
  });
  step("on the live scene the read-out carries what is coming, not what the sheet says", () => {
    w.GL.S.liveIndex = 0; w.GL.render();
    const back = byText("Back to live", "button", d.getElementById("jump"));
    if (back) back.click();
    const ro = d.querySelector("#deck .readout");
    if (!ro) throw new Error("crew get nothing in the primary slot");
    if (ro.classList.contains("away")) throw new Error("flagged as away while on the live scene");
    if (!/Next up/i.test(ro.textContent))
      throw new Error("read-out repeats what the sheet already names: " + ro.textContent);
    if (ro.textContent.includes(d.getElementById("grab-nm").textContent))
      throw new Error("read-out duplicates the sheet header");
  });
  step("stepping away from live flips the read-out to where the show actually is", () => {
    d.querySelectorAll("#deck .sec")[1].click();                         // Ahead
    const ro = d.querySelector("#deck .readout");
    if (!ro.classList.contains("away")) throw new Error("not flagged as away from live");
    if (!/The show is on/i.test(ro.textContent)) throw new Error("read-out says " + ro.textContent);
  });
  step("back to stage manager", () => {
    d.getElementById("btn-setup").click();
    need("Crew", "button", d.querySelector(".modal")).click();
    d.querySelectorAll(".pick button")[0].click();
    if (!d.querySelector("#deck .go")) throw new Error("GO did not come back");
  });

  console.log("--- backstage ---");
  step("brightness cycles bright to dim to blackout in place, and forces dark", () => {
    d.getElementById("btn-setup").click();
    const b = [...d.querySelectorAll(".modal button")]
      .find(x => /^(Bright|Dim|Blackout)$/.test(x.textContent.trim()));
    if (!b) throw new Error("no brightness control");
    const seen = [b.textContent.trim()];
    for (let i = 0; i < 2; i++) { b.click(); seen.push(b.textContent.trim()); }
    d.querySelector(".scrim").click();
    if (seen.join(">") !== "Bright>Dim>Blackout") throw new Error("cycle went " + seen.join(">"));
    if (d.documentElement.getAttribute("data-theme") !== "dark")
      throw new Error("dimming did not force the dark palette");
    if (!d.getElementById("dim").classList.contains("tint"))
      throw new Error("blackout is not warmed toward red");
  });
  step("screen-awake control degrades where the API is missing", () => {
    d.getElementById("btn-setup").click();
    const b = need("screen", ".modal button");
    if (!b.disabled) throw new Error("offered a wake lock jsdom does not have");
    d.querySelector(".scrim").click();
  });

  console.log("--- a call that does not land ---");
  await stepA("failed call raises a persistent alert, not a toast", async () => {
    w.GL.setApi({ publish: () => Promise.reject({ code: "upstream_error" }) });
    w.GL.S.liveIndex = 0; w.GL.render();
    d.querySelector("#deck .go").click();
    await tick(); await tick(); await tick();
    const a = d.getElementById("alert");
    if (a.classList.contains("hide")) throw new Error("no alert");
    if (!/still on the scene before/.test(a.textContent)) throw new Error("alert says " + a.textContent);
    if (!byText("Send again", "button", a)) throw new Error("no retry");
  });
  step("the alert clears only when the SM says so", () => {
    need("headset", "button", d.getElementById("alert")).click();
    if (!d.getElementById("alert").classList.contains("hide")) throw new Error("still up");
    w.GL.setApi(null);
  });

  console.log("--- paper backup ---");
  step("run sheet covers every scene in order", () => {
    w.GL.buildSheet();
    const blks = d.querySelectorAll("#runsheet .blk");
    const state = JSON.parse(d.getElementById("state").textContent);
    if (!blks.length) throw new Error("empty sheet");
    if (blks.length !== w.GL.S.scenes.length) throw new Error(blks.length + " blocks");
    const cur = d.querySelector("#runsheet .cur").textContent;
    if (!/(open|closed)$/.test(cur)) throw new Error("no curtain state: " + cur);
    if (!state) throw new Error("no state");
  });
  step("building the run sheet does not touch the stylesheet", () => {
    if (!/:root\{/.test(d.getElementById("sheet").textContent))
      throw new Error("the stylesheet was overwritten");
  });

  console.log("--- self-rebuild ---");
  step("starting a new show asks, then clears everything", () => {
    d.getElementById("btn-setup").click();
    need("Start a new show").click();
    need("Clear it", "button", d.querySelector(".modal")).click();
    if (w.GL.S.pieces.length !== 0) throw new Error("pieces survived");
    if (w.GL.S.scenes.length !== 1) throw new Error("scenes survived");
    if (!d.body.classList.contains("mode-build")) throw new Error("did not drop you into build");
  });
  step("rebuilt page is a complete, re-parseable document", () => {
    const src = w.GL.pageSource(w.GL.S);
    if (!/^<!doctype html>/i.test(src)) throw new Error("no doctype");
    const re = new JSDOM(src);
    const rd = re.window.document;
    ["root", "state", "app", "sheet"].forEach(id => {
      if (!rd.getElementById(id)) throw new Error("rebuilt page lost #" + id);
    });
    if (!rd.querySelector("svg, #planwrap")) throw new Error("rebuilt page lost the plan");
  });
  step("the rebuilt page ships the fonts the stylesheet actually asks for", () => {
    const src = w.GL.pageSource(w.GL.S);
    const css = d.getElementById("sheet").textContent;
    const families = [...css.matchAll(/"([A-Z][A-Za-z ]+)"/g)]
      .map(m => m[1]).filter(f => /Atkinson|IBM Plex/.test(f));
    const uniq = [...new Set(families)];
    if (!uniq.length) throw new Error("no webfonts in the stylesheet");
    uniq.forEach(f => {
      if (!src.includes(f.replace(/ /g, "+")))
        throw new Error("republished page does not load " + f);
    });
  });

  console.log("\n" + (errors.length ? errors.length + " FAILED" : "all passed"));
  process.exit(errors.length ? 1 : 0);
}, 60);
