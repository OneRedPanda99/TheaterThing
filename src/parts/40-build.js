/* ===============================================================
   Build mode — where the stage manager makes the show.

   A separate screen, not a mode bleeding through the run screen.
   The plan fills it, the scenes run along the top, the set pieces
   run along the bottom, and a tapped piece opens a popover over
   the spot it is in. Nothing is nested more than one tap deep.
   =============================================================== */

function setMode(m){
  if(m === "build" && !isSM()){ toast("Only the stage manager can build the show."); return; }
  mode = m;
  selected = null;
  hidePop();
  render();
  /* The pane under the plan changes size between the two screens, so
     the map has to be re-clamped to the box it now has. */
  applyPanes();
  refit();
}

/* ---------------- scenes along the top ---------------- */
function paintSceneBar(){
  var bar = $("scenebar");
  if(mode !== "build"){ bar.innerHTML = ""; return; }
  bar.innerHTML = "";
  S.scenes.forEach(function(sc, i){
    var b = ele("button", "chip" + (i === viewIdx ? " cur" : "") + (i === S.liveIndex ? " live" : ""));
    b.appendChild(ele("div", "n", (i+1) + (i === S.liveIndex ? " · LIVE" : "")));
    b.appendChild(ele("div", "t", sc.name + (i === viewIdx ? "  ▾" : "")));
    b.addEventListener("click", function(){
      /* Tapping another scene goes to it. Tapping the one you are
         already on opens its details — one chip, two obvious jobs. */
      if(i === viewIdx){ sceneSheet(); return; }
      viewIdx = i; browsing = i !== S.liveIndex; selected = null; render();
    });
    bar.appendChild(b);
  });
  var add = ele("button", "chip add", "+");
  add.title = "Add a scene after this one";
  add.addEventListener("click", addSceneAfter);
  bar.appendChild(add);
  /* A show with a dozen scenes scrolls this bar off the end. Keep the
     one you are on in view, or switching scenes near the end of act 2
     means scrolling back every time the bar repaints. */
  var cur = bar.querySelector(".chip.cur");
  if(cur && cur.scrollIntoView) try{
    cur.scrollIntoView({ block:"nearest", inline:"center" });
  }catch(e){ /* older Safari: the default is fine */ }
}

function addSceneAfter(){
  var base = sceneAt(viewIdx);
  S.scenes.splice(viewIdx+1, 0, {
    id: "s" + Date.now(), name: "New scene", note: "",
    curtain: base ? base.curtain : "open",
    place: base ? JSON.parse(JSON.stringify(base.place)) : {}
  });
  if(S.liveIndex > viewIdx) S.liveIndex++;
  viewIdx += 1; browsing = viewIdx !== S.liveIndex;
  markDirty(); render();
  toast("Copied from the scene before it. Move what changes.");
}
function moveScene(dir){
  var j = viewIdx + dir;
  if(j < 0 || j >= S.scenes.length) return;
  var liveId = (S.scenes[S.liveIndex] || {}).id;
  var tmp = S.scenes[viewIdx]; S.scenes[viewIdx] = S.scenes[j]; S.scenes[j] = tmp;
  viewIdx = j;
  for(var k=0;k<S.scenes.length;k++) if(S.scenes[k].id === liveId) S.liveIndex = k;
  browsing = viewIdx !== S.liveIndex;
  markDirty(); render();
}

/* ---------------- the scene you are editing ----------------
   Name, curtain and note, in reach without opening anything. These
   are what a stage manager changes on nearly every pass, and burying
   them behind a modal was most of what made building feel like work.
   The chip's own sheet keeps the rarer, riskier ones — reorder and
   delete. */
