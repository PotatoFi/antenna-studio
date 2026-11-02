# CLAUDE.md

## Project Overview

Antenna Studio is a utility for inputting access point specifications and antenna pattern data, visualizing the antenna patterns, and outputting the data.

## Technical Details

Pure vanilla HTML, CSS, and JavaScript — no frameworks or build tools. Five files, loaded in this order (they share globals as classic scripts):
* `index.html` — DOM structure (toolbar, edit pane, canvas, radio tab bar, tracer overlay)
* `styles.css` — all styling
* `app.js` — all studio logic (~3000 lines)
* `tracer.js` — the pattern tracer overlay (see below), self-contained in an IIFE
* `project.js` — .antstudio project save/open (dependency-free ZIP read/write), unsaved-change tracking

Reference style files from sibling projects: `clipboard-style.css`, `spectrum-style.html`. The floating UI style (fixed position, `border-radius: 6px`, `box-shadow`, `var(--panel-bg)`) comes from the clipboard project's `.input-panel` pattern.

## Architecture

### Data Model

**Multi-radio system**: The app supports multiple radio bands (default: 2.4 GHz, 5 GHz, 6 GHz). Each radio is an object with its own:
* `elements` — one or more antenna elements (`activeElementIndex` selects one). Each has three pattern arrays (`azimuth`, `elevationXZ`, `elevationYZ`) of `{angle, gain}` points, plus `traces` (tracer state per plane data key, only for planes traced from an image)
* `minGain`/`maxGain`
* `planeVisibility` — per-plane show/hide state

Access the active radio's data via `getAntennaData()` and `getPlaneVisibility()` — never reference a radio's properties directly from UI code.

**Shared state** (not per-radio):
* `antennaOrientation` — mount type, rotation (X/Y/Z Euler angles)
* `apModel` — formfactor type (disc, squircle, hospitality, can, patch, dipole, tube, flat, standing, box)
* `worldOrientation` — ground plane Z position
* `view3D` — camera rotation, zoom, axis visibility
* AP/Antenna name (text input)

### Coordinate Systems

Two coordinate systems with separate axis indicators:
1. **antennaOrientation** (local) — Z is "out" from mounting surface, X is beam direction
2. **worldOrientation** (fixed) — Z is always up

Mount type presets rotate the antenna coordinate system:
* Ceiling: rotationX=180 (Z points down)
* Wall: rotationX=90 (Z points horizontally)
* Table: rotationX=0 (Z points up)

Axis colors are consistent everywhere:
* X: `#e04040` (red) — YZ pattern rotates around X
* Y: `#40b040` (green) — XZ pattern rotates around Y
* Z: `#4080e0` (blue) — XY/Azimuth pattern rotates around Z

### Angle Conventions

**Azimuth** (XY plane): standard, `0°` along +X, increasing toward +Y.

**Elevation** (XZ and YZ planes): standard spherical theta. `theta=0°` is along +Z (zenith), `theta=90°` is in the XY plane. So for the XZ plane, `theta=90°` is along +X; for the YZ plane, `theta=90°` is along +Y. `theta=180°` is along −Z.

CSV export records `# Format Version,2` for this convention. Files without an explicit version are treated as v1 legacy (elevation angles measured from horizon) and elevation arrays are converted on import via `theta = (90 − oldAngle + 360) mod 360`.

### Rendering

3D uses a 2D canvas with manual orthographic projection and painter's algorithm for depth sorting. The pipeline: antenna-local coords -> `antennaToWorld()` -> `projectWorldToScreen()` -> 2D canvas drawing.

2D polar charts in the edit pane use separate canvases, scaled for devicePixelRatio.

### Comments from Timo

"In the case of a directional antenna, which way would you say the antenna should point the beam?" You should point the beam to common axis. Usually this is X if azimuth is X/Y and elevation is Z/X.

Azimuth is usually XY, ZX is usually elevation phi:0, ZY is elevation phi:90. There can be exceptions. The point is that the interpolation spins around the z-axis so it matters which way these are.

The whole antenna should be directed towards z-axis. This applies especially to directional antennas where Z goes horizontally out from the wall. In ceiling mounted z is down and in floor mount, its up.

## UI Layout

### Radio Tab Bar
Floating pill centered at top of viewport (`position: fixed`, centered with `left: 50%; transform: translateX(-50%)`). Tabs switch between radios. Double-click to rename, right-click to remove, "+" to add. Style matches the clipboard project's `.input-panel`.

