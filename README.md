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
  list can never drift out of sync with the plan.
- **Routes are physical.** A piece going from the aux stage to the stage animates
  *through* wing SR. Wing SR to wing SL goes around the upstage crossover, never across
  the stage.
- **Calling the show.** The SM advances the scene; every open device reloads to it and
  plays the transition.
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
  filter, unsaved edits) live in `localStorage`.
- Editing does **not** publish. Changes collect locally and go out on an explicit
  **Save & sync**. Only calling a scene publishes immediately.
- A viewer with read-only access cannot publish; the page detects the rejection and
  switches to a read-only presentation.

The self-rebuild is the load-bearing trick, so `test.js` asserts a full round trip:
rebuild the document, boot it in a fresh DOM, and check it renders from its embedded
state.

## Interface notes

The command deck is pinned to the bottom edge of the screen deliberately:

- The primary target sits **on** the screen edge, so it cannot be overshot, and it is
  by far the largest control on the page.
- It **never moves or changes meaning**, including while browsing other scenes, so the
  thumb learns one location. Jumping the show to a different scene is a separate,
  explicitly labelled control that appears above the rail rather than replacing the
  primary.
- No more than three controls are reachable during a run. Everything else lives behind
  the Build panel.
- Crew get the same block in the same place, but flat and unclickable — a glanceable
  read-out rather than a button that could push the show forward by accident.

## Running it

Open `index.html` in a browser, or visit the Pages site.

`ghost-light.html` is the source of truth, authored as a **fragment** — no `<!doctype>`,
`<html>` or `<body>` — because the Claude Artifact host supplies that shell itself.
`index.html` is generated from it by `build-pages.js`, which adds the shell plus the
`viewport` meta the fragment has no way to carry. That meta matters: without it a phone
lays the page out at ~980px and zooms out, which defeats a command deck sized for a
thumb.

```bash
npm run build        # regenerate index.html after editing ghost-light.html
```

CI fails if `index.html` drifts from the source, so the two cannot silently diverge.

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

37 checks covering route derivation, move-list generation, the command deck's
positional guarantees, backstage modes, failed-call handling, the print sheet, and the
self-rebuild round trip.

They run on every push and pull request to `main` against Node 20 and 22
(`.github/workflows/tests.yml`). The suite boots the page in a headless DOM, so a
change that breaks the plan, the move derivation, or the self-rebuild fails CI rather
than surfacing during a performance.

## Known limits

- Sync latency is bounded by publish + reload, as above.
- Read-only viewers cannot record anything, so there is no per-crew-member tick-off of
  completed moves. Adding it would require giving every device write access.
- Move assignment to named crew members is not implemented; the side filter
  (`All` / `SR side` / `SL side`) is the substitute.
