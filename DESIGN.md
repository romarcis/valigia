---
name: Valigia
description: Multi-stop trip planner where every stop is a hotel luggage label stuck on the route.
colors:
  navy: "#16213f"
  navy-2: "#24325c"
  paper: "#e9ecef"
  sheet: "#eef0f2"
  rule: "#cdd3db"
  field-stroke: "#aab2bf"
  quiet-hover: "#e7eaf0"
  text: "#19203a"
  muted: "#565f73"
  focus: "#2a47a0"
  warn-bg: "#fbecc8"
  warn: "#6b4a05"
  danger: "#b0321f"
  white: "#ffffff"
  ink-vermilion: "#c8402a"
  ink-ochre: "#e3a72b"
  ink-ultramarine: "#2a47a0"
  ink-bottle-green: "#1f6b4c"
  ink-rose: "#b8506f"
  ink-teal: "#1d6f78"
  map-land: "#e6e9ed"
  map-water: "#b4c6db"
  map-green: "#d6dfd4"
  map-type: "#2c3654"
typography:
  display:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 0.8
  headline:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 0.95
  title:
    fontFamily: "'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
  subtitle:
    fontFamily: "'Hanken Grotesk Variable', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "'Hanken Grotesk Variable', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "'Hanken Grotesk Variable', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  label-caps:
    fontFamily: "'Hanken Grotesk Variable', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  thumb: "4px"
  r: "6px"
  pill: "999px"
  oval: "50% / 46%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.r}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.navy-2}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.r}"
    padding: "8px 16px"
    height: "40px"
  button-quiet-hover:
    backgroundColor: "{colors.quiet-hover}"
  button-ink:
    backgroundColor: "{colors.ink-vermilion}"
    textColor: "{colors.white}"
    rounded: "{rounded.r}"
    padding: "8px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.r}"
    padding: "8px 12px"
    height: "42px"
  stop-chip:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.oval}"
    padding: "5px 13px 5px 6px"
  stop-chip-active:
    backgroundColor: "{colors.ink-vermilion}"
    textColor: "{colors.white}"
  stop-label:
    backgroundColor: "{colors.ink-vermilion}"
    textColor: "{colors.white}"
    rounded: "{rounded.oval}"
    padding: "6px 14px 7px"
    width: "64px"
  tag-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
---

# Design System: Valigia

## Overview

**Creative North Star: "The Luggage Label Collection"**

Valigia prints a trip the way a 1950s hotel printed its luggage labels: flat lithographic inks on cool paper, a navy shell, and one label per stop stuck on the route. Each stop owns one ink in travel order. Selecting a stop "stamps" its label on the map (a small rotation plus a misregistered second print run) and floods the stop header and active controls with that ink. The trip is collected as you plan it.

The working surface is a persistent console: a fixed-width panel of stop chips, tabs and sourced figures beside a full-height map that has been repainted in the app's own paper and ink. The density is a reference setting, not a brochure. Big condensed numerals act as handles (stop 01, price, score, day), and every figure sits next to its source.

Depth comes from print, never from light. Surfaces are flat ink, separated by 1.5px printed rules. The only offset in the system is the stamped active label.

**Key Characteristics:**
- Navy shell, cool paper-grey working ground, six sequenced stop inks.
- Ovals with a printed double rule (outer ink, thin inner hairline) as the signature form.
- Big Shoulders Display 800 for numerals and uppercase place names; Hanken Grotesk for everything read.
- 1.5px rules carry structure; no blurred shadows, no glass.
- A per-stop ink is set once as `--ink` / `--on-ink` and every ink-bearing part reads it.

## Colors

A cool navy-and-paper neutral frame that stays quiet so six saturated label inks can identify stops.

### Primary
- **Shell Navy** (navy): app bar, primary buttons, headings on paper, active segmented option, route line on the map, text on the ochre ink. Hover deepens toward **Night Navy** (navy-2).

### Secondary: the stop inks
Assigned by stop index, cycling: **Vermilion** (ink-vermilion), **Ochre** (ink-ochre, carries navy text, all others carry white), **Ultramarine** (ink-ultramarine), **Bottle Green** (ink-bottle-green), **Rose** (ink-rose), **Teal** (ink-teal). An ink fills the stop's map label, rail chip number, stop header, place pins, the "Scelto" hotel button, the transport icon disc, the timeline rule and the active tab underline. Tints of the active ink (9-16% over sheet) mark the chosen hotel row and empty image wells.