### Left Toolbar
Fixed vertical button strip (top-left). Buttons:
* **Edit** — toggles the right pane with pattern editors (polar charts, paste CSV, rotate, swap, mirror, delete per plane)
* **Mount** — dropdown: antenna name input + mounting type (ceiling/wall/table)
* **Model** — dropdown: AP formfactor selection (11 types)
* **View** — dropdown: axis toggles, ground plane, plane visibility, gain range sliders
* **Open** — file picker for .antstudio projects or pattern CSVs (also supports drag-and-drop); `openFile()` in `project.js` detects ZIPs by signature
* **Save** — downloads the .antstudio project
* **Export CSV** — downloads the CSV export
* **Zoom In/Out**

### Right Pane
Slides in from right, pushing the canvas. Contains the Edit Antenna view with three pattern sections (azimuth, elevation XZ, elevation YZ), each with polar chart + controls (paste, paste gain-only, trace, rotate, swap, mirror, delete).

### Tracer Overlay
Each plane's Trace button opens a full-screen overlay (`tracer.js`, merged in from the former standalone Antenna Tracer). Load a datasheet image, align it, set the inner/outer reference circles and their gains, and drag control points along the pattern. **Apply to Plane** writes the result via `setPattern(plane, data)` in `app.js` (shared with clipboard paste) to the active radio/element.
* Tracer angles have 0° at the top of the image, increasing clockwise; studio polar charts have 0° at the top, increasing counter-clockwise. Apply mirrors angles (`(360 − a) mod 360`), so the trace looks the same in the Edit pane chart as on the image. Copy CSV (`C`) keeps raw tracer angles.
* Each plane keeps its own trace on its element (`element.traces[dataKey]`): the image file (`imageBlob`, `imageFileName`) and its placement, circles/gains, resolution, interpolation, and all points. Opening restores it; closing stores it whether or not it was applied. A plane with no image stores nothing. Swap moves traces with their planes; Delete clears the plane's trace; rotate/mirror/reorient leave traces alone (re-applying a trace overwrites the pattern).
* Each trace owns its image; images are never shared between planes. The Blob is decoded when the plane's tracer opens.
* While open, the tracer's capture-phase key handlers swallow keys so studio hotkeys don't fire; Esc closes it. Its drag/drop handlers stop propagation so the studio's file-import drop doesn't trigger.
* Example images are in `examples/tracer/`.

## Project Format (.antstudio)

The main save format. A ZIP archive containing:
* `project.json` — authoritative state: `format: "antenna-studio-project"`, `version`, `name`, `apModel`, `antennaOrientation`, `worldOrientation`, `view` (camera, axis/label toggles, display rotations, ground plane), `activeRadioIndex`, and `radios` (with elements, patterns and traces). In the file, each trace's `imageBlob` is replaced by `image` (its path in the archive) and `imageSize`
* `patterns.csv` — the CSV export below, for use without the app; ignored on open
* `images/<radio>-<element>-<plane>-<name>` — each trace's original image bytes, stored uncompressed

Opening reads and validates everything before replacing state, so a bad file leaves the current project untouched. A trace whose image is missing from the archive is dropped. Missing fields fall back to defaults; a newer `version` than `PROJECT_VERSION` is refused. Bump `PROJECT_VERSION` when changing the meaning of existing fields.

Unsaved changes are detected by comparing a serialized snapshot (minus camera angle/zoom) with the one taken at the last save/open; `beforeunload` warns, and opening a file asks first.

## CSV Export/Import Format

CSV-like text file with markdown headers. Multi-radio format:
```
# Antenna Pattern Export
# Generated by Antenna Studio
# Format Version,2

## Antenna Properties
Name,<name>
Mounting Type,<ceiling|wall|table>
Formfactor,<name>

## Radio: 2.4 GHz
Min Gain,-50
Max Gain,10

### Azimuth (XY Plane)
Angle,Gain(dBi)
0,5.00
...
```

Empty planes are omitted from export. Import auto-detects multi-radio format (looks for `## Radio:` headers) and falls back to legacy single-radio format. Files without `# Format Version` are treated as v1; elevation angles are converted from horizon-relative (legacy) to theta-from-zenith (current) on import.

## Physical AP/Antenna Types

* Disc — round ceiling AP (smoke alarm shape)
* Squircle — rounded-square ceiling AP
* Hospitality — rectangular wall-mount with ports on bottom
* Can — cylindrical outdoor AP
* Patch Panel — flat wall-mount panel
* Dipole — thin vertical antenna
* Tube — tubular radome antenna
* Flat — table-top router (WRT54G style)
* Standing — upright device (PlayStation 5 style)
* Box — generic rectangular AP
