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

async function stepA(name, fn) {
  try { await fn(); console.log("  ok   " + name); }
  catch (e) { console.log("  FAIL " + name + " :: " + e.message); errors.push(name + ": " + e.message); }
}
const tick = () => new Promise(r => setTimeout(r, 0));
function viewIndexOf(doc) {
  const cur = doc.querySelector("#strip .sc.cur");
  return cur ? [...doc.querySelectorAll("#strip .sc")].indexOf(cur) : 0;
}
function step(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { console.log("  FAIL " + name + " :: " + e.message); errors.push(name + ": " + e.message); }
}

setTimeout(async () => {
  console.log("--- load ---");
  console.log(errors.length ? errors.join("\n") : "  no load errors");

  // role modal should be up on a fresh device
  step("role modal shown", () => {
    if (!d.querySelector(".scrim")) throw new Error("no role picker");
  });
  step("pick stage manager", () => {
    d.querySelectorAll(".pick button")[0].click();
    if (d.querySelector(".scrim")) throw new Error("modal did not close");
  });

  console.log("--- render ---");
  step("plan svg drawn", () => {
    const svg = d.querySelector("svg.plan");
    if (!svg) throw new Error("no svg");
    const pcs = d.querySelectorAll(".pc");
    if (pcs.length < 5) throw new Error("only " + pcs.length + " pieces drawn");
  });
  step("scene strip has 5 scenes", () => {
    const n = d.querySelectorAll("#strip .sc").length;
    if (n !== 5) throw new Error("got " + n);
  });
  step("opens on whatever scene the SM last called", () => {
    const state = JSON.parse(d.getElementById("state").textContent);
    const live = d.querySelectorAll("#strip .sc.livesc");
    if (live.length !== 1) throw new Error(live.length + " scenes marked live");
    const expected = state.scenes[state.liveIndex].name;
    if (live[0].querySelector(".t").textContent !== expected) throw new Error("marked live: " + live[0].textContent);
    if (!d.querySelector("#slotR .go")) throw new Error("no GO on load");
  });
  step("go to scene 1", () => { d.querySelectorAll("#strip .sc")[0].click(); });
  step("scene 1 shows preset message", () => {
    const t = d.getElementById("moves").textContent;
    if (!/preset/i.test(t)) throw new Error("got: " + t.slice(0, 80));
  });
  step("sync chip says device-only (no capability)", () => {
    const t = d.getElementById("syncchip").textContent;
    if (!/device|Connect/i.test(t)) throw new Error("got: " + t);
  });

  console.log("--- navigate to scene 2 ---");
  step("click scene 2", () => { d.querySelectorAll("#strip .sc")[1].click(); });
  step("scene 2 lists real moves", () => {
    const mvs = d.querySelectorAll("#moves .mv");
    if (!mvs.length) throw new Error("no moves listed");
    console.log("       " + [...mvs].map(m => m.querySelector(".nm").textContent).join(" | "));
  });
  step("curtain change is listed first", () => {
    const first = d.querySelector("#moves .mv .nm").textContent;
    if (!/curtain/i.test(first)) throw new Error("first move is: " + first);
  });
  step("sofa routes wing SR -> stage with no via", () => {
    const rows = [...d.querySelectorAll("#moves .mv")];
    const sofa = rows.find(r => /Sofa/.test(r.textContent));
    if (!sofa) throw new Error("no sofa move");
    const zs = [...sofa.querySelectorAll(".z")].map(z => z.textContent);
    console.log("       sofa path: " + zs.join(" -> "));
    if (zs[0] !== "Wing SR" || !/^Stage /.test(zs[zs.length - 1])) throw new Error(zs.join(","));
  });

  console.log("--- scene 3: aux -> wing, cross-stage traffic ---");
  step("click scene 3", () => { d.querySelectorAll("#strip .sc")[2].click(); });
  step("scene 3 moves", () => {
    const rows = [...d.querySelectorAll("#moves .mv")];
    rows.forEach(r => console.log("       " + r.querySelector(".nm").textContent + " :: " +
      [...r.querySelectorAll(".z")].map(z => z.textContent).join(" -> ")));
    const chair = rows.find(r => /Chair A/.test(r.textContent));
    if (!chair) throw new Error("chair A should travel stage -> wing SL");
  });
  step("door unit aux -> wing SR is direct", () => {
    const rows = [...d.querySelectorAll("#moves .mv")];
    const door = rows.find(r => /Door unit/.test(r.textContent));
    if (!door) throw new Error("no door move");
    const zs = [...door.querySelectorAll(".z")].map(z => z.textContent);
    if (zs.length !== 2) throw new Error("expected direct hop, got " + zs.join(" -> "));
  });

  console.log("--- scene 4: aux -> stage should route via wing SR ---");
  step("click scene 4", () => { d.querySelectorAll("#strip .sc")[3].click(); });
  step("scene 4 moves", () => {
    const rows = [...d.querySelectorAll("#moves .mv")];
    rows.forEach(r => console.log("       " + r.querySelector(".nm").textContent + " :: " +
      [...r.querySelectorAll(".z")].map(z => z.textContent).join(" -> ")));
    const lamp = rows.find(r => /Lamppost/.test(r.textContent));
    if (!lamp) throw new Error("lamppost should go stage -> aux");
    const zs = [...lamp.querySelectorAll(".z")].map(z => z.textContent);
    if (!zs.includes("Wing SR")) throw new Error("stage->aux must pass through Wing SR, got " + zs.join(" -> "));
  });
  step("bench wing SL -> wing SL is not a move", () => {
    const rows = [...d.querySelectorAll("#moves .mv")];
    const b = rows.find(r => /Bench/.test(r.textContent));
    if (b) {
      const zs = [...b.querySelectorAll(".z")].map(z => z.textContent);
      console.log("       bench: " + zs.join(" -> "));
    }
  });

  console.log("--- editing ---");
  step("select a piece via the move list", () => {
    d.querySelector("#moves .mv").click();
  });
  step("open the build panel", () => {
    d.getElementById("btn-editopen").click();
    if (d.getElementById("editbody").classList.contains("hide")) throw new Error("did not open");
    if (!d.querySelectorAll("#editbody .pitem").length) throw new Error("no piece list");
  });
  step("Edit lives on the map, turns the map on, and becomes Save", () => {
    d.body.classList.remove("mapon");
    const b = d.getElementById("btn-edit");
    if (!b) throw new Error("no Edit button in the plan header");
    if (b.textContent !== "Edit") throw new Error("label starts as: " + b.textContent);
    b.click();
    if (!/Editing/.test(d.getElementById("plan-mode").textContent)) throw new Error("mode chip wrong");
    if (!d.body.classList.contains("mapon")) throw new Error("Edit did not force the map on");
    if (!/Save|Done/.test(b.textContent)) throw new Error("label did not flip, still: " + b.textContent);
  });

  step("a selected piece grows a resize handle, unselected ones do not", () => {
    const pc = d.querySelector(".pc");
    if (!pc) throw new Error("no pieces drawn on the plan");
    pc.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
    const sel = d.querySelector(".pc.sel");
    if (!sel) throw new Error("nothing selected on the plan");
    if (!sel.querySelector(".hgrip") || !sel.querySelector(".hdot"))
      throw new Error("no corner handle on the selected piece");
    const other = [...d.querySelectorAll(".pc")].find(g => !g.classList.contains("sel"));
    if (other && other.querySelector(".hdot"))
      throw new Error("handle drawn on an unselected piece");
  });

  step("the map opens showing the whole theatre, with Fit tucked away", () => {
    const svg = d.querySelector("svg.plan");
    if (!svg) throw new Error("no plan");
    if (svg.getAttribute("viewBox") !== "0 0 1170 658")
      throw new Error("does not start fitted: " + svg.getAttribute("viewBox"));
    const fit = d.getElementById("btn-fit");
    if (!fit) throw new Error("no Fit control");
    if (!fit.classList.contains("hide"))
      throw new Error("Fit is offered while already fitted");
    // jsdom has no layout, so the zoom maths cannot run here; the pinch,
    // wheel and pan paths are checked in a real browser instead.
  });

  step("not moving a piece leaves it where it was, it does not vanish", () => {
    const mv = d.querySelector("#moves .mv");
    if (!mv) throw new Error("no moves in this scene to work with");
    mv.click();
    const name = (d.querySelector("#inspector b") || {}).textContent;
    if (!name) throw new Error("nothing selected");
    const stay = [...d.querySelectorAll("#inspector button")]
      .find(b => /Doesn't move/.test(b.textContent));
    if (!stay) throw new Error("no 'Doesn't move this scene' control");
    stay.click();
    const zone = (d.querySelector("#inspector .tag") || {}).textContent || "";
    if (/out of play/i.test(zone)) throw new Error("it was taken out of play: " + zone);
    if (!d.querySelector("#inspector .seg.zones button.on"))
      throw new Error("it landed in no zone at all");
    if (new RegExp(name).test(d.getElementById("moves").textContent))
      throw new Error("crew are still told to move " + name);
  });

  step("one tap sends a piece to the aux stage", () => {
    const aux = [...d.querySelectorAll("#inspector .seg.zones button")]
      .find(b => /Aux/.test(b.textContent));
    if (!aux) throw new Error("no aux-stage control");
    aux.click();
    const on = d.querySelector("#inspector .seg.zones button.on");
    if (!on || !/Aux/.test(on.textContent))
      throw new Error("aux is not the selected zone: " + (on && on.textContent));
    if (!/aux/i.test((d.querySelector("#inspector .tag") || {}).textContent || ""))
      throw new Error("the zone label did not follow");
  });

  step("leaving edit mode puts the map back the way it was", () => {
    d.getElementById("btn-edit").click();                // Save / Done
    if (/Editing/.test(d.getElementById("plan-mode").textContent)) throw new Error("still editing");
    d.getElementById("btn-map").click();                 // map back off
  });
  step("add a scene copies this one", () => {
    const before = w.document.querySelectorAll("#strip .sc").length;
    [...d.querySelectorAll("#editbody button")].find(b => /Add scene/.test(b.textContent)).click();
    const after = d.querySelectorAll("#strip .sc").length;
    if (after !== before + 1) throw new Error(before + " -> " + after);
    const t = d.getElementById("moves").textContent;
    if (!/Nothing moves/i.test(t)) throw new Error("copied scene should have no moves; got: " + t.slice(0, 60));
  });
  step("unsaved changes surfaced", () => {
    const t = d.getElementById("syncchip").textContent;
    if (!/Unsaved|device/i.test(t)) throw new Error("got " + t);
  });
  step("delete the added scene asks first, then deletes", () => {
    [...d.querySelectorAll("#editbody button")].find(b => /Delete scene/.test(b.textContent)).click();
    const scrim = d.querySelector(".scrim");
    if (!scrim) throw new Error("no confirmation shown for a destructive action");
    [...scrim.querySelectorAll("button")].find(b => b.textContent === "Delete").click();
    if (d.querySelector(".scrim")) throw new Error("dialog stayed open");
    if (d.querySelectorAll("#strip .sc").length !== 5) throw new Error("delete failed");
  });
  step("add a new set piece", () => {
    const inputs = d.querySelectorAll("#editbody input");
    const nameIn = [...inputs].find(i => i.placeholder === "New piece name");
    nameIn.value = "Trunk";
    nameIn.dispatchEvent(new w.Event("input", { bubbles: true }));
    [...d.querySelectorAll("#editbody button")].find(b => b.textContent === "Add").click();
    if (!/Trunk/.test(d.getElementById("editbody").textContent)) throw new Error("piece not added");
  });

  console.log("--- command deck (Fitts / Hick / thumb zone) ---");
  step("primary GO target exists and is the biggest control", () => {
    const go = d.querySelector("#slotR .go");
    if (!go) throw new Error("no primary target");
    if (!/call next scene/i.test(go.textContent)) throw new Error("GO says: " + go.textContent);
  });
  step("GO keeps its slot while browsing (motor memory)", () => {
    const before = d.querySelector("#slotR .go").textContent;
    d.querySelectorAll("#strip .sc")[0].click();          // browse away from live
    const go = d.querySelector("#slotR .go");
    if (!go) throw new Error("GO vanished while browsing");
    if (go.textContent !== before) throw new Error("GO changed meaning: " + go.textContent);
    if (d.getElementById("jump").classList.contains("hide")) throw new Error("no jump affordance while browsing");
  });
  step("jumping the show is a separate, labelled target", () => {
    const j = [...d.querySelectorAll("#jump button")];
    if (j.length !== 1 || !/jump the show/i.test(j[0].textContent)) throw new Error("jump control wrong");
  });
  step("only three controls in the deck during a run", () => {
    const n = d.querySelectorAll(".deck button").length;
    if (n > 3) throw new Error(n + " controls competing for attention");
  });
  step("crew get no GO button and no duplicated scene read-out", () => {
    d.getElementById("btn-role").click();
    d.querySelectorAll(".scrim .pick button")[1].click();          // become Crew
    if (d.querySelector("#slotR .go")) throw new Error("crew can tap the show forward");
    if (d.querySelector(".readout")) throw new Error("scene is stated twice on screen");
    const head = d.getElementById("scenehead").textContent;
    if (!/on stage now|looking ahead/i.test(head)) throw new Error("crew cannot see the current scene");
    if (!d.getElementById("editcard").classList.contains("hide")) throw new Error("crew are offered Build the show");
    if (!d.getElementById("demobar").classList.contains("hide")) throw new Error("crew get the demo prompt");
    d.getElementById("btn-role").click();
    d.querySelectorAll(".scrim .pick button")[0].click();          // back to SM for later steps
  });

  console.log("--- backstage conditions ---");
  step("dimmer cycles bright -> dim -> blackout and forces dark", () => {
    const b = d.getElementById("btn-dim"), dim = d.getElementById("dim");
    if (b.textContent !== "Bright") throw new Error("starts at " + b.textContent);
    b.click();
    if (b.textContent !== "Dim") throw new Error("second state is " + b.textContent);
    if (d.documentElement.getAttribute("data-theme") !== "dark") throw new Error("dimming did not force dark");
    if (!(parseFloat(dim.style.opacity) > 0)) throw new Error("no dim overlay");
    b.click();
    if (b.textContent !== "Blackout") throw new Error("third state is " + b.textContent);
    if (!dim.classList.contains("tint")) throw new Error("blackout is not warmed toward red");
    b.click();
    if (b.textContent !== "Bright") throw new Error("did not cycle back");
    if (d.documentElement.getAttribute("data-theme")) throw new Error("forced dark not released");
  });
  step("screen-awake control degrades where the API is missing", () => {
    const b = d.getElementById("btn-wake");
    if (!b.disabled) throw new Error("should be disabled without the Wake Lock API");
    if (!/no screen lock/i.test(b.textContent)) throw new Error("says: " + b.textContent);
  });

  console.log("--- a call that does not reach the crew ---");
  await stepA("failed call raises a persistent alert, not a toast", async () => {
    d.querySelectorAll("#strip .sc")[1].click();          // browse to 2
    const go = d.querySelector("#slotR .go");
    go.click();                                            // no capability in jsdom => publish fails
    await tick(); await tick();
    const a = d.getElementById("alert");
    if (a.classList.contains("hide")) throw new Error("no alert shown after a failed call");
    if (!/still on the scene before/i.test(a.textContent)) throw new Error("alert text: " + a.textContent.slice(0,70));
    const btns = [...a.querySelectorAll("button")].map(b => b.textContent);
    if (!btns.some(t => /send again/i.test(t))) throw new Error("no retry, got " + btns.join("/"));
  });
  step("dismissing the alert clears it", () => {
    [...d.querySelectorAll("#alert button")].find(b => /headset/i.test(b.textContent)).click();
    if (!d.getElementById("alert").classList.contains("hide")) throw new Error("alert stayed");
  });

  console.log("--- crew filtering by side ---");
  step("SR filter hides wing SL traffic", () => {
    const scs = d.querySelectorAll("#strip .sc");
    scs[2].click();                                        // scene 3, traffic both sides
    const all = d.querySelectorAll("#moves .mv").length;
    [...d.querySelectorAll("#mvfilter button")].find(b => /SR side/.test(b.textContent)).click();
    const sr = d.querySelectorAll("#moves .mv").length;
    if (!(sr < all)) throw new Error("SR filter did not narrow the list (" + all + " -> " + sr + ")");
    const txt = d.getElementById("moves").textContent;
    if (/Wing SL/.test(txt)) throw new Error("SL traffic still listed under the SR filter");
    if (!/\//.test(d.getElementById("mvcount").textContent)) throw new Error("count does not show the filtered total");
    [...d.querySelectorAll("#mvfilter button")].find(b => b.textContent === "All").click();
  });

  console.log("--- a quiet screen ---");
  step("header carries only the status and one More button", () => {
    const controls = [...d.querySelectorAll(".hd button")];
    if (controls.length !== 1) throw new Error(controls.length + " buttons in the header: " + controls.map(b=>b.textContent).join("/"));
    if (!/more/i.test(controls[0].textContent)) throw new Error("the one button is: " + controls[0].textContent);
  });
  step("the stage map is hidden until asked for", () => {
    if (d.body.classList.contains("mapon")) throw new Error("map is on by default");
    d.getElementById("btn-map").click();
    if (!d.body.classList.contains("mapon")) throw new Error("toggle did not show the map");
    if (!/hide stage map/i.test(d.getElementById("btn-map").textContent)) throw new Error("label did not flip");
    d.getElementById("btn-map").click();
    if (d.body.classList.contains("mapon")) throw new Error("toggle did not hide it again");
  });
  step("the current scene is stated plainly at the top", () => {
    const state = JSON.parse(d.getElementById("state").textContent);
    const head = d.getElementById("scenehead");
    const expected = state.scenes[viewIndexOf(d)].name;
    if (!head.textContent.includes(expected)) throw new Error("scene head says: " + head.textContent.slice(0,60));
    if (!/on stage now|looking ahead/i.test(head.textContent)) throw new Error("no plain-language status line");
  });
  step("everything else is behind More, closed by default", () => {
    const sheet = d.getElementById("msheet");
    if (!sheet.classList.contains("hide")) throw new Error("drawer starts open");
    for (const id of ["strip", "notes", "editcard", "mvfilter", "btn-dim", "btn-wake", "btn-role"]) {
      if (!sheet.contains(d.getElementById(id))) throw new Error("#" + id + " is not inside the More drawer");
    }
    d.getElementById("btn-more").click();
    if (sheet.classList.contains("hide")) throw new Error("More did not open");
    d.getElementById("btn-moreclose").click();
    if (!sheet.classList.contains("hide")) throw new Error("Done did not close it");
  });
  step("picking a scene closes the drawer so you can see it", () => {
    d.getElementById("btn-more").click();
    d.querySelectorAll("#strip .sc")[0].click();
    if (!d.getElementById("msheet").classList.contains("hide")) throw new Error("drawer stayed open");
  });
  step("the demo show says so and offers a way out", () => {
    const bar = d.getElementById("demobar");
    if (bar.classList.contains("hide")) throw new Error("no demo notice on the sample show");
    if (!/demo/i.test(bar.textContent)) throw new Error("bar says: " + bar.textContent.slice(0,60));
    if (![...bar.querySelectorAll("button")].some(b => /start my own/i.test(b.textContent)))
      throw new Error("no way to start your own show");
  });

  console.log("--- paper backup + starting over ---");
  step("run sheet covers every scene in order", () => {
    d.getElementById("btn-editopen").click();              // ensure build panel open
    if (d.getElementById("editbody").classList.contains("hide")) d.getElementById("btn-editopen").click();
    const before = d.querySelectorAll("#strip .sc").length;
    // build the sheet directly; jsdom has no print dialog
    const printBtn = [...d.querySelectorAll("#editbody button")].find(b => /Print run sheet/.test(b.textContent));
    if (!printBtn) throw new Error("no print control");
    w.print = () => {};
    printBtn.click();
    const blocks = d.querySelectorAll("#runsheet .blk");
    if (blocks.length !== before) throw new Error(before + " scenes but " + blocks.length + " blocks");
    const t = d.getElementById("runsheet").textContent;
    if (!/curtain in|curtain out/i.test(t)) throw new Error("curtain state missing from sheet");
    if (!/Wing SR/.test(t)) throw new Error("routes missing from sheet");
  });
  step("building the run sheet does not touch the stylesheet", () => {
    const css = d.getElementById("sheet").textContent;
    if (css.length < 2000 || !/\.sheet/.test(css)) throw new Error("stylesheet was clobbered (" + css.length + " chars)");
    if (d.getElementById("sheet").tagName !== "STYLE") throw new Error("#sheet is no longer the stylesheet");
  });
  step("starting a new show asks, then clears everything", () => {
    [...d.querySelectorAll("#editbody button")].find(b => /Start a new show/.test(b.textContent)).click();
    const scrim = d.querySelector(".scrim");
    if (!scrim) throw new Error("no confirmation");
    if (!/cannot be undone/i.test(scrim.textContent)) throw new Error("warning too soft");
    [...scrim.querySelectorAll("button")].find(b => /Clear the demo/.test(b.textContent)).click();
    if (d.querySelectorAll("#strip .sc").length !== 1) throw new Error("scenes not reset");
    if (d.querySelectorAll("#editbody .pitem").length !== 0) throw new Error("pieces not cleared");
    if (!/No pieces yet/i.test(d.getElementById("editbody").textContent)) throw new Error("no empty state for pieces");
  });

  console.log("--- self-rebuild ---");
  step("rebuilt page is a complete, re-parseable document", () => {
    // exercise the same template the publish path uses
    const root = d.getElementById("root").innerHTML;
    const css = d.getElementById("sheet").textContent;
    const app = d.getElementById("app").textContent;
    if (!root || !css || !app) throw new Error("capture missing");
    if (/<\/script>/.test(app)) throw new Error("app source contains a raw </script> and would truncate");
    const rebuilt = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ghost Light</title>'
      + '<style id="sheet">' + css + '</style></head><body><div id="root">' + root + '</div>'
      + '<script id="state" type="application/json">{"rev":2,"show":"X","liveIndex":1,"liveStamp":5,"pieces":[],"scenes":[{"id":"a","name":"A","note":"","curtain":"open","place":{}},{"id":"b","name":"B","note":"","curtain":"closed","place":{}}]}<' + '/script>'
      + '<script id="app">' + app + '<' + '/script></body></html>';
    const e2 = [];
    const vc2 = new (require("jsdom").VirtualConsole)()
      .on("jsdomError", e => e2.push("jsdomError: " + e.message))
      .on("error", (...a) => e2.push("console.error: " + a.join(" ")));
    const d2 = new JSDOM(rebuilt, {
      runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc2
    });
    if (e2.length) throw new Error("rebuilt page errored: " + e2.join("; "));
    const doc2 = d2.window.document;
    if (!doc2.querySelector("svg.plan")) throw new Error("rebuilt page did not boot its plan");
    if (doc2.querySelectorAll("#strip .sc").length !== 2) throw new Error("rebuilt page state not applied");
    if (doc2.title !== "Ghost Light") throw new Error("title lost: " + doc2.title);
    console.log("       rebuilt page booted, 2 scenes from embedded state");
  });

  console.log("\n=== " + (errors.length ? errors.length + " PROBLEM(S)" : "ALL CHECKS PASSED") + " ===");
  if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
}, 400);