### Neutral
- **Cool Paper** (paper): page ground behind everything.
- **Sheet Grey** (sheet): the panel and floating map controls.
- **Hairline Grey** (rule): light dividers between list rows and the rail bottom.
- **Field Stroke** (field-stroke): resting input border.
- **Quiet Hover** (quiet-hover): hover fill for quiet buttons and segments.
- **Ink Text** (text) and **Slate Muted** (muted): body copy and secondary copy; muted carries meta, hints, field labels and summaries.
- **Link Blue** (focus): focus ring, links, focused field border. Same value as the Ultramarine ink.
- **Warning Cream / Warning Brown** (warn-bg / warn): notes and the "Non verificato" tag. **Brick** (danger): destructive actions and errors.

### Map
The basemap (OpenFreeMap Positron) is repainted at load: **Map Land** background, **Map Water** fills and rivers, **Map Green** parks, white roads with cool-grey casings, **Map Type** labels on a sheet-colored halo, italic label fonts replaced with upright Noto Sans. Map label glyphs come from the tile server, so they cannot use the app's typefaces.

### Named Rules
**The One Ink Per Stop Rule.** A stop's ink is set once as `--ink` / `--on-ink` from the sequence and inherited; components never pick a stop color themselves. Ochre pairs with navy text, every other ink with white.

**The Quiet Frame Rule.** Navy, sheet and paper carry the interface; saturated color appears only as a stop ink or a status (warn, danger).

## Typography

**Display Font:** Big Shoulders Display (800, 600 loaded) with Arial Narrow fallback
**Body Font:** Hanken Grotesk Variable with system-ui fallback

**Character:** A tall condensed poster face for numbers and stamped place names against a plain, sturdy grotesk for reading. Tabular numerals are on globally.

### Hierarchy
- **Display** (800, 64px, 0.8; 48px under 860px): the stop numeral in the inked stop header.
- **Headline** (800, 40px, 0.95, uppercase; 32px under 860px): stop city name, pane titles (Settings, New trip, empty state).
- **Title** (800, 24-30px, 1, display face): price figures (30px), day numbers and transport headings (24-26px, uppercase), score values, numbered stop rows.
- **Subtitle** (700, 17-18px, 1.2-1.25, Hanken): place, hotel and provider names.
- **Body** (400, 15px, 1.5): reading text; long summaries cap at 65ch; secondary copy 14px in muted.
- **Label** (600, 13px): field labels, hints, meta lines, source links. Small caps-style label (700, 11px, 0.08em, uppercase) appears only as the city line inside a map label; tags use 700, 12px, 0.02em.

### Named Rules
**The Numeral Handle Rule.** Numbers that a user scans (stop index, price, score, day) are set in the display face at 800; the units and qualifiers under them fall back to 12px Hanken in muted.

**The Uppercase Belongs To Places Rule.** Uppercase is reserved for display-face place and pane names, the wordmark, and the map label city line. Body and UI labels stay sentence case.

## Layout

A console: an app bar, then a two-column workspace with a fixed 460px panel on the left (scrolling independently, closed by a 1.5px navy rule) and the map filling the rest at full height. Inside the panel the stop rail sticks to the top, the tabs stick under it, and tab panels pad 20px.

Under 860px the workspace stacks: the map takes a sticky 44dvh band on top, the panel flows below it with a navy top rule, and rail and tabs stop being sticky. Two-column form grids collapse to one; place rows shrink their image column from 140px to 104px.

Spacing runs on a 4px base with working steps of 6, 8, 12, 16, 20 and 24px; list rhythm is 22px between places and 30px between itinerary days. Map controls float 16px from the map edge; fitted bounds keep 72px padding so labels stay in frame.

## Elevation & Depth

Flat. Depth is printed: surfaces sit side by side separated by 1.5px rules, and emphasis is carried by ink fill rather than lift. Inset box-shadows are used only to draw the printed double rule inside ovals; they are line work, not light. The basemap supplies the only texture.

### Shadow Vocabulary
- **Printed double rule** (`box-shadow: inset 0 0 0 3px var(--ink), inset 0 0 0 4.5px var(--on-ink)`): map labels and the wordmark; chips use a 2px/3px version, pins 2px/3px.
- **Stamp offset** (`::after` 1.5px ink outline translated 4px, 4px): only on the active map label.

