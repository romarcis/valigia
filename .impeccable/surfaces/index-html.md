---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Trip planner app shell (src/index.html)

Scope: whole app UI (Tauri webview, Windows + Android). Mode: Operate.
Audience/job: plan a multi-stop trip and trust it enough to book; review it on a phone.
Proof/content: real places (Wikipedia images/text), the traveller's own hotel per stop, transport options with sourced times. No invented data, ever.
Constraints: map-first trip view; no chatbot-first flow; no brochure effect.

## Direction contract

THESIS: Every stop is a hotel luggage label stuck on the route; the trip is collected as you plan it. Refuses the category default of photo-hero + card grid + chat box.

OWN-WORLD: Lithographic flat inks. Shell is deep navy #16213f; working ground cool paper-grey #eef0f2; each stop owns one label ink in sequence (vermilion, ochre, ultramarine, bottle green, rose, teal). Labels are ovals/rounded shields with a printed double rule, a big condensed numeral (Big Shoulders Display) and the city name. UI text in Hanken Grotesk. No gradients, no glass, no soft shadows: flat ink, 1.5px printed rules, crisp offset only on the active label.

STORY: The user sees the whole route at a glance, opens one stop, sees what to see, where to sleep, how to move, and knows every number has a source.

FIRST VIEWPORT: Desktop: left 420px persistent panel (stop rail of numbered label chips on top, then tabs Itinerario / Luoghi / Spostamenti for the active stop); right the map full-height with route line and label markers. Mobile: map top 45%, bottom sheet with the same panel. Primary action "Nuovo viaggio" in navy header.

FORM: Hotel luggage labels, my list position 3; seed key 5c44399e. Signature move: stop markers are luggage labels; selecting a stop "stamps" its label (slight rotation + offset print) and tints the panel header in that stop's ink. Raises: persistent panels (console); sequence numbers as handles (Saville); distinct printed state marks (reference setting).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