function paintSceneStrip(){
  var strip = $("scenestrip");
  if(mode !== "build"){ strip.innerHTML = ""; return; }
  var sc = sceneAt(viewIdx);
  strip.innerHTML = "";
  if(!sc) return;

  var nm = document.createElement("input");
  nm.type = "text"; nm.value = sc.name; nm.placeholder = "Name this scene";
  nm.setAttribute("aria-label", "Scene name");
  nm.addEventListener("input", function(){
    sc.name = nm.value; markDirty(); paintSceneBar(); paintDeck();
  });
  strip.appendChild(nm);

  var seg = ele("div", "seg");
  [["Curtain out","open"],["Curtain in","closed"]].forEach(function(o){
    var b = ele("button", (sc.curtain||"open") === o[1] ? "on" : null, o[0]);
    b.addEventListener("click", function(){ sc.curtain = o[1]; markDirty(); render(); });
    seg.appendChild(b);
  });
  strip.appendChild(seg);

  var note = document.createElement("input");
  note.type = "text"; note.className = "note";
  note.value = sc.note || "";
  note.placeholder = "What the crew needs to know for this scene";
  note.setAttribute("aria-label", "Scene note");
  note.addEventListener("input", function(){ sc.note = note.value; markDirty(); });
  strip.appendChild(note);
  /* Reorder and delete are rarer and riskier, so they stay one tap in. */
  strip.appendChild(mkbtn("More…", "btn sm", sceneSheet));
}

/* ---------------- set pieces along the bottom ---------------- */
function paintTray(){
  var tray = $("tray");
  if(mode !== "build"){ tray.innerHTML = ""; return; }
  tray.innerHTML = "";
  var sc = sceneAt(viewIdx);
  S.pieces.forEach(function(p){
    var inScene = !!(sc && sc.place[p.id]);
    var b = ele("button", "pchip" + (inScene ? "" : " out") + (selected === p.id ? " sel" : ""));
    var sw = ele("div", "sw"); sw.style.background = p.color;
    b.appendChild(sw);
    b.appendChild(document.createTextNode(p.name));
    b.title = inScene ? "Select on the plan" : "Bring into this scene";
    b.addEventListener("click", function(){
      selected = p.id;
      if(!inScene) leaveAsWas();
      else render();
    });
    tray.appendChild(b);
  });
  var add = ele("button", "pchip add", "+ New piece");
  add.addEventListener("click", newPieceSheet);
  tray.appendChild(add);
}

function newPieceSheet(){
  var name = "", w = "", h = "";
  modal("Add a set piece", function(body, close){
    body.appendChild(ele("div", "help",
      "Size is a rough footprint on the plan. Drop it in, then drag its corner to match the real thing."));
    var r1 = ele("div", "row");
    var l1 = ele("label", "f"); l1.appendChild(ele("span", null, "Name"));
    var i1 = document.createElement("input"); i1.type = "text"; i1.placeholder = "Kitchen table";
    l1.appendChild(i1); r1.appendChild(l1); body.appendChild(r1);
    var r2 = ele("div", "row");
    [["Width", 80], ["Depth", 45]].forEach(function(o){
      var l = ele("label", "f"); l.appendChild(ele("span", null, o[0]));
      var i = document.createElement("input"); i.type = "text"; i.inputMode = "numeric";
      i.placeholder = String(o[1]); i.dataset.k = o[0];
      l.appendChild(i); r2.appendChild(l);
    });
    body.appendChild(r2);
    var r3 = ele("div", "row"); r3.style.marginTop = "14px";
    r3.appendChild(mkbtn("Cancel", "btn", close));
    r3.appendChild(mkbtn("Add piece", "btn on", function(){
      name = i1.value.trim();
      if(!name){ toast("Give the piece a name first."); i1.focus(); return; }
      var ins = r2.querySelectorAll("input");
      w = clampSz(parseInt(ins[0].value, 10) || 80);
      h = clampSz(parseInt(ins[1].value, 10) || 45);
      var p = { id:"p"+Date.now(), name:name, w:w, h:h,
                color: PALETTE[S.pieces.length % PALETTE.length] };
      S.pieces.push(p);
      var sc = sceneAt(viewIdx);
      if(sc) sc.place[p.id] = { zone:"wingSR", x:0.5, y:0.5, r:0, note:"" };
      selected = p.id;
      close(); markDirty(); render();
      toast("Parked in wing SR. Drag it where it lives.");
    }));
    body.appendChild(r3);
    setTimeout(function(){ i1.focus(); }, 30);
  });
}

/* ---------------- the piece popover ---------------- */
function hidePop(){ $("pophost").innerHTML = ""; }

