# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Web UI shipped inside a Tauri 2 shell for Windows desktop and Android phones. Design language is the app's own, not Fluent or Material.)

## Stack

Tauri 2 + web UI (user choice). Builds: Windows (.msi/.exe) and Android (.apk).

## Users

People planning a multi-stop trip (several cities or regions, hotel changes along the way). App is distributed to others, not personal-only: first-run must explain itself and errors must be human. Used on a Windows desktop while planning at length, and on an Android phone to review or tweak the plan on the go.

## Product Purpose

Turn "I want to go to X, Y, Z for N days" into a concrete plan: places worth seeing (image + text), a day-by-day itinerary, the traveller's own hotel per stop as the base of each day, and the best way to move between and within stops (car, metro, bus, train). Success = the user leaves with a plan they trust enough to book.

## Positioning

Bring-your-own-AI: the user connects their own AI (OpenRouter sign-in, a Gemini key, or an OpenAI-compatible endpoint); no account, no middleman, no subscription to us. Transport times and fares come from the AI's live web search with cited sources, never from invented data.

## Capabilities and Constraints

- AI providers (user decision 2026-10-13): OpenRouter is the recommended one — "Sign in with OpenRouter" via OAuth PKCE headless flow (user pastes a code), one credit for Claude/GPT/DeepSeek/free models, web search via the `web` plugin (~$0.005-0.007 per search, also on free models). Free alternative: Google Gemini AI Studio key, model selectable (default gemini-3.8-flash, user decision 2026-10-13; 2.5-flash/flash-lite keep free search grounding, 500/day). Search grounding is not available on free-tier keys (paid tier: 5,000 free searches/month); on free keys the app answers without search and flags hotels/transport unverified. Free-tier data is used by Google — say so. DeepSeek direct API key (user request 2026-10-13; models deepseek-flash, deepseek-v4-pro; no web search, data flagged unverified). Consumer subscriptions (Claude Pro/Max, ChatGPT Plus) cannot be connected — the app must say so plainly.
- Scope (user decision 2026-10-14): Valigia plans only the itinerary once at the destination; the journey there and back (flights, car, motorbike) is out of scope.
- Hotels (user decision 2026-10-14): the app never suggests or searches hotels. The traveller types the hotel they booked for each stop; it is placed on the map and every day's walk starts and ends there. The new trip is a step-by-step wizard (what, when, where, who, stops), one question per screen.
- Real data via provider web search with cited URLs; transport data without a source is shown as unverified.
- Place images and descriptions: Wikipedia/Wikimedia (free, no key).
- Languages: Italian and English, user-selectable; AI output follows the chosen language.
- Keys stored locally on the device only.

## Evidence on Hand

None yet: no logo, no brand assets, no testimonials. Do not fabricate reviews, ratings, prices or user counts anywhere, including demo/empty states.

## Product Principles

1. Trust over flash: every factual claim (rating, price, travel time) shows where it came from.
2. The plan is the product: itinerary, hotel and transport are one connected plan per stop, not separate tools.
3. Your key, your data: nothing leaves the device except calls to the provider the user chose.
4. Works on a phone in a station: the mobile view is a first-class reader of the plan.
