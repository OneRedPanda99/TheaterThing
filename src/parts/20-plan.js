/* ===============================================================
   The ground plan.

   Drawn from the house, so stage right sits on the left the way a
   real ground plan reads. The map is always on screen — it is the
   thing the app is for — and it owns its own pinch, pan and drag.

   Everything a thumb or an eye has to find is sized through
   planScale(), which converts plan units to CSS pixels at the
   current zoom. That way a label is the same physical size on a
   phone as on an iPad, at any zoom, with no width media queries.
   =============================================================== */

var svgNS = "http://www.w3.org/2000/svg";
var plansvg = $("plansvg");
var svg = null, pieceLayer = null, routeLayer = null, curtainL = null, curtainR = null;
var labels = [];            // { node, px, y, em } — see label() / sizeLabels()
var nodes = {};             // piece id -> <g>

function el(tag, attrs, parent){
  var n = document.createElementNS(svgNS, tag);
  for(var k in attrs) n.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(n);
  return n;
}
/* Register a label so its size follows the zoom. Type in an SVG is in
   user units, so a fixed font-size is a different physical size at
   every zoom and on every screen; px is the size it should read at,
   in CSS pixels, and sizeLabels converts.

   em offsets a second line below a first: line spacing has to scale
   with the type, and a fixed y gap that looks right at fit zoom has
   the two lines overlapping the moment you zoom in. */
function label(node, px, em){
  labels.push({ node:node, px:px, y:parseFloat(node.getAttribute("y")) || 0, em:em || 0 });
  return node;
}

function buildPlan(){
  plansvg.innerHTML = ""; labels = [];
  svg = el("svg", { viewBox:"0 0 "+VB.w+" "+VB.h, class:"plan", "aria-label":"Stage ground plan" });
  plansvg.appendChild(svg);

  el("rect", { x:190, y:26, width:960, height:48, rx:14, fill:"none",
               stroke:"var(--rule2)", "stroke-dasharray":"3 7" }, svg);
  label(el("text", { x:670, y:56, "text-anchor":"middle", class:"zone-name" }, svg), 11)
    .textContent = "Upstage crossover";

  /* Zone names sit inside their zone, top left. Set above the zone, at
     a size big enough to read on a phone, the outermost two ran off the
     edge of the viewBox and were clipped. */
  Object.keys(ZONES).forEach(function(zid){
    var z = ZONES[zid];
    el("rect", { x:z.x, y:z.y, width:z.w, height:z.h, rx:16, class:"zone-fill-"+z.kind }, svg);
    el("rect", { x:z.x, y:z.y, width:z.w, height:z.h, rx:16, class:"zone-edge "+z.kind }, svg);
    label(el("text", { x:z.x+10, y:z.y+20, class:"zone-name" }, svg), 11)
      .textContent = z.short;
    if(z.sub){
      label(el("text", { x:z.x+10, y:z.y+20, class:"plan-note" }, svg), 9, 1.2)
        .textContent = z.sub;
    }
  });

  /* The stage carries a 3x3 grid (USR through DSL) so "where on
     stage" is an actual spot rather than a vague gesture. */
  var st = ZONES.stage;
  [1,2].forEach(function(i){
    el("line", { x1:st.x+st.w*i/3, y1:st.y, x2:st.x+st.w*i/3, y2:st.y+st.h, class:"grid-line" }, svg);
    el("line", { x1:st.x, y1:st.y+st.h*i/3, x2:st.x+st.w, y2:st.y+st.h*i/3, class:"grid-line" }, svg);
  });
  for(var r=0;r<3;r++) for(var c=0;c<3;c++){
    label(el("text", { x:st.x+st.w*(c/3)+8, y:st.y+st.h*((r+1)/3)-8, class:"grid-tag" }, svg), 9)
      .textContent = ROWS[r] + COLS[c];
  }
  /* Each wing is marked with leg positions, so "where in the wing"
     is a spot too. */
  ["wingSR","wingSL"].forEach(function(zid){
    var z = ZONES[zid];
    [1,2,3].forEach(function(i){
      el("line", { x1:z.x+6, y1:z.y+z.h*i/4, x2:z.x+z.w-6, y2:z.y+z.h*i/4, class:"grid-line" }, svg);
      label(el("text", { x:z.x+6, y:z.y+z.h*i/4+13, class:"grid-tag" }, svg), 9)
        .textContent = "leg " + i;
    });
  });

  routeLayer = el("g", {}, svg);
  pieceLayer = el("g", {}, svg);

  el("line", { x1:st.x-8, y1:CURTAIN_Y, x2:st.x+st.w+8, y2:CURTAIN_Y, class:"curtain-rod" }, svg);
  curtainL = el("rect", { x:st.x, y:CURTAIN_Y-5, width:st.w/2, height:10, class:"curtain" }, svg);
  curtainR = el("rect", { x:st.x+st.w/2, y:CURTAIN_Y-5, width:st.w/2, height:10, class:"curtain" }, svg);

  el("rect", { x:st.x, y:CURTAIN_Y+26, width:st.w, height:62, rx:14, class:"house" }, svg);
  label(el("text", { x:st.x+st.w/2, y:CURTAIN_Y+61, "text-anchor":"middle", class:"house-tag" }, svg), 11)
    .textContent = "AUDIENCE";
  label(el("text", { x:st.x+st.w/2, y:CURTAIN_Y+61, "text-anchor":"middle", class:"plan-note" }, svg), 10, 1.5)
    .textContent = "drawn from the house — stage right is on your left";

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
  svg.addEventListener("wheel", onWheel, { passive:false });
  svg.addEventListener("dblclick", function(){ fitView(); });
  applyView();
}