function paintPop(){
  var host = $("pophost");
  host.innerHTML = "";
  if(mode !== "build" || !selected) return;
  var sc = sceneAt(viewIdx), p = pieceById(selected);
  if(!p){ selected = null; return; }
  var pl = sc ? sc.place[selected] : null;

  var pop = ele("div", "pop");
  var hd = ele("div", "hd");
  var sw = ele("div", "sw"); sw.style.background = p.color;
  hd.appendChild(sw);
  hd.appendChild(ele("b", null, p.name));
  hd.appendChild(ele("span", "tag", zoneLabel(pl)));
  hd.appendChild(mkbtn("✕", "btn sm", function(){ selected = null; render(); }));
  pop.appendChild(hd);

  /* Send it somewhere without dragging. On a phone this is the fast
     path: the director says "put the bench on the aux stage" and it
     is one tap, not a drag across a zoomed map. */
  var seg = ele("div", "seg");
  [["stage","Stage"],["wingSR","Wing SR"],["wingSL","Wing SL"],["aux","Aux"]].forEach(function(o){
    var b = ele("button", pl && pl.zone === o[0] ? "on" : null, o[1]);
    b.addEventListener("click", function(){ sendToZone(o[0]); });
    seg.appendChild(b);
  });
  pop.appendChild(seg);

  var rn = ele("div", "row");
  var ln = ele("label", "f"); ln.appendChild(ele("span", null, "Note for the crew"));
  var inp = document.createElement("input"); inp.type = "text";
  inp.value = pl ? (pl.note || "") : "";
  inp.placeholder = "upstage of leg 2";
  inp.disabled = !pl;
  inp.addEventListener("input", function(){ if(pl){ pl.note = inp.value; markDirty(); } });
  ln.appendChild(inp); rn.appendChild(ln); pop.appendChild(rn);

  var r2 = ele("div", "row");
  if(pl){
    r2.appendChild(mkbtn(pl.r ? "Turn upright" : "Turn 90°", "btn sm", function(){
      pl.r = pl.r ? 0 : 90; markDirty(); render();
    }));
    /* Not "take it out of play" — a piece sitting in a wing is still
       in the show, it just does not move for this scene. Inheriting
       the previous placement is what makes the diff produce no move
       at all, which is the thing the crew actually wants. */
    r2.appendChild(mkbtn("Same as last scene", "btn sm", leaveAsWas));
    r2.appendChild(mkbtn("Off for this scene", "btn sm hot", function(){
      delete sc.place[selected]; markDirty(); render();
      toast("Struck. The crew will be told to take it off.");
    }));
  } else {
    r2.appendChild(mkbtn("Bring into this scene", "btn on", leaveAsWas));
  }
  pop.appendChild(r2);
  host.appendChild(pop);
  placePop(pop);
}

/* Sit the popover beside the piece, inside the stage, without ever
   covering the piece it describes. */
function placePop(pop){
  var host = $("pophost");
  if(!host.getBoundingClientRect || !nodes[selected]) return;
  var H = host.getBoundingClientRect();
  if(!H.width || !H.height) return;
  var g = nodes[selected].getBoundingClientRect();
  var pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 220;
  var pad = 10;
  var x = g.left - H.left + g.width/2 - pw/2;
  var y = g.bottom - H.top + pad;
  if(y + ph > H.height - pad) y = g.top - H.top - ph - pad;   // flip above
  pop.style.left = Math.max(pad, Math.min(H.width - pw - pad, x)) + "px";
  pop.style.top  = Math.max(pad, Math.min(H.height - ph - pad, y)) + "px";
}

function sendToZone(zid){
  var sc = sceneAt(viewIdx); if(!sc || !selected) return;
  var cur = sc.place[selected] || { r:0, note:"" };
  sc.place[selected] = { zone:zid, x:0.5, y:0.5, r:cur.r||0, note:cur.note||"" };
  markDirty(); render();
}
function leaveAsWas(){
  var sc = sceneAt(viewIdx), prev = sceneAt(viewIdx-1);
  if(!sc || !selected) return;
  var src = prev && prev.place[selected];
  if(src){
    sc.place[selected] = { zone:src.zone, x:src.x, y:src.y, r:src.r||0, note:src.note||"" };
    toast("Stays where it was in “" + prev.name + "” — no move for the crew.");
  } else {
    sc.place[selected] = { zone:"wingSR", x:0.5, y:0.5, r:0, note:"" };
    toast("Nothing earlier to follow — parked in wing SR.");
  }
  markDirty(); render();
}

