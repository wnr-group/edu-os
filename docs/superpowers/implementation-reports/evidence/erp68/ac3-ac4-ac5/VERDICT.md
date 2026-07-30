# Task 3 Verdict — AC-3, AC-4, AC-5: Map interaction runtime verification

**Overall: AC-3 PASS. AC-4 PASS (with a UX caveat, see Deviations). AC-5 PASS.**

Test fixture: throwaway geofence `QA Map Test` (`id = 756a868e-3ddf-48c6-9836-62dfb3e4f7fa`),
created and deleted during this run. Baseline (`Main Campus`, 1 row) confirmed restored after cleanup.

## AC-3: Drag the center marker / drag the radius handle

**PASS.**

- Created `QA Map Test` at `18.4600, 73.8650`, radius `200` — confirmed in DB (`01-created.txt`).
- Dragged the center marker (indigo pin, 30×30 divIcon, identified by bounding-box size among
  the two `.leaflet-marker-icon.leaflet-marker-draggable` elements) 40px right / 20px up using
  real `page.mouse.down/move/up` events.
  - Latitude/Longitude inputs updated live: `18.46, 73.865` → `18.460416762808983, 73.86584758758546`
    (screenshots `02-before-center-drag.png` → `03-after-center-drag.png`; visible pin/circle shift
    in the screenshots, both markers well within the 900px viewport).
- Dragged the radius handle (14×14 divIcon, due east of center) ~30px outward along the
  center→handle vector.
  - Radius slider and textbox both updated from `200` → `265` (screenshots
    `04-before-radius-drag.png` → `05-after-radius-drag.png`); dashed circle visibly grew.
- Clicked "Save geofence"; DB confirmed (`06-after-drag-save.txt`):
  `center_lat=18.460416762808983, center_lng=73.86584758758546, radius_m=265` — exactly the
  UI-displayed dragged values, and all three differ from the Step-2 starting values.

## AC-4: Manual latitude/longitude edit

**PASS, with a caveat** (see Deviations below).

- Set Latitude input to `18.4700` and Longitude input to `73.8500` via `.fill()`.
- Confirmed via direct DOM inspection that the underlying Leaflet `Marker` element's position
  did change (its bounding box moved) immediately on each keystroke-equivalent edit — i.e. the
  live-bound `draft.center_lat`/`center_lng` → `Marker`/`Circle` `position`/`center` props wiring
  works correctly, and the new values persisted to the DB in the final Step-8 check (`10-final-persisted.txt`).
- Screenshot: `07-after-manual-latlng.png` (form shows `18.4700` / `73.8500`; sidebar list still
  shows the pre-save `265m, 18.4604, 73.8658` summary, which is correct — the list only refreshes
  after a successful save).

## AC-5: Radius slider ↔ textbox sync

**PASS.**

- Dragged the radius slider (mouse down/move/up on the range track, after `scrollIntoViewIfNeeded()`
  — see Deviations) from `265` to a new position; slider and textbox both updated in sync to `3017`
  with no reload (screenshot `08-slider-to-textbox.png`).
- Cleared the textbox and typed `750`; slider thumb moved to reflect `750` and the textbox held
  `750` exactly (screenshot `09-textbox-to-slider.png`). Dashed circle visibly grew/shrank live in
  both directions.
- Saved, did a full `page.reload()`, re-selected `QA Map Test`: DB and UI both show
  `center_lat=18.47, center_lng=73.85, radius_m=750` (`10-final-persisted.txt`,
  screenshot `11-after-reload.png`) — matching Steps 6-7's final on-screen values exactly, surviving
  the hard reload.

## Cleanup

Deleted `QA Map Test` via the trash icon; native `window.confirm()` dialog was accepted
programmatically. Toast confirmed "Geofence deleted." DB count for the test id returned `0`.
Baseline re-verified: only `Main Campus` (`r=100m, 18.4581, 73.8658`) remains for the demo school.

## Deviations / findings worth flagging

1. **Radius slider initially appeared unresponsive to a raw mouse drag** — root cause: the
   slider sits below the fold in a 900px-tall viewport (`boundingBox().y ≈ 1007`), so a
   coordinate-only `page.mouse` drag landed outside the visible viewport and was a no-op on the
   first attempt. Fixed by calling `scrollIntoViewIfNeeded()` on the slider before computing its
   bounding box; the drag then worked correctly and is reflected in `08-slider-to-textbox.png`.
   This is a test-tooling artifact, not an app bug — but it's worth knowing the radius control can
   be off-screen on shorter viewports/laptops without scrolling.

2. **The map viewport does not auto-pan/recenter on manual latitude/longitude edits.**
   `GeofenceMap`'s `<MapContainer center=... zoom={16}>` only uses `center` as the *initial* view;
   there is no effect that re-centers the map when `centerLat`/`centerLng` change from typing in
   the number inputs (only the search-select path has `FlyToOnSelect`, and only marker
   drag/`ClickToDropPin` naturally stay within the current view). Verified concretely: after
   editing Latitude/Longitude to `18.4700`/`73.8500` (~1.1 km shift from `18.4604`/`73.8658` at
   zoom 16, whose viewport covers roughly 700-1000m), the marker's DOM bounding box moved to
   `y ≈ -35` — i.e. clipped outside the visible map container entirely. The pin is not visible
   in `07-after-manual-latlng.png`'s map pane, even though the coordinate/state update is 100%
   correct and persists properly.
   - This does **not** invalidate AC-4's core claim (state binding into `Marker`/`Circle` props is
     correct and verified by direct DOM inspection + DB persistence), but the brief's literal
     "confirmed visually" expectation is not met for edits large enough to leave the current view.
     Recommend the team consider adding a `map.panTo()`/`flyTo()` effect on manual coordinate
     edits (mirroring `FlyToOnSelect`) so the marker stays visible after typed edits, matching
     the UX of drag and search-select.

## Evidence index

| File | Step | Content |
|---|---|---|
| `01-created.txt` | 2 | DB row after create: `18.46, 73.865, r=200` |
| `02-before-center-drag.png` | 3 | Map/form before center-marker drag |
| `03-after-center-drag.png` | 3 | Map/form after center-marker drag (lat/lng changed) |
| `04-before-radius-drag.png` | 4 | Map/form before radius-handle drag |
| `05-after-radius-drag.png` | 4 | Map/form after radius-handle drag (radius 200→265) |
| `06-after-drag-save.txt` | 5 | DB row after save: matches dragged values exactly |
| `07-after-manual-latlng.png` | 6 | Form after manual lat/lng edit to `18.4700`/`73.8500` |
| `08-slider-to-textbox.png` | 7a | Slider drag → textbox synced to `3017` |
| `09-textbox-to-slider.png` | 7b | Textbox typed `750` → slider synced |
| `10-final-persisted.txt` | 8 | DB row after save+reload: `18.47, 73.85, 750` |
| `11-after-reload.png` | 8 | UI after hard reload, `QA Map Test` selected with final values |
