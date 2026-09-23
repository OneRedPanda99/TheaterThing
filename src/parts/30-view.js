/* ===============================================================
   The view screen — the one everybody stares at during a show.

   One question: what moves, from where, to where, right now. The
   plan answers it in pictures, the sheet answers it in words, and
   the deck moves the show on. Nothing else is on screen.
   =============================================================== */

/* ---------------- the sheet ----------------
   Phone only. Three heights: a peek that shows the scene name, a
   rest position, and a full one that covers the plan. Drag the
   handle, or tap it to step through. Above 640px the sheet is a
   plain pane beside the plan and none of this runs. */
var SNAPS = [0, 1, 2];
var snap = LS.get("snap", 1);
var sheetEl = $("scenesheet"), grabEl = $("grab"), stageEl = $("stage");

function sheetOverlay(){
  return window.matchMedia && !window.matchMedia("(min-width:640px)").matches;
}
/* The resting height is worked backwards from the plan: leave the map
   exactly as much room as its own 1170x658 shape needs at this width,
   and give the move list everything else. A phone screen is far taller
   than the theatre is deep, so splitting it down the middle would
   letterbox the plan into a thin band with dead space above and below
   it, and starve the list at the same time. */
function snapPx(i){
  var H = stageEl.clientHeight || 480;
  var W = stageEl.clientWidth || 375;
  var head = grabEl.offsetHeight || 74;
  var jump = $("jump").classList.contains("hide") ? 0 : ($("jump").offsetHeight || 0);
  var peek = head + jump + 1;
  var rest = Math.round(H - (W / (VB.w / VB.h)) - 6);
  /* The tallest snap takes the whole stage rather than leaving a sliver
     of map. A theatre squeezed into 80px is not a smaller map, it is a
     smear of overlapping labels — if you have pulled the list up this
     far, you are reading, not looking. */
  return [ peek, Math.max(peek, Math.min(Math.round(H*0.8), rest)), H ][i];
}
/* One number drives both the pane under the plan and the plan box
   above it, and it lives on the stage because both read it from there.
   Edit mode swaps the sheet for the tray; the plan has to grow into
   the difference or it sits in a strip with dead black under it. */
/* The height the plan's own 1170x658 shape needs at this width. Past
   that the map cannot grow — a theatre is wider than it is deep and a
   phone is the other way round — so every pixel past it is dead. */
function planFitH(){
  return Math.round((stageEl.clientWidth || 375) / (VB.w / VB.h));
}
function applyPanes(){
  /* Above 640px the plan and the pane are side by side or stacked by
     the grid, and neither number applies — clear both, or a height
     worked out for a phone follows the layout across the breakpoint. */
  if(!sheetOverlay()){
    stageEl.style.removeProperty("--pane");
    $("editpane").style.removeProperty("--editmin");
    return;
  }
  var h;
  if(mode === "edit"){
    /* Hand the room the plan cannot use to the pane below, which is
       what the build pane was always for. Left to its own content
       height it took ~190px of a 640px stage and the other 240 sat as
       a dead band above and below the map — the map no larger for it,
       the tray scrolling sideways with pieces off the edge. Folded,
       the row has asked for the map instead, so it keeps to itself. */
    var bp = $("editpane");
    var spare = (stageEl.clientHeight || 480) - planFitH();
    bp.style.setProperty("--editmin", (paneOpen === false ? 0 : Math.max(0, spare)) + "px");
    h = bp.offsetHeight || 130;
  } else h = snapPx(snap);
  stageEl.style.setProperty("--pane", h + "px");
}
function setSnap(i){
  snap = Math.max(0, Math.min(SNAPS.length-1, i));
  LS.set("snap", snap); applyPanes();
}

var sdrag = null;
grabEl.addEventListener("pointerdown", function(e){
  if(!sheetOverlay()) return;
  sdrag = { y:e.clientY, h:sheetEl.getBoundingClientRect().height, moved:false };
  sheetEl.classList.add("dragging");
  try{ grabEl.setPointerCapture(e.pointerId); }catch(err){}
});
grabEl.addEventListener("pointermove", function(e){
  if(!sdrag) return;
  var dy = sdrag.y - e.clientY;
  if(Math.abs(dy) > 5) sdrag.moved = true;
  var H = stageEl.clientHeight || 480;
  var h = Math.max(snapPx(0), Math.min(H, sdrag.h + dy));
  stageEl.style.setProperty("--pane", h + "px");
});
grabEl.addEventListener("pointerup", function(e){
  if(!sdrag) return;
  sheetEl.classList.remove("dragging");
  if(!sdrag.moved){                              // a tap steps to the next height
    setSnap(snap >= SNAPS.length-1 ? 0 : snap+1);
  } else {
    var h = sheetEl.getBoundingClientRect().height, best = 0, gap = Infinity;
    SNAPS.forEach(function(i){
      var d = Math.abs(snapPx(i) - h);
      if(d < gap){ gap = d; best = i; }
    });
    setSnap(best);
  }
  sdrag = null;
});
grabEl.addEventListener("keydown", function(e){
  if(e.key === "Enter" || e.key === " "){ e.preventDefault(); setSnap(snap >= SNAPS.length-1 ? 0 : snap+1); }
});

