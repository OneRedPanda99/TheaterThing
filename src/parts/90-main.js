/* ===============================================================
   One render, and the wiring.
   =============================================================== */

function render(){
  var sc = sceneAt(viewIdx);
  var moves = movesInto(viewIdx);
  paintTop();
  paintSceneBar();
  paintSheetHead(moves);
  paintAlert();
  paintMoves(moves);
  paintNote();
  paintSceneStrip();
  paintTray();
  paintDeck();
  drawPieces(sc);
  drawRoutes(moves);
  setCurtains(sc, false);
  paintPop();
  applyPanes();
}

/* ---------- wiring ---------- */
buildPlan();

$("btn-setup").addEventListener("click", function(){
  if(mode === "build") setMode("run"); else setupSheet();
});
$("btn-replay").addEventListener("click", replay);
$("btn-fit").addEventListener("click", fitView);

/* The plan's box changes size for a lot of reasons — the sheet being
   dragged, a rotation, the keyboard opening, the window resizing. One
   observer on the box covers all of them; anything less leaves the map
   drawn for a size it is no longer. */
var reflowT = null;
function reflow(){
  clearTimeout(reflowT);
  reflowT = setTimeout(refit, 60);
}
if(window.ResizeObserver) new window.ResizeObserver(reflow).observe(plansvg);
window.addEventListener("resize", function(){ applyPanes(); reflow(); });
window.addEventListener("orientationchange", function(){ setTimeout(function(){ applyPanes(); reflow(); }, 120); });

/* A hardware keyboard, which an iPad in the booth usually has. */
document.addEventListener("keydown", function(e){
  if(e.target && /input|textarea/i.test(e.target.tagName)) return;
  if(e.key === "Escape"){
    var scrim = document.querySelector(".scrim");
    if(scrim){ scrim.remove(); return; }
    if(selected){ selected = null; render(); return; }
    if(mode === "build"){ setMode("run"); return; }
  }
  if(!isSM() || mode === "build" || browsing) return;
  if(e.key === "ArrowRight" || e.key === " "){ e.preventDefault(); callScene(S.liveIndex+1); }
  if(e.key === "ArrowLeft") callScene(S.liveIndex-1);
});

/* ---------- start ----------
   The sheet is sized before the first render, so the plan is fitted
   to the box it will actually occupy. Animating it open from the
   stylesheet default would fit the map to a box that is still moving,
   and leave the theatre floating in dead space until something else
   forced a redraw.

   Fitting happens synchronously rather than in a frame callback: a
   page opened in a background tab gets no frames at all, and would
   come to the front with the theatre fitted to a box it never had. */
sheetEl.classList.add("noanim");
applyPanes();
render();
fitView();
applyDim();
if(wakeWanted) applyWake();
askRole(false);
setTimeout(function(){ sheetEl.classList.remove("noanim"); }, 60);

/* A scene the stage manager just called plays its change once, so a
   phone that was face-down in a wing shows what it missed. */
if(S.liveStamp && S.liveStamp !== lastSeen){
  LS.set("lastSeen", S.liveStamp);
  if(S.liveIndex === viewIdx) setTimeout(replay, 160);
}

(async function(){
  try{
    var cap = await (window.claude && window.claude.use
      ? window.claude.use("artifact") : Promise.resolve(null));
    if(cap){ api = cap; apiState = "live"; } else { apiState = "local"; }
  }catch(e){ apiState = "local"; }
  syncChip();
})();

/* A handle for the test suite, and for poking at a running show from
   a console. Nothing inside the app reads it. */
window.GL = {
  get S(){ return S; },
  get view(){ return view; },
  get viewIdx(){ return viewIdx; },
  pageSource: pageSource,
  parseFeet: parseFeet,
  fmtFeet: fmtFeet,
  toFeet: toFeet,
  toUnits: toUnits,
  angleTo: angleTo,
  curtainSummary: curtainSummary,
  CURTAINS: CURTAINS,
  movesBetween: movesBetween,
  buildSheet: buildSheet,
  callScene: callScene,
  render: render,
  setApi: function(a){ api = a; apiState = a ? "live" : "local"; syncChip(); }
};