function setCurtain(open, animate){
  if(!curtainL) return;
  var st = ZONES.stage, half = st.w/2;
  var w = open ? half*0.12 : half;
  curtainL.style.transition = animate ? "width .55s ease" : "none";
  curtainR.style.transition = animate ? "width .55s ease, x .55s ease" : "none";
  curtainL.setAttribute("width", w);
  curtainR.setAttribute("width", w);
  curtainR.setAttribute("x", st.x + st.w - w);
}

/* Plan units per CSS pixel at the current zoom. */
function planScale(){
  var px = plansvg.clientWidth || 0;
  var w = (view && view.w) ? view.w : VB.w;
  return px > 0 ? w / px : 1.4;
}
function sizeLabels(){
  var k = planScale();
  for(var i=0;i<labels.length;i++){
    var L = labels[i], fs = L.px * k;
    L.node.setAttribute("font-size", fs);
    if(L.em) L.node.setAttribute("y", L.y + L.em * fs);
  }
}

var GRIP = 9;               // grip square, in CSS px
function drawPieces(scene){
  if(!pieceLayer) return;
  pieceLayer.innerHTML = ""; nodes = {};
  if(!scene) return;
  var k = planScale();
  var capFS = Math.max(9, 11.5 * k);
  /* Captioning all eight pieces at fit zoom turns two chairs a foot
     apart into a smear of overlapping type. During a run the only
     names worth printing on the map are the ones that move into this
     scene, plus whatever is selected; everything else is a coloured
     block whose name is in the list. Build mode captions the lot,
     because there you are looking for a specific piece. */
  var named = null;
  if(mode !== "build"){
    named = {};
    if(selected) named[selected] = 1;
    movesInto(viewIdx).forEach(function(m){ if(m.piece) named[m.piece.id] = 1; });
  }
  S.pieces.forEach(function(p){
    var pl = scene.place[p.id];
    if(!pl) return;
    var a = abs(pl); if(!a) return;
    var rot = pl.r || 0;
    var w = rot ? p.h : p.w, hh = rot ? p.w : p.h;
    var g = el("g", { class:"pc" + (selected===p.id ? " sel" : ""), "data-id":p.id,
                      transform:"translate("+a.x+","+a.y+")" }, pieceLayer);
    var rx = Math.min(9, Math.min(w, hh) / 4);
    el("rect", { x:-w/2-5, y:-hh/2-5, width:w+10, height:hh+10, rx:rx+4, class:"halo" }, g);
    el("rect", { x:-w/2, y:-hh/2, width:w, height:hh, rx:rx, class:"body",
                 fill:p.color, stroke:"rgba(0,0,0,.4)" }, g);
    if(!named || named[p.id]){
      var t = el("text", { x:0, y:hh/2+4+capFS, "text-anchor":"middle", class:"cap",
                           "font-size":capFS, fill:"var(--ink)" }, g);
      t.textContent = p.name;
    }
    if(pl.note) el("circle", { cx:w/2-6, cy:-hh/2+6, r:Math.max(3, 3.5*k), class:"note-dot" }, g);
    /* Resize by dragging the corner, so the crew never has to think
       in plan units. Only the selected piece, only while building. */
    if(mode === "build" && selected === p.id){
      var gs = GRIP * k;
      el("rect", { x:w/2-gs*1.6, y:hh/2-gs*1.6, width:gs*3.2, height:gs*3.2,
                   class:"grip-hit", "data-grip":"1" }, g);
      el("rect", { x:w/2-gs/2, y:hh/2-gs/2, width:gs, height:gs, rx:gs/4,
                   class:"grip", "data-grip":"1" }, g);
    }
    nodes[p.id] = g;
  });
}
function drawRoutes(moves){
  if(!routeLayer) return;
  routeLayer.innerHTML = "";
  if(mode === "build") return;              // routes describe a change, not an edit
  moves.forEach(function(m){
    if(!m.r || m.r.pts.length < 2) return;
    var d = m.r.pts.map(function(p,i){ return (i?"L":"M") + p.x + " " + p.y; }).join(" ");
    el("path", { d:d, class:"route" + (selected && selected !== m.piece.id ? " dim" : "") }, routeLayer);
  });
}
function redrawForWidth(){
  var sc = sceneAt(viewIdx);
  sizeLabels();
  drawPieces(sc);
  drawRoutes(movesInto(viewIdx));
}