/* ---------------- topbar ---------------- */
function syncStatus(txt, cls){
  var c = $("syncchip");
  c.innerHTML = "";
  c.appendChild(ele("span", "word", txt));
  c.className = "stat" + (cls ? " " + cls : "");
  c.title = txt;
}
/* Unsaved outranks device-only, because it is the one the stage
   manager can still do something about. */
function syncChip(){
  if(apiState === "checking")      syncStatus("Connecting");
  else if(apiState === "readonly") syncStatus("View only", "warn");
  else if(dirty)                   syncStatus("Unsaved", "warn");
  else if(apiState === "local")    syncStatus("This device only", "warn");
  else                             syncStatus("Synced", "ok");
}
function paintTop(){
  $("showname").textContent = S.show;
  document.body.classList.toggle("mode-edit", mode === "edit");
  $("editpane").classList.toggle("hide", mode !== "edit");
  $("scenesheet").classList.toggle("hide", mode === "edit");
  $("planbtns").classList.toggle("hide", mode === "edit");
  $("btn-setup").textContent = mode === "edit" ? "Done" : "Setup";
  syncChip();
}

/* ---------------- the sheet header ---------------- */
function paintSheetHead(moves){
  var sc = sceneAt(viewIdx);
  var k = $("grab-k");
  k.textContent = browsing ? "Previewing" : "Now showing";
  k.className = "k" + (browsing ? " ahead" : "");
  $("grab-num").textContent = (viewIdx+1) + "/" + S.scenes.length;
  $("grab-nm").textContent = sc ? sc.name : "No scenes yet";
  $("grab-ct").textContent = moves.length
    ? moves.length + (moves.length === 1 ? " move" : " moves")
    : (viewIdx === 0 ? "starting positions" : "no change");

  var J = $("jump"); J.innerHTML = "";
  if(!browsing){ J.classList.add("hide"); return; }
  J.classList.remove("hide");
  var live = sceneAt(S.liveIndex);
  J.appendChild(ele("span", "t", "Now showing " + (S.liveIndex+1) + ". " + (live ? live.name : "—")));
  J.appendChild(mkbtn("Back to current", "btn", function(){
    browsing = false; viewIdx = S.liveIndex; selected = null; render();
  }));
  if(isSM()){
    J.appendChild(mkbtn("Show this scene", "btn on", function(){ callScene(viewIdx); }));
  }
}

/* ---------------- move list ---------------- */
function paintMoves(moves){
  var box = $("moves"); box.innerHTML = "";
  if(!moves.length){
    var msg = viewIdx === 0
      ? "Scene 1 is the starting layout — where every piece sits before the audience comes in. Pinch the plan to look at it."
      : "Nothing moves into this scene. The stage stays exactly as it is.";
    box.appendChild(ele("div", "empty", msg));
    return;
  }
  moves.forEach(function(m){
    var d = ele("button", "mv" + (m.piece && selected === m.piece.id ? " sel" : ""));
    var sw = ele("div", "sw");
    var tx = ele("div", "txt");
    if(m.kind === "curtain"){
      sw.style.background = m.cur.color;
      var cn = ele("div", "nm");
      cn.appendChild(ele("span", "verb", m.verb));
      cn.appendChild(document.createTextNode(m.text));
      tx.appendChild(cn);
      tx.appendChild(ele("div", "path", m.sub));
      d.appendChild(sw); d.appendChild(tx); box.appendChild(d);
      return;
    }
    sw.style.background = m.piece.color;
    var nm = ele("div", "nm");
    nm.appendChild(ele("span", "verb", VERB[m.kind]));
    nm.appendChild(document.createTextNode(m.piece.name));
    var path = ele("div", "path");
    function z(text, cls){ return ele("span", "z" + (cls ? " " + cls : ""), text); }
    if(m.kind === "turn"){
      path.appendChild(z(zoneLabel(m.to)));
    } else {
      if(m.from) path.appendChild(z(zoneLabel(m.from)));
      if(m.r && m.r.via.length) m.r.via.forEach(function(v){
        path.appendChild(ele("span", "ar", "→")); path.appendChild(z(v, "via"));
      });
      if(m.from) path.appendChild(ele("span", "ar", "→"));
      path.appendChild(z(m.to ? zoneLabel(m.to) : "Out of play"));
    }
    if(m.turned){
      path.appendChild(ele("span", "ar", "·"));
      path.appendChild(z(turnText(m.from, m.to), "via"));
    }
    tx.appendChild(nm); tx.appendChild(path);
    if(m.to && m.to.note) tx.appendChild(ele("div", "hint", m.to.note));
    d.appendChild(sw); d.appendChild(tx);
    d.addEventListener("click", function(){
      selected = (selected === m.piece.id) ? null : m.piece.id;
      render();
    });
    box.appendChild(d);
  });
}

function paintNote(){
  var sc = sceneAt(viewIdx), box = $("notebox");
  if(!sc || !sc.note){ box.classList.add("hide"); box.innerHTML = ""; return; }
  box.classList.remove("hide"); box.innerHTML = "";
  var b = ele("b", null, curtainSummary(sc) + " · scene note");
  box.appendChild(b);
  box.appendChild(document.createTextNode(sc.note));
}

