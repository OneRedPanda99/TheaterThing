/* ===============================================================
   Build mode — where the stage manager makes the show.

   A separate screen, not a mode bleeding through the run screen.
   The plan fills it, the scenes run along the top, the set pieces
   run along the bottom, and a tapped piece opens its inspector in
   between. Nothing is nested more than one tap deep.
   =============================================================== */

function setMode(m){
  if(m === "build" && !isSM()){ toast("Only the stage manager can build the show."); return; }
  mode = m;
  selected = null;
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
  var copy = { id: "s" + Date.now(), name: "New scene", note: "",
               place: base ? JSON.parse(JSON.stringify(base.place)) : {} };
  /* Every line set, not just the main one. Copying one and defaulting
     the rest to open meant a new scene silently called the mid curtain
     and the scrim back out. */
  CURTAINS.forEach(function(c){ copy[c.key] = curtainAt(base, c.key); });
  S.scenes.splice(viewIdx+1, 0, copy);
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
/* Folded away, it is a single chevron and the map takes the room back.
   Nothing is lost while it is shut: the scene chips above still name
   the scene you are on. Remembered per device, because someone who
   wants it out of the way wants it out of the way tomorrow too. */
var stripOpen = LS.get("strip", true);

function paintSceneStrip(){
  var strip = $("scenestrip");
  if(mode !== "build"){ strip.innerHTML = ""; return; }
  var sc = sceneAt(viewIdx);
  strip.innerHTML = "";
  strip.classList.toggle("shut", !stripOpen);
  if(!sc) return;

  if(stripOpen){
    var nm = document.createElement("input");
    nm.type = "text"; nm.value = sc.name; nm.placeholder = "Name this scene";
    nm.setAttribute("aria-label", "Scene name");
    nm.addEventListener("input", function(){
      sc.name = nm.value; markDirty(); paintSceneBar(); paintDeck();
    });
    strip.appendChild(nm);

    strip.appendChild(curtainSeg(sc));

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

  var fold = mkbtn(stripOpen ? "▴" : "▾", "btn sm fold", function(){
    stripOpen = !stripOpen;
    LS.set("strip", stripOpen);
    render();
  });
  fold.title = stripOpen ? "Hide the scene row" : "Show the scene row";
  fold.setAttribute("aria-label", fold.title);
  fold.setAttribute("aria-expanded", stripOpen ? "true" : "false");
  strip.appendChild(fold);
}

/* One control for all three line sets. Each button says which curtain
   it is and what state it is in, and tapping it flips that one — a
   segmented control with a name and a state is self-describing, where
   a row of lit and unlit names leaves you guessing which way round it
   reads in the dark. */
function curtainSeg(sc){
  var seg = ele("div", "seg curtains");
  CURTAINS.forEach(function(c){
    var open = curtainAt(sc, c.key) === "open";
    var b = ele("button", open ? null : "on");
    b.appendChild(ele("span", "cn", c.short));
    b.appendChild(ele("span", "cs", open ? "open" : "closed"));
    b.title = c.name + " is " + (open ? "open" : "closed");
    b.addEventListener("click", function(){
      sc[c.key] = open ? "closed" : "open";
      markDirty(); render();
    });
    seg.appendChild(b);
  });
  return seg;
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
      "Its footprint on the deck, in feet. 6, 6' and 6' 3\" all work; a bare "
      + "number is feet. Measured against a " + fmtFeet(stageFeet()) + " wide stage."));
    var r1 = ele("div", "row");
    var l1 = ele("label", "f"); l1.appendChild(ele("span", null, "Name"));
    var i1 = document.createElement("input"); i1.type = "text"; i1.placeholder = "Kitchen table";
    l1.appendChild(i1); r1.appendChild(l1); body.appendChild(r1);
    var r2 = ele("div", "row");
    [["Width", "5'"], ["Depth", "3'"]].forEach(function(o){
      var l = ele("label", "f"); l.appendChild(ele("span", null, o[0]));
      var i = document.createElement("input"); i.type = "text"; i.inputMode = "decimal";
      i.placeholder = o[1];
      l.appendChild(i); r2.appendChild(l);
    });
    body.appendChild(r2);
    var r3 = ele("div", "row"); r3.style.marginTop = "14px";
    r3.appendChild(mkbtn("Cancel", "btn", close));
    r3.appendChild(mkbtn("Add piece", "btn on", function(){
      name = i1.value.trim();
      if(!name){ toast("Give the piece a name first."); i1.focus(); return; }
      var ins = r2.querySelectorAll("input");
      var wf = parseFeet(ins[0].value), hf = parseFeet(ins[1].value);
      w = clampSz(toUnits(wf === null ? 5 : wf));
      h = clampSz(toUnits(hf === null ? 3 : hf));
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

/* ---------------- the piece menu ----------------
   Opened from the small handle beside a selected piece, and shown as
   a sheet over everything. It was tried two other ways first: floated
   next to the piece, where the form was taller than the strip of map
   it covered; and docked under the plan, where it shrank the map every
   time you touched a piece. Both were worse than a sheet you asked for
   and can dismiss, which costs the map nothing until you open it. */
function pieceMenu(){
  var sc = sceneAt(viewIdx), p = pieceById(selected);
  if(!p) return;
  var pl = sc ? sc.place[selected] : null;

  modal(p.name, function(body, close){
    var pop = ele("div", "insp");

    var hd = ele("div", "hd");
    var sw = ele("div", "sw"); sw.style.background = p.color;
    hd.appendChild(sw);
    hd.appendChild(ele("span", "tag", zoneLabel(pl)));
    pop.appendChild(hd);

    /* Send it somewhere without dragging. On a phone this is the fast
       path: the director says "put the bench on the aux stage" and it
       is one tap, not a drag across a zoomed map. */
    var seg = ele("div", "seg");
    [["stage","Stage"],["wingSR","Wing SR"],["wingSL","Wing SL"],["aux","Aux"]].forEach(function(o){
      var b = ele("button", pl && pl.zone === o[0] ? "on" : null, o[1]);
      b.addEventListener("click", function(){ sendToZone(o[0]); close(); pieceMenu(); });
      seg.appendChild(b);
    });
    pop.appendChild(seg);

    if(pl){
      var rn = ele("div", "row notebox");
      var ln = ele("label", "f"); ln.appendChild(ele("span", null, "Note for the crew"));
      var inp = document.createElement("input"); inp.type = "text";
      inp.value = pl.note || "";
      inp.placeholder = "upstage of leg 2";
      inp.addEventListener("input", function(){ pl.note = inp.value; markDirty(); });
      ln.appendChild(inp); rn.appendChild(ln); pop.appendChild(rn);
    }

    /* Size is typed, not dragged: a resize handle on the plan sits right
       where a thumb lands, and a set piece that quietly changed size was
       the thing that kept going wrong.

       A size belongs to the piece, not to this placement — a sofa is one
       sofa in every scene — so a change here changes it everywhere, on
       purpose. The angle belongs to the placement, because the same sofa
       genuinely does face different ways in different scenes. */
    var rs = ele("div", "row");
    [["Width","w"],["Depth","h"]].forEach(function(o){
      var l = ele("label", "f size"); l.appendChild(ele("span", null, o[0]));
      var i = document.createElement("input");
      i.type = "text"; i.inputMode = "decimal";
      i.value = fmtFeet(toFeet(p[o[1]]));
      i.addEventListener("change", function(){
        var ft = parseFeet(i.value);
        if(ft === null){ i.value = fmtFeet(toFeet(p[o[1]])); return; }
        p[o[1]] = clampSz(toUnits(ft));
        i.value = fmtFeet(toFeet(p[o[1]]));      // show the clamped value back
        markDirty(); drawPieces(sceneAt(viewIdx));
      });
      l.appendChild(i); rs.appendChild(l);
    });
    if(pl){
      var lt = ele("label", "f size"); lt.appendChild(ele("span", null, "Turn"));
      var it = document.createElement("input");
      it.type = "text"; it.inputMode = "numeric";
      it.value = normAngle(pl.r || 0) + "°";
      it.addEventListener("change", function(){
        var m = String(it.value).match(/-?[0-9.]+/);
        pl.r = m ? normAngle(parseFloat(m[0])) : 0;
        it.value = pl.r + "°";
        markDirty(); render();
      });
      lt.appendChild(it); rs.appendChild(lt);
    }
    pop.appendChild(rs);

    var r2 = ele("div", "row");
    if(pl){
      r2.appendChild(mkbtn("Straighten", "btn sm", function(){
        pl.r = 0; markDirty(); render(); close(); pieceMenu();
      }));
      /* Not "take it out of play" — a piece sitting in a wing is still
         in the show, it just does not move for this scene. Inheriting
         the previous placement is what makes the diff produce no move
         at all, which is the thing the crew actually wants. */
      r2.appendChild(mkbtn("Same as last scene", "btn sm", function(){
        leaveAsWas(); close();
      }));
      r2.appendChild(mkbtn("Off for this scene", "btn sm hot", function(){
        delete sc.place[selected]; markDirty(); render(); close();
        toast("Struck. The crew will be told to take it off.");
      }));
    } else {
      r2.appendChild(mkbtn("Bring into this scene", "btn on", function(){
        leaveAsWas(); close();
      }));
    }
    pop.appendChild(r2);

    var done = ele("div", "row"); done.style.marginTop = "12px";
    done.appendChild(mkbtn("Done", "btn on wide", close));
    pop.appendChild(done);
    body.appendChild(pop);
  });
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
    r2.appendChild(curtainSeg(sc));
    body.appendChild(r2);
    body.appendChild(ele("div", "help",
      "Open means the audience can see through to the stage."));

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

      /* Every size in the show is measured against this one number, so
         it is worth getting right once. Changing it moves nothing on
         the plan — the same drawing is being measured against a
         different stage, and every piece reads out differently. */
      var rw = ele("div", "row");
      var lw = ele("label", "f"); lw.appendChild(ele("span", null, "Stage width"));
      var iw = document.createElement("input");
      iw.type = "text"; iw.inputMode = "decimal"; iw.value = fmtFeet(stageFeet());
      var wh = ele("div", "help");
      function sayScale(){
        wh.textContent = "Proscenium opening, wall to wall. That makes the stage "
          + fmtFeet(stageFeet()) + " across and "
          + fmtFeet(stageFeet() * ZONES.stage.h / ZONES.stage.w) + " deep.";
      }
      sayScale();
      iw.addEventListener("change", function(){
        var ft = parseFeet(iw.value);
        if(ft !== null) S.stageFeet = Math.max(10, Math.min(200, ft));
        iw.value = fmtFeet(stageFeet());
        sayScale(); markDirty();
        /* The mid curtain and the scrim hang a measured number of feet
           from the back wall, so a new scale moves their rods. The plan
           is drawn once at startup; redraw it. */
        buildPlan(); refit(); render();
      });
      lw.appendChild(iw); rw.appendChild(lw);
      s2.appendChild(rw); s2.appendChild(wh);

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
    hd.appendChild(ele("span", "cur", curtainSummary(sc).toLowerCase()));
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
        var path;
        if(m.kind === "turn"){
          path = zoneLabel(m.to);
        } else {
          path = (m.from ? zoneLabel(m.from) : "off");
          if(m.r && m.r.via.length) path += " → " + m.r.via.join(" → ");
          path += " → " + (m.to ? zoneLabel(m.to) : "out of play");
        }
        if(m.turned) path += ", " + turnText(m.from, m.to);
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