/* ---------------- scene details ---------------- */
function sceneSheet(){
  var sc = sceneAt(viewIdx);
  if(!sc) return;
  modal("Scene " + (viewIdx+1), function(body, close){
    var r1 = ele("div", "row");
    var l1 = ele("label", "f"); l1.appendChild(ele("span", null, "Name"));
    var i1 = document.createElement("input"); i1.type = "text"; i1.value = sc.name;
    i1.addEventListener("input", function(){ sc.name = i1.value; markDirty(); paintSceneBar(); paintDeck(); });
    l1.appendChild(i1); r1.appendChild(l1); body.appendChild(r1);

    var r2 = ele("div", "row");
    var seg = ele("div", "seg");
    [["Curtain out","open"],["Curtain in","closed"]].forEach(function(o){
      var b = ele("button", (sc.curtain||"open") === o[1] ? "on" : null, o[0]);
      b.addEventListener("click", function(){ sc.curtain = o[1]; markDirty(); render(); close(); sceneSheet(); });
      seg.appendChild(b);
    });
    r2.appendChild(seg); body.appendChild(r2);

    var r3 = ele("div", "row");
    var l3 = ele("label", "f"); l3.appendChild(ele("span", null, "What the crew needs to know"));
    var ta = document.createElement("textarea");
    ta.value = sc.note || "";
    ta.placeholder = "Blackout change, 40 seconds. Kitchen strikes to wing SR.";
    ta.addEventListener("input", function(){ sc.note = ta.value; markDirty(); });
    l3.appendChild(ta); r3.appendChild(l3); body.appendChild(r3);

    var r4 = ele("div", "row"); r4.style.marginTop = "14px";
    r4.appendChild(mkbtn("Move earlier", "btn sm", function(){ moveScene(-1); close(); }));
    r4.appendChild(mkbtn("Move later", "btn sm", function(){ moveScene(1); close(); }));
    body.appendChild(r4);

    var r5 = ele("div", "row");
    r5.appendChild(mkbtn("Delete this scene", "btn sm hot", function(){
      if(S.scenes.length <= 1){ toast("Keep at least one scene."); return; }
      close();
      confirmAsk("Delete scene " + (viewIdx+1) + "?",
        sc.name + " and its placements are removed. This cannot be undone.", function(){
          S.scenes.splice(viewIdx, 1);
          if(S.liveIndex >= S.scenes.length) S.liveIndex = S.scenes.length-1;
          viewIdx = Math.min(viewIdx, S.scenes.length-1);
          browsing = viewIdx !== S.liveIndex; selected = null;
          markDirty(); render();
        });
    }));
    r5.appendChild(mkbtn("Done", "btn on", close));
    body.appendChild(r5);
  });
}

/* ---------------- setup ----------------
   Everything that is about this device or this production, and
   nothing that is about the running show. One flat list. */
