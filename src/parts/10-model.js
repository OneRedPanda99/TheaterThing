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
var PALETTE = ["#C1683B","#4E8C6A","#6D7BC4","#9C5AA8","#B0913F","#3F8AA0","#B8474C","#7E6BB5"];

/* ---------------- feet ----------------
   The plan is drawn in its own units; a crew measures in feet. One
   number ties them together: how wide the stage really is. The stage
   zone is 600 units across, so a foot is 600 / stageFeet units, and
   every piece can be typed and read back in feet and inches.

   It lives on the show because it is a fact about one theatre. Change
   it and nothing on the plan moves — the same drawing is simply being
   measured against a different stage. */
var STAGE_FT_DEFAULT = 40;
var MIN_FT = 0.5, MAX_FT = 40;

function stageFeet(){ return (S.stageFeet > 0) ? S.stageFeet : STAGE_FT_DEFAULT; }
function unitsPerFoot(){ return ZONES.stage.w / stageFeet(); }
function toFeet(u){ return u / unitsPerFoot(); }
function toUnits(ft){ return ft * unitsPerFoot(); }
function clampSz(u){
  return Math.round(Math.max(toUnits(MIN_FT), Math.min(toUnits(MAX_FT), u)));
}

/* Read what a person actually types. A bare number is feet, because
   that is how set pieces get talked about: "the sofa is about seven
   foot". Also takes 8', 8'6, 8'6", 8 ft 6 in, 18", 8.5. */
function parseFeet(raw){
  var s = String(raw == null ? "" : raw).trim().toLowerCase();
  if(!s) return null;
  s = s.replace(/[′´`]/g, "'").replace(/[″”“]/g, '"');
  var ft = 0, inch = 0, sawFeet = false, sawInch = false, m;

  m = s.match(/([\d.]+)\s*(?:'|ft\b|feet\b|foot\b)/);
  if(m){ ft = parseFloat(m[1]); sawFeet = true; s = s.slice(m.index + m[0].length); }

  m = s.match(/([\d.]+)\s*(?:"|in\b|ins\b|inch|inches)/);
  if(m){ inch = parseFloat(m[1]); sawInch = true; }
  else if(sawFeet){
    m = s.match(/([\d.]+)/);            // trailing bare number after feet is inches: 8'6
    if(m) inch = parseFloat(m[1]);
  }

  if(!sawFeet && !sawInch){
    m = s.match(/([\d.]+)/);
    if(!m) return null;
    ft = parseFloat(m[1]);
  }
  var v = ft + inch/12;
  return isFinite(v) ? v : null;
}
function fmtFeet(ft){
  var total = Math.round(ft * 12);
  var f = Math.floor(total / 12), i = total % 12;
  if(!f) return i + '"';
  return i ? f + "' " + i + '"' : f + "'";
}

/* An angle you can read. Rotation is free, so it is rarely round. */
function normAngle(r){ r = Math.round(r) % 360; return r < 0 ? r + 360 : r; }

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
var VERB = { on:"Bring on", off:"Strike", shift:"Reposition", trav:"Move", turn:"Turn" };
/* A piece that only pivots is its own kind of move. Called as a
   reposition it reads "Stage USC to Stage USC", which tells the crew
   nothing about what to actually go and do. */
function turnText(a, b){
  return normAngle((a && a.r) || 0) + "° → " + normAngle((b && b.r) || 0) + "°";
}

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
    var turned = (a.r||0) !== (b.r||0);
    if(a.zone !== b.zone){
      out.push({ kind:"trav", piece:p, from:a, to:b, r:route(a,b), turned:turned }); return;
    }
    var slid = Math.abs(a.x-b.x) > MOVE_EPS || Math.abs(a.y-b.y) > MOVE_EPS;
    if(slid || turned){
      out.push({ kind: slid ? "shift" : "turn", piece:p, from:a, to:b,
                 r:route(a,b), turned:turned });
    }
  });
  var rank = { curtain:0, trav:1, on:2, shift:3, turn:4, off:5 };
  out.sort(function(m,n){ return rank[m.kind] - rank[n.kind]; });
  return out;
}
function movesInto(i){ return movesBetween(sceneAt(i-1), sceneAt(i)); }