/* ---------------- animation ---------------- */
var animRAF = null;
function animateTransition(fromScene, toScene){
  if(!toScene) return;
  drawPieces(toScene);
  var moves = movesBetween(fromScene, toScene);
  drawRoutes(moves);
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!fromScene || reduce){ setCurtain(toScene.curtain === "open", false); return; }

  var tracks = [];
  moves.forEach(function(m){
    if(!m.piece || !m.r || m.r.pts.length < 2) return;
    var g = nodes[m.piece.id]; if(!g) return;
    var pts = m.r.pts, segs = [], total = 0;
    for(var i=1;i<pts.length;i++){
      var dx = pts[i].x-pts[i-1].x, dy = pts[i].y-pts[i-1].y, len = Math.sqrt(dx*dx+dy*dy);
      segs.push({ a:pts[i-1], b:pts[i], len:len }); total += len;
    }
    if(total < 1) return;
    tracks.push({ g:g, segs:segs, total:total });
  });
  if(!tracks.length){
    setCurtain(fromScene.curtain === "open", false);
    requestAnimationFrame(function(){
      setCurtain(toScene.curtain === "open", fromScene.curtain !== toScene.curtain);
    });
    return;
  }
  var DUR = 1500, t0 = null;
  if(animRAF) cancelAnimationFrame(animRAF);
  function step(ts){
    if(t0 === null) t0 = ts;
    var k = Math.min(1, (ts-t0)/DUR);
    var e = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2;
    tracks.forEach(function(tr){
      var want = e*tr.total, acc = 0, pos = tr.segs[tr.segs.length-1].b;
      for(var i=0;i<tr.segs.length;i++){
        var s = tr.segs[i];
        if(want <= acc+s.len || i === tr.segs.length-1){
          var f = s.len ? (want-acc)/s.len : 1; f = Math.max(0, Math.min(1, f));
          pos = { x:s.a.x+(s.b.x-s.a.x)*f, y:s.a.y+(s.b.y-s.a.y)*f };
          break;
        }
        acc += s.len;
      }
      tr.g.setAttribute("transform", "translate("+pos.x+","+pos.y+")");
    });
    if(k < 1) animRAF = requestAnimationFrame(step);
    else { animRAF = null; drawPieces(toScene); drawRoutes(moves); }
  }
  tracks.forEach(function(tr){
    tr.g.setAttribute("transform", "translate("+tr.segs[0].a.x+","+tr.segs[0].a.y+")");
  });
  setCurtain(fromScene.curtain === "open", false);
  requestAnimationFrame(function(){
    if(fromScene.curtain !== toScene.curtain) setCurtain(toScene.curtain === "open", true);
    animRAF = requestAnimationFrame(step);
  });
}
function replay(){
  var sc = sceneAt(viewIdx), prev = sceneAt(viewIdx-1);
  if(!prev){ toast("This is the first scene — nothing moves into it."); return; }
  animateTransition(prev, sc);
}

/* ---------------- zoom and pan ----------------
   The plan fits the screen at rest, which on a phone makes a chair
   about 14px across — fine to read, too small to place. So the map
   zooms: pinch, wheel, or double-tap to fit again. Pan by dragging
   any empty part of the theatre. */
var view = { x:0, y:0, w:VB.w };
var MINZW = VB.w / 9;                        // deepest zoom: about 9x
/* Whether the map is currently showing the whole theatre. It matters
   when the box changes shape — rotating, dragging the sheet, swapping
   screens. Clamping alone keeps the old zoom, which in a box that just
   got wider and shorter means the theatre is suddenly cropped; but
   re-fitting unconditionally would throw away a zoom somebody set on
   purpose. So: if it was fitted, fit it again; if it was not, leave it. */