function setupSheet(){
  modal("Setup", function(body, close){
    var s1 = ele("div", "sect");
    s1.appendChild(ele("span", "tag", "This device"));
    var rr = ele("div", "row");
    rr.appendChild(mkbtn(isSM() ? "Stage manager" : "Crew", "btn", function(){ close(); askRole(true); }));
    /* These three toggle in place. Closing and reopening the sheet to
       show a new label flashes the screen, which is the last thing you
       want from the control you reach for in the dark. */
    var db = mkbtn(DIMS[dimIdx].label, "btn", function(){
      dimIdx = (dimIdx+1) % DIMS.length; LS.set("dim", dimIdx); applyDim();
      db.textContent = DIMS[dimIdx].label;
      db.classList.toggle("on", dimIdx > 0);
    });
    db.classList.toggle("on", dimIdx > 0);
    rr.appendChild(db);
    var wb = mkbtn(!wakeOk ? "No screen lock" : (wakeWanted ? "Screen stays on" : "Screen sleeps"),
      "btn" + (wakeWanted ? " on" : ""), function(){
        wakeWanted = !wakeWanted; LS.set("wake", wakeWanted); applyWake();
        wb.textContent = wakeWanted ? "Screen stays on" : "Screen sleeps";
        wb.classList.toggle("on", wakeWanted);
      });
    wb.disabled = !wakeOk;
    rr.appendChild(wb);
    s1.appendChild(rr);
    s1.appendChild(ele("div", "help",
      "Brightness dims this screen only, so a phone in the wings does not spill light into the house."));
    body.appendChild(s1);

    if(isSM()){
      var s2 = ele("div", "sect");
      s2.appendChild(ele("span", "tag", "The show"));
      var r2 = ele("div", "row");
      var l2 = ele("label", "f"); l2.appendChild(ele("span", null, "Production"));
      var i2 = document.createElement("input"); i2.type = "text"; i2.value = S.show;
      i2.addEventListener("input", function(){
        S.show = i2.value; markDirty(); $("showname").textContent = S.show;
      });
      l2.appendChild(i2); r2.appendChild(l2); s2.appendChild(r2);
      var r3 = ele("div", "row");
      r3.appendChild(mkbtn("Build the show", "btn on", function(){ close(); setMode("build"); }));
      r3.appendChild(mkbtn("Print run sheet", "btn", function(){
        buildSheet(); close();
        setTimeout(function(){ window.print(); }, 60);
      }));
      s2.appendChild(r3);
      var r4 = ele("div", "row");
      r4.appendChild(mkbtn("Start a new show", "btn hot", function(){ close(); startNewShow(); }));
      s2.appendChild(r4);
      s2.appendChild(ele("div", "help",
        "The run sheet is the paper backup. Theatre wifi is not a plan."));
      body.appendChild(s2);

      var s3 = ele("div", "sect");
      s3.appendChild(ele("span", "tag", "Set pieces (" + S.pieces.length + ")"));
      var list = ele("div", "plist");
      if(!S.pieces.length) list.appendChild(ele("div", "help", "None yet. Add them in Build."));
      S.pieces.forEach(function(p){
        var it = ele("div", "pitem");
        var sw = ele("div", "sw"); sw.style.background = p.color;
        it.appendChild(sw);
        it.appendChild(ele("div", "nm", p.name));
        it.appendChild(mkbtn("Delete", "btn sm hot", function(){
          close();
          confirmAsk("Remove " + p.name + "?", "It is taken out of every scene in the show.", function(){
            S.pieces = S.pieces.filter(function(q){ return q.id !== p.id; });
            S.scenes.forEach(function(s){ delete s.place[p.id]; });
            if(selected === p.id) selected = null;
            markDirty(); render();
          });
        }));
        list.appendChild(it);
      });
      s3.appendChild(list);
      body.appendChild(s3);
    }

    var done = ele("div", "sect");
    done.appendChild(mkbtn("Done", "btn on wide", close));
    body.appendChild(done);
  }, true);
}

function startNewShow(){
  confirmAsk("Start your own show?",
    "Everything in the current show is cleared so you can build your own. This cannot be undone.",
    function(){
      S = { rev:S.rev, show:"My show", demo:false, liveIndex:0, liveStamp:Date.now(),
            pieces:[], scenes:[{ id:"s"+Date.now(), name:"Preshow", note:"", curtain:"closed", place:{} }] };
      viewIdx = 0; browsing = false; selected = null; callFail = null;
      markDirty(); setMode("build");
      toast("Empty show ready. Add your set pieces from the tray.");
    }, "Clear it", "Cancel");
}

