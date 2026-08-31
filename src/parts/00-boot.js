/* ===============================================================
   Boot: capture the page source before anything mutates it, load
   the show, and set up the small helpers everything else uses.

   The whole app runs inside one IIFE that build.js assembles from
   src/parts/*.js in filename order, so these files share a scope.
   Anything declared here is visible to every later part.
   =============================================================== */

/* ---------- self-rebuild capture (must run first) ----------
   To sync, the page rebuilds its own source and republishes it, so
   the markup, stylesheet and script have to be grabbed in their
   original state. The font links are read off the live document
   rather than hard-coded, because a hard-coded list silently drifts
   from the stylesheet and every republished copy loses its type. */
var ROOT_HTML = document.getElementById("root").innerHTML;
var CSS_SRC   = document.getElementById("sheet").textContent;
var APP_SRC   = document.getElementById("app").textContent;
var FONTLINK  = (function(){
  var out = "";
  var links = document.querySelectorAll('link[rel="stylesheet"],link[rel="preconnect"]');
  for(var i=0;i<links.length;i++){
    var href = links[i].getAttribute("href") || "";
    if(href.indexOf("fonts.g") < 0) continue;
    out += '<link rel="' + links[i].getAttribute("rel") + '" href="' + href + '"'
         + (links[i].hasAttribute("crossorigin") ? " crossorigin" : "") + ">";
  }
  return out;
})();

function pageSource(state){
  var json = JSON.stringify(state).replace(/</g, "\\u003c");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>Ghost Light</title>' + FONTLINK
    + '<style id="sheet">' + CSS_SRC + '<\/style></head><body><div id="root">'
    + ROOT_HTML + '</div><script id="state" type="application/json">' + json + '<\/script>'
    + '<script id="app">' + APP_SRC + '<\/script></body></html>';
}

/* ---------- state ---------- */
var S = JSON.parse(document.getElementById("state").textContent);
var LS = {
  get:function(k,d){ try{ var v=localStorage.getItem("gl:"+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set:function(k,v){ try{ localStorage.setItem("gl:"+k, JSON.stringify(v)); }catch(e){} }
};
var draft = LS.get("draft", null);
if (draft && draft.baseRev === S.rev) { S = draft.state; }

/* Device-level preferences. A republish reloads the page and wipes
   everything in memory, so anything personal to this phone lives in
   localStorage rather than in the show. */
var role     = LS.get("role", null);      // "sm" | "crew"
var mode     = "run";                     // "run" | "build"
var viewIdx  = S.liveIndex;
var browsing = false;
var selected = null;
var dirty    = !!draft;
var api      = null;
var apiState = "checking";
var lastSeen = LS.get("lastSeen", -1);
var calling  = false;                     // a call is in flight
var callFail = null;                      // scene index whose call did not sync

/* ---------- helpers ---------- */
var $ = function(id){ return document.getElementById(id); };
function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c];
  });
}
function mkbtn(label, cls, fn){
  var b = document.createElement("button");
  b.textContent = label; b.className = cls || "btn";
  b.addEventListener("click", fn);
  return b;
}
function ele(tag, cls, text){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text !== undefined) n.textContent = text;
  return n;
}
function toast(msg, ms){
  var old = document.querySelector(".toast"); if(old) old.remove();
  var d = ele("div", "toast", msg);
  document.body.appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.remove(); }, ms || 3600);
}
function isSM(){ return role === "sm"; }
function sceneAt(i){ return S.scenes[i] || null; }
function pieceById(id){
  for(var i=0;i<S.pieces.length;i++) if(S.pieces[i].id === id) return S.pieces[i];
  return null;
}
