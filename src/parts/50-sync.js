/* ===============================================================
   Sync, and the two backstage settings.

   There is no server. To sync, the page rebuilds its own source
   with the new show spliced in and republishes itself through the
   artifact runtime; every other open view live-reloads to that
   version. Propagation is a second or three plus a reload, which
   is fine for calling scene changes and is not sub-second cueing.

   Editing never publishes on its own. Changes collect in a local
   draft and go out on an explicit Save. Calling a scene publishes
   immediately, because that is the whole point of calling it.
   =============================================================== */

function markDirty(){
  dirty = true;
  LS.set("draft", { baseRev:S.rev, state:S });
  syncChip(); paintDeck();
}
function clearDraft(){ dirty = false; LS.set("draft", null); }

async function publish(){
  if(!api){
    toast("No live sync in this view — the change is saved on this device only.");
    return false;
  }
  syncStatus("Sending");
  S.rev = (S.rev || 1) + 1;
  try{
    await api.publish(pageSource(S));
    clearDraft();
    return true;
  }catch(err){
    S.rev = S.rev - 1;
    var code = (err && err.code) || "upstream_error";
    if(code === "conflict"){
      syncStatus("Reloading", "warn");
      toast("Someone else saved first — this device is reloading to their version.");
    } else if(code === "not_writer" || code === "not_granted"
           || code === "consent_required" || code === "not_declared"){
      apiState = "readonly"; api = null;
      toast("This device can view but not save. Ask whoever owns the link to send you an edit link.");
      render();
    } else if(code === "rate_limited"){
      syncStatus("Too fast", "warn");
      toast("Saving too quickly. Wait a few seconds, then try again.");
    } else if(code === "too_large"){
      syncStatus("Too big", "warn");
      toast("The show file is too large to save. Remove a few scenes or pieces.");
    } else {
      syncStatus("Save failed", "warn");
      toast("Save failed. Your work is kept on this device — try again in a moment.");
    }
    return false;
  }
}

async function callScene(i){
  if(calling) return;                        // one tap, one call
  if(i < 0 || i >= S.scenes.length) return;
  S.liveIndex = i; S.liveStamp = Date.now();
  viewIdx = i; browsing = false; selected = null;
  calling = true; callFail = null;
  render();
  syncStatus("Calling");
  var ok = await publish();
  calling = false;
  if(!ok) callFail = i;                      // this device moved; the others did not
  render();
}

/* ---------- backstage: keep the screen awake ---------- */
var wakeLock = null, wakeWanted = LS.get("wake", false), wakeOk = ("wakeLock" in navigator);
async function applyWake(){
  try{
    if(wakeWanted && wakeOk){
      if(!wakeLock){
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", function(){ wakeLock = null; });
      }
    } else if(wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch(e){
    wakeWanted = false; LS.set("wake", false);
    toast("This browser will not keep the screen awake. Set your phone's auto-lock to Never for the run.");
  }
}
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible" && wakeWanted && !wakeLock) applyWake();
});

/* ---------- backstage: dim the screen ---------- */
var DIMS = [
  { label:"Bright",   a:0,    tint:false },
  { label:"Dim",      a:0.5,  tint:false },
  { label:"Blackout", a:0.78, tint:true  }
];
var dimIdx = LS.get("dim", 0), forcedDark = false;
function applyDim(){
  var d = $("dim"), s = DIMS[dimIdx];
  d.style.opacity = s.a;
  d.className = s.tint ? "tint" : "";
  if(dimIdx > 0 && !forcedDark){
    document.documentElement.setAttribute("data-theme", "dark"); forcedDark = true;
  } else if(dimIdx === 0 && forcedDark){
    document.documentElement.removeAttribute("data-theme"); forcedDark = false;
  }
}
