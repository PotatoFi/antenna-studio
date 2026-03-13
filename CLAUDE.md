# CLAUDE.md

## Project Overview

Antenna Creator is a utility for inputting access point specifications and antenna pattern data, visualizing the antenna patterns, and outputting the data for integration by engineering in Hamina Network Planner. For inputting data:

1. Form where the user can input dBi per angle for the azimuth (XY) and elevation planes (which can be either XZ or ZY, both)
2. Draw each antenna plane as a polar chart.
3. Render all three antenna planes in 3D.
4. Export everything to a text file with CSV values per radio

## Input data for Azimuth and Elevation Planes

* Paste in CSV gain per angle, with angle/gain pairs
* Paste multiple patterns in
* Select which plane the pattern belongs on

## Draw each pattern as a polar chart

Show X and Y directions as arrows
Traditional polar chart, automatically adapting for input antenna pattern interval
Show gain markers every 5°
Ability to configure in/max gain markers

## Render Anttenna patterns

Render all three patterns, intersecting with each other in the center
Ability to drag the patterns around with mouse to change perspective
Draw ground plane

## Export Everything

Will specify later

## Technical details

Use CSS, HTML, and JavaScript.

## Physical AP/antenna types

* Disc - Typical round access point, usually ceiling-mounted like a smoke alarm
* Squircle - Typical square access point, usually ceiling-mounted like a smoke alarm
* Hospitality - Typical wall-mounted access point with Ethernet ports on the bottom
* Can - Typical outdoor AP, usually L-bracket mounted
* Patch Panel - Typical patch-panel, usually wall-mounted
* Di-pole - A Typical di-pole antenna, sometimes with an articulating section
* Tube - Special antenna in a tublular radome
* Flat - Sits flat on a table, like a WRT54G
* Standing - Sits upright on a table, like a PlayStation 5

## Antenna Orientation

There are two sets of orientation:

1. The antennaOrientation with it's own X, Y, and Z axis
2. The worldOrientation with it's own X, Y, and Z axis

For antennaOrientation, by default Z should point up. When viewing isometrically, and with the X/Y/Z indicators in the back, farthest from the camera, X should point down/leftward (towards the camera), and Y down/rightward (towards the camera). The X axis is where the AP or antenna should face, if it has a directional pattern. When wall-mounted, this would be at the horizon. When ceiling-mounted, this would be at the floor. When table-mounted, this would be at the ceiling.

worldOrientation never changes, with Z being "up" by default, although the user can change tilt and direction of the camera.

There should be X/Y/Z indicators for both the worldOrientation (which contains the ground plane/floor plane, which should be positioned below the antenna), and X/Y/Z indicators for antennaOrientation.

### Comments from Timo

There are comments about the system from Timo.

"In the case of a directional antenna, which way would you say the antenna should point the beam?" You should point the beam to common axis. Usually this is X if azimuth is X/Y and elevation is Z/X.
 
Azimuth is usually XY, ZX is usually elevation phi:0, ZY is elevation phi:90. There can be exceptions. The point is that the interpolation spins around the z-axis so it matters which way these are
 
I said that you point the beam to common axis but then you need to point the whole antenna towards z-axis. This applies especially to directional antennas where Z goes horizontally out from the wall. In ceiling mounted z is down and in floor mount its up

## Toolbars

I have two other web-apps. I'd like to implement the same styling with the toolbar down the left side, with tools that can be hidden and shown that create popovers/panes. I've included both of the other web app CSS files for you to draw from: spectrum-chart.css and clipboard-syle.css.

Toolbar items:

Edit - Opens the "Edit Antenna" pane, which is on the right. It has the three patterns, stacked. Underneath each pattern there is a "Paste CSV" button and the rotate buttons.

View - Opens the "View" pane, which is on the right. It has:
* Mounting Type
* Model Type
* Coordinate Axis
* Hide and show each plane

Export - Exports a .CSV, including the mounting type and model type

Import - Imports the same .CSV format

Zoom In

Zoom Out