### Named Rules
**The Print Not Light Rule.** No blurred or ambient shadows, no glass or backdrop blur. If something needs separation, give it a rule or an ink fill.

**The Single Stamp Rule.** The misregistered offset belongs to the one active stop label. Nothing else on screen is offset.

## Shapes

Two families. Working controls (buttons, fields, segmented controls, notes, image wells) are gently squared at 6px. Identity marks are round: stop labels are ovals (50% / 46%), rail chips and pins are full ovals, tags, the map overview toggle, icon buttons and the wordmark are pills. Structural lines are 1.5px; list-row dividers drop to 1px hairline. Tabs mark selection with a 4px ink underline. Timeline nodes are 9px rings on a 1.5px ink spine.

## Components

### Buttons
Firm, flat and quick.
- **Shape:** gently squared (6px), 40px min height, 600 weight, 1.5px border slot.
- **Primary:** Shell Navy fill, white text; hover Night Navy. Wide variant spans the form at 48px / 16px.
- **Ink:** fills with the active stop ink (the "Scelto" choice); hover brightens 8%.
- **Quiet:** transparent with a navy 1.5px border and navy text; hover Quiet Hover fill.
- **On navy:** in the app bar, slate border (#5d6b94) and white text; hover Night Navy.
- **Danger quiet:** Brick text, underline on hover. **Danger:** Brick fill.
- **States:** press nudges 1px down; disabled drops to 50% opacity with a not-allowed cursor; a busy disabled button stays at 80% with a progress cursor. A disabled action that needs input carries a hint line above it saying what is missing.
- **Icon buttons:** 40px circles, transparent border that turns white on hover or pressed in the app bar.

### Stop chips (the rail)
- **Style:** oval with a 1.5px ink border and the inner hairline in sheet, holding a pill numeral (display 800, 17px) in ink and the city name in 600.
- **State:** hover takes a 10% ink tint; active fills with the ink and inverts the numeral pill; a busy stop breathes its numeral (1.4s).

### Tags
- **Style:** pills, 12px 700, 1.5px currentColor border. Verified tags are bottle green on transparent; warning tags are Warning Brown on Warning Cream with no border; ink tags fill with the stop ink.

### Inputs / Fields
- **Style:** white fill, 1.5px Field Stroke border, 6px radius, 42px min height, label above in 13px 600 muted. Selects carry a navy chevron.
- **Focus:** Link Blue 2px outline flush to the border, border turns Link Blue. Hover turns the border navy.
- **Segmented control:** 1.5px navy outline, 1.5px internal dividers, selected option filled navy with white text.

### Navigation
- **App bar:** navy band holding the double-ruled pill wordmark (display 800, 28px, uppercase; 22px on phones), the trip switcher (Night Navy select), the new-trip button and settings.
- **Tabs:** 700 muted labels; selected turns Ink Text with a 4px underline in the stop ink sitting on the navy rule.

### Stop header (signature)
A full-width block flooded with the active stop ink: display numeral at left, uppercase headline city, dates and chosen hotel in 600 below, refresh as an ink-outlined circle. Ink changes cross-fade over 0.5s.

### Luggage label marker (signature)
The map's stop marker: an ink oval with the printed double rule, a two-digit display numeral (22px) over the uppercase city line. Hover tilts it -2deg; the active label tilts -5deg, rises above the others and shows its stamp offset, over 0.45s on the out-expo curve. Place pins are smaller numbered ovals in the active stop's ink.

## Do's and Don'ts

### Do:
- **Do** take each stop's color from the ink sequence via `--ink` / `--on-ink`, cycling by stop index.
- **Do** separate surfaces with 1.5px rules (navy for structure, Hairline Grey for list rows) instead of shadows.
- **Do** set scannable numbers in Big Shoulders Display 800 and their units in 12px Hanken muted.
- **Do** draw identity marks as ovals or pills with the printed double rule; keep working controls at 6px.
- **Do** repaint any new map layer in the paper, water and navy values of the tinted basemap.
- **Do** honor reduced motion: all transitions and animations switch off.

### Don't:
- **Don't** use blurred shadows, glass or backdrop blur; depth is print.
- **Don't** put gradients on surfaces. The loading shimmer is the only gradient, and it is a loading state, not a surface.
- **Don't** offset or rotate anything except the active stop label.
- **Don't** introduce a stop color outside the six-ink sequence.
- **Don't** set body or UI labels in uppercase; uppercase belongs to display-face place names and the label city line.
