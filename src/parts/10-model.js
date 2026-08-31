/* ===============================================================
   The model: where the theatre is, how a piece gets from one part
   of it to another, and what changed between two scenes.

   Nothing here touches the DOM. The move list is *derived*, never
   typed, so it can never drift out of sync with the ground plan.
   =============================================================== */

var VB = { w:1170, h:658 };
/* `short` is what the map prints inside the zone; `name` is what the
   move list says. The map has 150 units of width to work with and the
   list has a whole line. */
var ZONES = {
  aux:    { x:20,  y:132, w:150, h:268, kind:"aux",   name:"Aux stage", short:"AUX", sub:"stage right" },
  wingSR: { x:190, y:80,  w:160, h:462, kind:"wing",  name:"Wing SR",   short:"WING SR" },
  stage:  { x:370, y:80,  w:600, h:462, kind:"stage", name:"Stage",     short:"STAGE" },
  wingSL: { x:990, y:80,  w:160, h:462, kind:"wing",  name:"Wing SL",   short:"WING SL" }
};
var ORDER = { aux:0, wingSR:1, stage:2, wingSL:3 };
var SIDE  = { aux:"R", wingSR:"R", stage:"C", wingSL:"L" };
var CROSS_Y = 50, CURTAIN_Y = 542;
var COLS = ["R","C","L"], ROWS = ["US","MS","DS"];
var MINSZ = 16, MAXSZ = 280;
var PALETTE = ["#C1683B","#4E8C6A","#6D7BC4","#9C5AA8","#B0913F","#3F8AA0","#B8474C","#7E6BB5"];

function zoneOf(id){ return ZONES[id]; }
function abs(pl){ var z = zoneOf(pl.zone); if(!z) return null; return { x:z.x+pl.x*z.w, y:z.y+pl.y*z.h }; }
function ctr(zid, fy){ var z = ZONES[zid]; return { x:z.x+z.w/2, y:z.y+z.h*(fy===undefined?0.5:fy) }; }

function cellName(pl){
  var c = pl.x<0.34?0:(pl.x<0.67?1:2), r = pl.y<0.34?0:(pl.y<0.67?1:2);
  return ROWS[r] + COLS[c];
}
function zoneLabel(pl){
  if(!pl) return "Not in play";
  if(pl.zone === "stage") return "Stage " + cellName(pl);
  return zoneOf(pl.zone) ? zoneOf(pl.zone).name : pl.zone;
}

/* Routes are physical. Wing SR to wing SL goes around the upstage
   crossover, never across the stage; anything to or from the aux
   stage passes through wing SR, because that is the only door. */
function route(from, to){
  var a = abs(from), b = abs(to);
  if(!a || !b) return { pts:[], via:[] };
  var f = from.zone, t = to.zone;
  if(f === t) return { pts:[a,b], via:[] };
  var pts = [a], via = [];
  if(SIDE[f] !== "C" && SIDE[t] !== "C" && SIDE[f] !== SIDE[t]){
    if(f === "aux"){ pts.push(ctr("wingSR", 0.35)); via.push("Wing SR"); }
    pts.push({ x: ctr(f === "aux" ? "wingSR" : f).x, y: CROSS_Y });
    pts.push({ x: ctr(t === "aux" ? "wingSR" : t).x, y: CROSS_Y });
    via.push("Crossover");
    if(t === "aux"){ pts.push(ctr("wingSR", 0.35)); via.push("Wing SR"); }
  } else {
    var fi = ORDER[f], ti = ORDER[t], stepDir = ti > fi ? 1 : -1;
    for(var i = fi + stepDir; i !== ti; i += stepDir){
      var zid = Object.keys(ORDER).filter(function(k){ return ORDER[k] === i; })[0];
      if(zid){ pts.push(ctr(zid, 0.5)); via.push(ZONES[zid].name); }
    }
  }
  pts.push(b);
  return { pts:pts, via:via };
}

/* A nudge of less than 5% of a zone is not a move worth calling. */
var MOVE_EPS = 0.05;
var VERB = { on:"Bring on", off:"Strike", shift:"Reposition", trav:"Move" };

function movesBetween(prev, next){
  if(!next || !prev) return [];
  var out = [];
  if(prev.curtain !== next.curtain){
    out.push({ kind:"curtain",
               text: next.curtain === "open" ? "Curtain out" : "Curtain in",
               sub:  next.curtain === "open" ? "open before the scene" : "close on the scene" });
  }
  var seen = {};
  Object.keys(next.place).concat(Object.keys(prev.place)).forEach(function(id){
    if(seen[id]) return; seen[id] = 1;
    var p = pieceById(id); if(!p) return;
    var a = prev.place[id] || null, b = next.place[id] || null;
    if(!a && !b) return;
    if(!b){ out.push({ kind:"off", piece:p, from:a, to:null }); return; }
    if(!a){ out.push({ kind:"on", piece:p, from:null, to:b }); return; }
    if(a.zone !== b.zone){ out.push({ kind:"trav", piece:p, from:a, to:b, r:route(a,b) }); return; }
    if(Math.abs(a.x-b.x) > MOVE_EPS || Math.abs(a.y-b.y) > MOVE_EPS || (a.r||0) !== (b.r||0)){
      out.push({ kind:"shift", piece:p, from:a, to:b, r:route(a,b) });
    }
  });
  var rank = { curtain:0, trav:1, on:2, shift:3, off:4 };
  out.sort(function(m,n){ return rank[m.kind] - rank[n.kind]; });
  return out;
}
function movesInto(i){ return movesBetween(sceneAt(i-1), sceneAt(i)); }