/* ---------------- the deck ----------------
   Hick's law: during a run only three things are reachable — go
   back, go forward, look ahead. The primary target never changes
   slot, so the thumb learns one location and stops aiming. */
function paintDeck(){
  var D = $("deck");
  D.innerHTML = ""; D.className = "deck";

  /* Editing: one target, and its label is the verb. The status goes
     on the small line above it — a primary button reading "Up to date"
     is the biggest thing on the screen and names no action at all. */
  if(mode === "edit"){
    D.classList.add("one");
    var save = ele("button", "go");
    save.disabled = calling;
    save.innerHTML = '<span class="k">'
      + (dirty ? "Not saved yet" : "Everything is saved") + "</span>"
      + '<span class="v">' + (dirty ? "Save" : "Done") + "</span>";
    save.addEventListener("click", function(){
      if(dirty) publish().then(function(ok){ if(ok) toast("Saved to every device."); render(); });
      else setMode("view");
    });
    D.appendChild(save);
    return;
  }

  var L = ele("div", "l"), R = ele("div");
  D.appendChild(L); D.appendChild(R);
  function sec(icon, cap, fn, dis){
    var b = ele("button", "sec");
    b.disabled = !!dis;
    b.innerHTML = '<span class="ic">' + icon + '</span><span class="cap">' + cap + "</span>";
    b.addEventListener("click", fn);
    L.appendChild(b);
    return b;
  }

  var live = sceneAt(S.liveIndex), next = sceneAt(S.liveIndex+1);

  if(isSM()){
    if(browsing) sec("&#9679;", "Current", function(){
      browsing = false; viewIdx = S.liveIndex; selected = null; render();
    });
    else sec("&#9664;", "Back", function(){ callScene(S.liveIndex-1); }, S.liveIndex <= 0);

    var go = ele("button", "go");
    go.disabled = !next || calling;
    if(calling){
      go.innerHTML = '<span class="k">Sending to every device</span><span class="v">Sending&hellip;</span>';
      R.appendChild(go);
      return;
    }
    go.innerHTML = '<span class="k">' + (next ? "Next scene" : "Last scene") + "</span>"
      + '<span class="v">'
      + (next ? '<span class="num">' + (S.liveIndex+2) + "</span>" + esc(next.name)
              : '<span class="num">' + (S.liveIndex+1) + "</span>" + esc(live ? live.name : "—"))
      + "</span>";
    go.addEventListener("click", function(){ callScene(S.liveIndex+1); });
    R.appendChild(go);
    return;
  }

  /* Crew: browse freely, call nothing. */
  sec("&#9664;", "Back", function(){
    viewIdx = Math.max(0, viewIdx-1); browsing = viewIdx !== S.liveIndex; selected = null; render();
  }, viewIdx <= 0);
  sec("&#9654;", "Ahead", function(){
    viewIdx = Math.min(S.scenes.length-1, viewIdx+1); browsing = viewIdx !== S.liveIndex;
    selected = null; render();
  }, viewIdx >= S.scenes.length-1);

  /* Same slot, same size as the stage manager's GO, but flat and
     unclickable so nobody taps the show forward by accident.

     While the crew are on the live scene the sheet above already
     names it, so repeating it here would waste the biggest readable
     thing on the screen. It carries what is coming instead — which is
     what you want to know while you are waiting in a wing. Step away
     from live and it switches to where the show actually is. */
  var ro = ele("div", "readout" + (browsing ? " away" : ""));
  var show = browsing ? { k:"Now showing", i:S.liveIndex, sc:live }
                      : { k: next ? "Next scene" : "Last scene",
                          i: next ? S.liveIndex+1 : S.liveIndex,
                          sc: next || live };
  ro.innerHTML = '<span class="k">' + show.k + "</span>"
    + '<span class="v"><span class="num">' + (show.i+1) + "</span>"
    + esc(show.sc ? show.sc.name : "—") + "</span>";
  R.appendChild(ro);
}

/* A call that did not reach the other devices must not be a toast
   that fades. It stays until the SM retries or accepts it. */
function paintAlert(){
  var a = $("alert");
  if(callFail === null){ a.classList.add("hide"); a.innerHTML = ""; return; }
  a.classList.remove("hide"); a.innerHTML = "";
  var sc = sceneAt(callFail);
  a.appendChild(ele("div", "msg",
    "Not sent. Everyone else is still on the scene before this one — you are on "
    + (callFail+1) + ". " + (sc ? sc.name : "") + ", their screens are not."));
  var retry = ele("button", null, "Send again");
  retry.addEventListener("click", async function(){
    retry.disabled = true; retry.textContent = "Sending…";
    S.liveStamp = Date.now();
    var ok = await publish();
    if(ok) callFail = null;
    render();
  });
  var dismiss = ele("button", null, "Tell them yourself");
  dismiss.addEventListener("click", function(){ callFail = null; render(); });
  a.appendChild(retry); a.appendChild(dismiss);
}