var fitted = true;

function curAR(){
  var r = svg.getBoundingClientRect();
  return (r.width && r.height) ? r.height / r.width : VB.h / VB.w;
}
/* The width that shows the whole theatre, plus a little air: labels
   sit inside the outermost zones and a dead-tight fit clips them. */
var FIT_PAD = 1.05;
function fitW(){
  var ar = curAR(), w = VB.w;
  if(w * ar < VB.h) w = VB.h / ar;           // box is wider than the plan: fit by height
  return w * FIT_PAD;
}
function axis(v, size, total){               // centre it when it fits, clamp when it does not
  var pad = 40;
  if(size >= total) return (total - size) / 2;
  return Math.max(-pad, Math.min(total - size + pad, v));
}
function applyView(){
  if(!svg) return;
  var top = fitW();
  view.w = Math.max(MINZW, Math.min(top, view.w));
  var h = view.w * curAR();
  view.x = axis(view.x, view.w, VB.w);
  view.y = axis(view.y, h, VB.h);
  svg.setAttribute("viewBox", view.x+" "+view.y+" "+view.w+" "+h);
  var f = $("btn-fit");
  if(f) f.classList.toggle("hide", view.w >= top - 1);
  sizeLabels();
}
function fitView(){ view.w = fitW(); fitted = true; applyView(); redrawForWidth(); }
function refit(){
  if(fitted) fitView();
  else { applyView(); redrawForWidth(); }
}
function zoomAbout(cx, cy, factor){
  var before = view.w;
  var want = Math.max(MINZW, Math.min(fitW(), view.w / factor));
  var k = want / before;
  view.x = cx - (cx - view.x) * k;
  view.y = cy - (cy - view.y) * k;
  view.w = want;
  fitted = want >= fitW() - 1;
  applyView();
  redrawForWidth();
}
function clientToPlan(clientX, clientY){
  var r = svg.getBoundingClientRect();
  if(!r.width || !r.height) return null;
  return { x: view.x + (clientX - r.left) / r.width * view.w,
           y: view.y + (clientY - r.top)  / r.height * (view.w * curAR()) };
}
function svgPoint(evt){
  if(!svg.createSVGPoint || !svg.getScreenCTM) return null;
  var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  var m = svg.getScreenCTM(); if(!m) return null;
  return pt.matrixTransform(m.inverse());
}
function hitZone(p){
  var best = null;
  Object.keys(ZONES).forEach(function(zid){
    var z = ZONES[zid];
    if(p.x >= z.x && p.x <= z.x+z.w && p.y >= z.y && p.y <= z.y+z.h) best = zid;
  });
  return best;
}

/* ---------------- gestures ---------------- */
var pointers = {}, pan = null, pinch = null, drag = null;
function pointerList(){ return Object.keys(pointers); }
function endGestures(){ pan = null; pinch = null; }

function onPointerDown(evt){
  /* A finger that leaves the window, or a touch the browser takes
     back, can skip pointerup and leave a ghost in here forever —
     after which every single-finger drag reads as half a pinch.
     The primary pointer starts a fresh gesture, so anything still
     tracked at that moment is stale. */
  if(evt.isPrimary !== false){ pointers = {}; endGestures(); }
  pointers[evt.pointerId] = { x:evt.clientX, y:evt.clientY };
  var ids = pointerList();

  if(ids.length === 2){                       // a second finger means pinch
    drag = null; pan = null;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    var mid = clientToPlan((a.x+b.x)/2, (a.y+b.y)/2);
    pinch = { d: Math.hypot(a.x-b.x, a.y-b.y), w: view.w, mid: mid };
    if(evt.preventDefault) evt.preventDefault();
    return;
  }
  if(ids.length > 2) return;

  var g = evt.target.closest ? evt.target.closest(".pc") : null;
  if(!g){                                     // empty theatre: drag to pan
    pan = { id:evt.pointerId, x:evt.clientX, y:evt.clientY, vx:view.x, vy:view.y };
    if(mode === "build" && selected){ selected = null; render(); }
    if(svg.setPointerCapture) try{ svg.setPointerCapture(evt.pointerId); }catch(e){}
    return;
  }

  var id = g.getAttribute("data-id");
  var wasSelected = selected === id;
  selected = id;

  if(mode !== "build"){ render(); return; }
  var p = svgPoint(evt);
  if(!p){ render(); return; }

  var onGrip = wasSelected && evt.target.getAttribute &&
               evt.target.getAttribute("data-grip") === "1";
  var sc = sceneAt(viewIdx), pl = sc && sc.place[id];
  var c = pl ? abs(pl) : null;
  drag = onGrip
    ? { id:id, mode:"size", c:c }
    : { id:id, mode:"move", ox: c ? c.x - p.x : 0, oy: c ? c.y - p.y : 0 };

  if(svg.setPointerCapture) try{ svg.setPointerCapture(evt.pointerId); }catch(e){}
  if(!wasSelected) render();                  // first tap selects and draws the grip
  drag.g = nodes[drag.id] || null;
  if(drag.g) drag.g.classList.add("dragging");
  hidePop();
  if(evt.preventDefault) evt.preventDefault();
}