/* ---------------- run sheet (paper backup) ---------------- */
function buildSheet(){
  var el = $("runsheet"); el.innerHTML = "";   // never $("sheet") — that is the stylesheet
  var h = ele("h1", null, S.show);
  var meta = ele("div", "meta", "Set change run sheet · " + S.scenes.length + " scenes · "
    + S.pieces.length + " pieces · printed " + new Date().toLocaleDateString());
  el.appendChild(h); el.appendChild(meta);

  S.scenes.forEach(function(sc, i){
    var blk = ele("div", "blk");
    var hd = ele("div", "hd2");
    hd.appendChild(ele("span", "no", (i+1) + "."));
    hd.appendChild(ele("span", "nmx", sc.name));
    hd.appendChild(ele("span", "cur", sc.curtain === "closed" ? "curtain in" : "curtain out"));
    blk.appendChild(hd);
    if(sc.note) blk.appendChild(ele("div", "nt", sc.note));

    var moves = movesBetween(sceneAt(i-1), sc);
    if(!moves.length){
      blk.appendChild(ele("div", "none", i === 0 ? "Preset — see placements below." : "No change."));
    } else {
      var ol = document.createElement("ol");
      moves.forEach(function(m){
        var li = document.createElement("li");
        if(m.kind === "curtain"){ li.textContent = m.text + " — " + m.sub; ol.appendChild(li); return; }
        var path = (m.from ? zoneLabel(m.from) : "off");
        if(m.r && m.r.via.length) path += " → " + m.r.via.join(" → ");
        path += " → " + (m.to ? zoneLabel(m.to) : "out of play");
        li.textContent = VERB[m.kind] + " " + m.piece.name + ": " + path
          + (m.to && m.to.note ? "  (" + m.to.note + ")" : "");
        ol.appendChild(li);
      });
      blk.appendChild(ol);
    }
    if(i === 0){
      var ol2 = document.createElement("ol");
      S.pieces.forEach(function(p){
        var pl = sc.place[p.id]; if(!pl) return;
        ol2.appendChild(ele("li", null, p.name + ": " + zoneLabel(pl)
          + (pl.note ? "  (" + pl.note + ")" : "")));
      });
      if(ol2.children.length) blk.appendChild(ol2);
    }
    el.appendChild(blk);
  });
}

/* ---------------- modals ---------------- */
function modal(title, fill, flush){
  var open = document.querySelector(".scrim");
  if(open) open.remove();                    // never stack two scrims
  var scrim = ele("div", "scrim");
  var m = ele("div", "modal");
  if(flush) m.style.padding = "0";
  var h = ele("h3", null, title);
  if(flush) h.style.cssText = "padding:18px 16px 0";
  m.appendChild(h);
  function close(){ if(scrim.parentNode) scrim.remove(); }
  var body = ele("div");
  if(!flush) body.style.marginTop = "12px";
  m.appendChild(body);
  fill(body, close);
  scrim.appendChild(m);
  scrim.addEventListener("click", function(e){ if(e.target === scrim) close(); });
  document.body.appendChild(scrim);
  return close;
}
function confirmAsk(title, bodyText, onYes, yesLabel, noLabel){
  modal(title, function(body, close){
    body.appendChild(ele("div", "help", bodyText));
    var r = ele("div", "row"); r.style.marginTop = "16px";
    r.appendChild(mkbtn(noLabel || "Keep it", "btn", close));
    var yes = mkbtn(yesLabel || "Delete", "btn hot", function(){ close(); onYes(); });
    r.appendChild(yes);
    body.appendChild(r);
    setTimeout(function(){ yes.previousSibling && yes.previousSibling.focus(); }, 20);
  });
}
function askRole(force){
  if(role && !force) return;
  modal("Who is on this device?", function(body, close){
    body.appendChild(ele("div", "help",
      "The stage manager and director build the show and call the scenes. Everyone else follows along."));
    var pick = ele("div", "pick");
    function opt(title, sub, val){
      var b = ele("button");
      b.appendChild(ele("b", null, title));
      b.appendChild(ele("span", null, sub));
      b.addEventListener("click", function(){
        role = val; LS.set("role", role);
        if(!isSM() && mode === "build") mode = "run";
        close(); render();
      });
      pick.appendChild(b);
    }
    opt("Stage manager or director", "Build scenes, place pieces, call the show.", "sm");
    opt("Crew", "Follow the called scene and see what moves where.", "crew");
    body.appendChild(pick);
    if(force){
      var r = ele("div", "row"); r.style.marginTop = "14px";
      r.appendChild(mkbtn("Cancel", "btn", close));
      body.appendChild(r);
    }
  });
}
