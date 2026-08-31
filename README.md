# Ghost Light

[![tests](https://github.com/OneRedPanda99/TheaterThing/actions/workflows/tests.yml/badge.svg)](https://github.com/OneRedPanda99/TheaterThing/actions/workflows/tests.yml)

A live set-piece tracker for a theatre crew. The stage manager calls a scene; every
connected phone follows and plays an animated ground plan showing what moves where.

Built for a high-school theatre department where the recurring problem was simple and
expensive: nobody could remember which set piece went where, or what changed between
scenes.

## What it does

- **Ground plan.** Top-down, drawn from the house, so stage right sits on the left the
  way a real ground plan reads. The stage carries a 3x3 grid (`USR` through `DSL`), and
  each wing is marked with leg positions so "where in the wing" is an actual spot rather
  than a vague side.
- **Four locations**, matching one specific theatre: stage, wing SR, wing SL, and an
  **aux stage off stage right only**. There is an upstage crossover.
- **Move lists are computed, never typed.** Each scene stores where every piece sits.
  The change between two consecutive scenes is derived by diffing them, so the crew
  list can never drift out of sync with the plan. A piece that only pivots is called
  as a **Turn**, not a reposition from a spot to the same spot.
- **Everything is in feet.** Pieces are typed and read back in feet and inches, against
  a stage whose real width you set once.
- **Routes are physical.** A piece going from the aux stage to the stage animates
  *through* wing SR. Wing SR to wing SL goes around the upstage crossover, never across
  the stage.
- **Calling the show.** The SM advances the scene; every open device reloads to it and
  plays the transition.
- **Two screens, not seven modes.** *Run* is what everybody stares at during a show.
  *Build* is where the stage manager makes it. Nothing else.
- **Backstage mode.** A three-step dimmer (bright / dim / blackout, the last warmed
  toward red) and a screen-wake lock, because a phone at full brightness in the wings
  spills light into the house.
- **Printable run sheet**, because theatre wifi is not a plan.

## How the sync works

There is no server. The page is published as a Claude Artifact and holds its own show
data in an embedded `<script id="state" type="application/json">` block. To sync, the
page **rebuilds its own source** — capturing its markup, stylesheet and script at load,
splicing in the new state — and republishes itself through the artifact runtime. Every
other open view live-reloads to that version.

Consequences worth knowing:

- Propagation is roughly **1-3 seconds plus a page reload**, not a websocket. Fine for
  calling scene changes; not built for sub-second cueing.
- Because a reload wipes everything in memory, per-device preferences (role, dimmer,
  sheet height, unsaved edits) live in `localStorage`.
- Editing does **not** publish. Changes collect locally and go out on an explicit
  **Save & sync**. Only calling a scene publishes immediately.
- A viewer with read-only access cannot publish; the page detects the rejection and
  switches to a read-only presentation.

The self-rebuild is the load-bearing trick, so `test.js` asserts a full round trip:
rebuild the document, boot it in a fresh DOM, and check it renders from its embedded
state.

## Interface notes

### Run

The plan is always on screen — it is the thing the app is for, so there is no toggle
hiding it. Under it sits a sheet carrying the scene, its move list and its note.

- On a **phone** the sheet floats over the plan at one of three heights. Drag its
  handle, or tap it to step through. The resting height is worked backwards from the
  map: the plan gets exactly the room its own 1170x658 shape needs at that width, and
  the list gets everything else. A phone screen is far taller than a theatre is deep,
  so splitting the screen in half would letterbox the plan into a thin band and starve
  the list at the same time.
- On an **iPad** the sheet stops being an overlay. Portrait stacks plan over list;
  landscape puts them side by side. Nobody has to choose.

The command deck is pinned to the bottom edge deliberately:

- The primary target sits **on** the screen edge, so it cannot be overshot, and it is
  by far the largest control on the page.
- It **never moves or changes meaning**, including while looking ahead at another
  scene, so the thumb learns one location. Jumping the show to the scene you are
  looking at is a separate, explicitly labelled control in the sheet header.
- Only two controls are reachable during a run.
- Crew get the same block in the same place, but flat and unclickable. While they are
  on the live scene it names **what is coming**, because the sheet directly above
  already names what is on — and repeating it would waste the biggest readable thing
  on the screen.

Nothing in the app scrolls the document; only the panes scroll. The deck therefore
cannot be pushed off a phone screen mid-show, and it clears the home indicator.

### Build

A separate screen, not a mode bleeding through the run screen. Scenes run along the
top, the plan fills the middle, and the set pieces run along the bottom.

- Tap a scene chip to go to it; tap the one you are already on for its details.
- The scene's **name, curtain and note** sit directly under the plan, because those are
  what a stage manager changes on nearly every pass. Reorder and delete — rarer, and
  riskier — stay one tap further in.
- Tap a piece and a popover opens **over the spot it is in**, carrying its zone
  shortcuts, its crew note, its size, its angle, and what to do with it this scene.
- **Size is typed, in feet.** `6`, `6'` and `6' 3"` all work, and a bare number is
  feet. Nothing on the plan resizes by dragging: a resize handle sits exactly where a
  thumb lands while panning, and a set piece that quietly changes size is worse than
  one that takes a moment to resize. A size belongs to the piece, so it changes in
  every scene at once.
- **Turn is free, to any angle.** Drag the handle standing off the top of the selected
  piece, or type the angle. It snaps when it is within four degrees of a multiple of
  fifteen, because most of a set is built to the proscenium — but a deliberate 37
  stays 37. An angle belongs to the placement, because the same sofa genuinely does
  face different ways in different scenes.
- Nothing is nested more than one tap deep.

### Measurements

The plan is drawn in its own units, and one number ties them to the real world: how
wide the stage actually is, set under **Setup → Stage width** and stored with the show.
The stage zone is 600 units across, so a foot is `600 / stage width` units.

Changing it moves nothing on the plan. The same drawing is simply being measured
against a different stage, and every piece reads out differently. The default is 40
feet, which is what the bundled sample show is drawn to — at that scale its sofa is
7' 10" and its chairs are 2' 3", which is about right for real furniture.

## Running it

Open `index.html` in a browser, or visit the Pages site.

### Source layout

The app has to **ship** as one self-contained file, because syncing works by the running
page capturing its own markup, stylesheet and script and republishing them. But one
1,800-line HTML file is not something a person can edit. So the source is split for
humans and inlined for the browser:

```
src/
  head.html          title and font links
  style.css
  body.html          the markup
  show.json          the show the page ships with
  parts/
    00-boot.js       source capture, state, localStorage, helpers
    10-model.js      zones, routes, and the scene diff — no DOM
    20-plan.js       the SVG: draw, animate, pinch, pan, drag
    30-run.js        the run screen
    40-build.js      build mode, setup, the run sheet, modals
    50-sync.js       publish, call, dimmer, wake lock
    90-main.js       one render, and the wiring
build.js             assembles both shipped files
```

`build.js` writes **two** generated, committed files. `ghost-light.html` is the Artifact
source, authored as a **fragment** — no `<!doctype>`, `<html>` or `<body>` — because the
Claude Artifact host supplies that shell itself. `index.html` is the same content wrapped
in a real document, which is what Pages needs: without a `viewport` meta a phone lays the
page out at ~980px and zooms out, defeating a command deck sized for a thumb.

Filename order in `parts/` is load order. The parts are concatenated into a single IIFE
and share one scope, so `00-boot.js` has to come first.

```bash
npm run build        # regenerate both files after editing src/
```

Edit `src/`, never the output. CI fails if either generated file drifts.

### Live sync only exists on the Artifact

The Pages copy has no artifact runtime, so it reports **"This device only"** and keeps
everything in `localStorage`. It is a usable standalone reference and a public demo, but
calling a scene there reaches nobody else. For an actual run, the crew needs the
published Artifact link.

### Tests

```bash
npm ci
npm test
```

52 checks covering route derivation, move-list generation, the command deck's positional
guarantees, build mode, feet parsing, free rotation and its snap, backstage modes,
failed-call handling, the print sheet, and the self-rebuild round trip.

They look for controls by **the words on them** rather than by class name, so a test
breaks when the interface stops saying what it does — not when a selector is renamed.

They run on every push and pull request to `main` against Node 20 and 22
(`.github/workflows/tests.yml`). The suite boots the page in a headless DOM, so a
change that breaks the plan, the move derivation, or the self-rebuild fails CI rather
than surfacing during a performance.

## Known limits

- Sync latency is bounded by publish + reload, as above.
- Read-only viewers cannot record anything, so there is no per-crew-member tick-off of
  completed moves. Adding it would require giving every device write access.
- Move assignment to named crew members is not implemented. Everyone sees every move.
- jsdom has no layout, so the sheet heights, popover placement, pinch and pan are only
  asserted as far as they can be there; those are checked in a browser.