function onPointerMove(evt){
  if(pointers[evt.pointerId]) pointers[evt.pointerId] = { x:evt.clientX, y:evt.clientY };

  if(pinch){
    var ids = pointerList();
    if(ids.length < 2){ pinch = null; return; }
    var a = pointers[ids[0]], b = pointers[ids[1]];
    var d = Math.hypot(a.x-b.x, a.y-b.y);
    if(pinch.d > 0 && pinch.mid){
      var want = Math.max(MINZW, Math.min(fitW(), pinch.w * (pinch.d / d)));
      var k = want / view.w;
      view.x = pinch.mid.x - (pinch.mid.x - view.x) * k;
      view.y = pinch.mid.y - (pinch.mid.y - view.y) * k;
      view.w = want;
      fitted = want >= fitW() - 1;
      applyView();
    }
    if(evt.preventDefault) evt.preventDefault();
    return;
  }

  if(pan){
    var r = svg.getBoundingClientRect();
    if(!r.width) return;
    var per = view.w / r.width;                // plan units per CSS pixel
    view.x = pan.vx - (evt.clientX - pan.x) * per;
    view.y = pan.vy - (evt.clientY - pan.y) * per;
    applyView();
    if(evt.preventDefault) evt.preventDefault();
    return;
  }

  if(!drag || !drag.g) return;
  var p = svgPoint(evt); if(!p) return;
  if(drag.mode === "size"){
    if(!drag.c) return;
    var pc = pieceById(drag.id); if(!pc) return;
    var sc = sceneAt(viewIdx), pl = sc && sc.place[drag.id];
    var rot = (pl && pl.r) || 0;
    var w = clampSz(Math.abs(p.x - drag.c.x) * 2);
    var h = clampSz(Math.abs(p.y - drag.c.y) * 2);
    pc.w = rot ? h : w; pc.h = rot ? w : h;
    drawPieces(sc);
    drag.g = nodes[drag.id] || null;
    if(drag.g) drag.g.classList.add("dragging");
    return;
  }
  drag.g.setAttribute("transform", "translate("+(p.x+drag.ox)+","+(p.y+drag.oy)+")");
}

function onPointerUp(evt){
  delete pointers[evt.pointerId];
  if(pinch && pointerList().length < 2){ pinch = null; redrawForWidth(); }
  if(pan && pan.id === evt.pointerId){ pan = null; redrawForWidth(); return; }
  if(!drag) return;
  if(drag.mode === "size"){ drag = null; markDirty(); render(); return; }

  var p = svgPoint(evt);
  var sc = sceneAt(viewIdx);
  if(p) p = { x:p.x + drag.ox, y:p.y + drag.oy };   // drop where the piece is, not the finger
  if(p && sc){
    var zid = hitZone(p);
    if(zid){
      var z = ZONES[zid];
      var cur = sc.place[drag.id] || { r:0, note:"" };
      sc.place[drag.id] = {
        zone: zid,
        x: Math.max(0.03, Math.min(0.97, (p.x-z.x)/z.w)),
        y: Math.max(0.03, Math.min(0.97, (p.y-z.y)/z.h)),
        r: cur.r||0, note: cur.note||""
      };
      markDirty();
    } else {
      toast("Dropped outside the theatre — put it on the stage, in a wing, or on the aux stage.");
    }
  }
  drag = null;
  render();
}
function onWheel(evt){
  if(!evt.deltaY) return;
  var pt = clientToPlan(evt.clientX, evt.clientY);
  if(!pt) return;
  if(evt.preventDefault) evt.preventDefault();
  zoomAbout(pt.x, pt.y, evt.deltaY < 0 ? 1.18 : 1/1.18);
}
function clampSz(n){ return Math.round(Math.max(MINSZ, Math.min(MAXSZ, n))); }
