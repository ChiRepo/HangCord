# HangCord Design System — Calm Minimal (current)

_Approved by the owner on 2026-10-21. Replaces the earlier Lantern-orange / Manrope look for all visual styling._

Built with the installed design skills: UI/UX Pro Max's chat-app recommendation (minimal, Swiss-style, micro-interactions) applied with Bencium's controlled-designer rules (flat surfaces, hierarchy by size/weight/space rather than shadows, ask the owner before any new visual decision).

## 0. How this relates to the earlier design
- **This folder decides how things look:** colours, type, spacing, shapes, motion, presence badges.
- **`ui-ux/screens/` (earlier design) still decides what's on screens that haven't been redesigned yet** — Lounge watch-together, DMs, Roles, Room permissions, Security, Create account, Brand sheet, and features such as the BETA pill, memory chip, "Catch me up", translation, reminders. Build those features with **this** look until the owner approves a Calm Minimal version of the screen.
- Where both have a version of a screen, the Calm Minimal one wins.

## 1. Principles
1. **Calm for long sessions.** Dark graphite, low-chroma surfaces, one warm brand colour. Colour means something (action, presence, danger) — never decoration.
2. **Flat and honest.** No drop shadows, glass or gradients on UI chrome. Separate with 1px borders and surface steps.
3. **Content first.** Messages, voices and people are the hero; chrome recedes.
4. **Every element earns its place.** If removing it loses nothing, remove it.
5. **Premium means round and soft** where it matters — avatars, presence badges, call controls, pills.
6. **Instant feel.** Optimistic UI everywhere; nothing waits on the network to render.

## 2. Colour (dark theme — default)
Use the CSS variables in `tokens.css`; never hard-code hex in components.

| Token | Hex | Use |
|---|---|---|
| `--hc-bg` | `#111316` | app background, hangout dock |
| `--hc-panel` | `#181B20` | rooms list, members list, cards |
| `--hc-surface` | `#1D2026` | message area |
| `--hc-raised` | `#22262D` | inputs, hover rows, popovers |
| `--hc-line` | `#2A2F37` | 1px borders |
| `--hc-line-strong` | `#3A404A` | focused/selected outlines |
| `--hc-scrim` | `rgba(0,0,0,.55)` | dims the app behind dialogs, sheets and overlays (added 2026-10-21 — owner to confirm) |
| `--hc-text` | `#ECEEF1` | primary text |
| `--hc-text-muted` | `#A9B0BA` | secondary text, room names |
| `--hc-text-dim` | `#858E9B` | timestamps, hints (never below 12px) |
| `--hc-lantern` | `#F2A93B` | brand: primary action, selected hangout, mentions, focus ring |
| `--hc-on-lantern` | `#1A1205` | text/icons on Lantern |
| `--hc-lantern-tint` | `rgba(242,169,59,.12)` | mention row background |
| `--hc-moss` | `#34C77B` | online, speaking ring, success |
| `--hc-honey` | `#D9B54A` | idle, warnings, reminders |
| `--hc-ember-text` | `#F0605A` | do-not-disturb, error text |
| `--hc-ember` | `#B8322C` | danger fills (leave call, delete) with white text |
| `--hc-sky` | `#86B6FF` | links, info |

**Measured contrast (WCAG):** `--hc-text` ≥ 13:1, `--hc-text-muted` ≥ 6.9:1, `--hc-text-dim` ≥ 4.58:1 on every surface; Lantern text ≥ 7.6:1; on-Lantern 9.3:1; white on `--hc-ember` 5.95:1; `--hc-ember-text` on bg 5.78:1. Re-measure any new colour before using it.

Light theme: not redesigned yet — keep the earlier Paper values until the owner approves a Calm Minimal light theme.

## 3. Typography
- Headings / display: **Space Grotesk** 500–700 (OFL).
- UI and messages: **Inter** 400/500/600 (OFL).
- Code: **JetBrains Mono** 400 (OFL).
- Bundle the fonts with the desktop app (no runtime Google Fonts request).

| Role | Size / line-height | Weight |
|---|---|---|
| Display (welcome, onboarding) | 32–40 / 40–48 | Space Grotesk 700 |
| Page title | 20–24 / 28–32 | Space Grotesk 600 |
| Section title, room name | 16 / 24 | Space Grotesk 600 |
| Message / body | 15 / 22 | Inter 400 |
| UI label | 14 / 20 | Inter 500 |
| Meta (timestamps, section caps) | 12 / 16 | Inter 500 (caps +0.06em) |

Never below 12px. Message text max width 72ch.

## 4. Space, shape, size
- Spacing scale (4-based): 4, 8, 12, 16, 20, 24, 32, 48.
- Radius: 6 (inputs, buttons, rows) · 10 (composer, cards, popovers) · 14 (modals, large cards, hangout icons idle) · 50% (avatars, presence badges, call controls, close buttons) · pill (reactions, tags).
- Hit targets ≥ 32px desktop pointer, ≥ 44px touch / web companion on phones.
- Desktop layout ≥ 1024px: hangout dock 72 · rooms list 240 · messages flexible · members 240 (collapsible). Below ~1100px the members list hides; below ~720px dock and rooms list collapse behind a menu.

## 5. Motion
- 120ms hover/press · 180ms popover/tooltip · 240ms modal/panel. Exit ≈ 70% of enter.
- Easing: `cubic-bezier(.2,.8,.2,1)` enter, `cubic-bezier(.4,0,1,1)` exit. No bounce on informational UI.
- Animate only `opacity` and `transform`. Honour `prefers-reduced-motion` (fade only, ≤ 80ms).
- New message: 120ms fade + 4px rise. Speaking: steady 2px Moss ring, no pulse.

## 6. Components
- **Hangout icon** 48px, radius 14 → 12 on hover/selected. Selected = 4px Lantern bar at the dock edge. Unread = 8px `--hc-text` bar. Mentions = Ember pill with count.
- **Room row** 32px: `#` icon (Lounges: speaker icon) in `--hc-text-dim`, name in `--hc-text-muted`; hover `--hc-raised`; selected `--hc-raised` + `--hc-text`; unread = name in `--hc-text` 600 + dot.
- **Message group**: 40px round avatar, name 15/600 (role colour or `--hc-text`), timestamp `--hc-text-dim`. Follow-ups collapse. Mention: Lantern tint + 2px Lantern left edge. Pending send shows "sending…" in muted text.
- **Composer**: `--hc-raised`, radius 10, 1px line, min 48px; focus → `--hc-line-strong`.
- **Buttons**: Primary (Lantern fill, on-Lantern text), Secondary (raised + line), Ghost, Danger (Ember fill, white text). Height 36 (32 compact, 44 on auth screens).
- **Call controls**: 52px round buttons on `--hc-raised`; Leave = 72×52 Ember pill.
- **Presence badge — always a perfect circle.** 16px outer, `box-sizing: border-box`, `border-radius: 50%`, 3px ring in the surface colour behind it, at the avatar's bottom-right (−3px). A distinct shape per state so it never relies on colour alone:
  - Online — solid Moss dot.
  - Idle — Honey crescent (surface-coloured circle cut from the top-left).
  - Do not disturb — Ember dot with a short horizontal bar.
  - Offline / Invisible — hollow `--hc-text-dim` ring.
  Avatars always use `border-radius: 50%`, never a px radius.
- **Icons**: Lucide, 20px, 1.75 stroke. No emoji as icons.
- **Category + (add room)** — every category header ends with a round **+** (32px desktop, 44px phone; `--hc-text-muted`, hover `--hc-raised`), label "Add a room or lounge to ‹category›". Opens **Add to ‹category›**: type (Room / Lounge), name, **Guidelines** ("Follow ‹category› guidelines" / "Own guidelines"), pre-selected from the user's preference. Dialog on wide screens, bottom sheet on phones. Selected option: Lantern border. Hidden for people without `MANAGE_ROOMS` (ACCESS_AND_SETTINGS §7.1).
- A room with its own guidelines shows a small "Own guidelines" pill in its header.

## 6a. Phones (mobile gate — every screen, MASTER_PLAN §15.1)
- **< 720px:** one pane at a time — hangouts + rooms → room → members/details as a bottom sheet. Bottom tab bar: Home, Chats, Notifications, You (≤ 5). Back button in every room header.
- **720–1099px:** dock + rooms + messages; members list opens on demand as a side panel.
- **≥ 1100px:** full four-column layout.
- Touch targets ≥ 44px on **every touch screen** (`@media (pointer: coarse)`), including phones in landscape and touch tablets — not just narrow widths; no hover-only actions (long-press = right-click menu); dialogs become bottom sheets that sit above the keyboard.
- The system back button / gesture closes the top layer (dialog → members → room), never leaves the app.
- Below 1100px the members list is an overlay inside the app frame (under the top bar) with its own close button, Escape and scrim-tap to close.
- `100dvh`, never `100vh`; `env(safe-area-inset-*)` on top bar, tab bar and sheets; viewport `width=device-width, initial-scale=1, viewport-fit=cover` — never disable zoom.
- Inputs are 16px so phones don't zoom on focus.
- Every new screen gets a 390×844 phone artboard before it's built.

## 7. Accessibility (fixed boundaries)
- Contrast as in §2.
- Visible focus on everything: 2px Lantern outline, 2px offset.
- Full keyboard path: Ctrl/Cmd+K quick switcher, Alt+↑/↓ rooms, Esc closes overlays, Tab follows reading order.
- Real `<button>`, `<a>`, `<input>` + `<label>`; icon-only buttons have `aria-label`; presence and mute also exposed as text.
- Live regions: new messages in the focused room (polite), call join/leave.

## 8. Never
Shadows/glass/neumorphism on chrome · gradients on chrome · more than one accent colour per view · text < 12px · placeholder-only labels · spinners where optimistic UI works · square or px-rounded presence badges · Discord words, logos, colours (`#5865F2`), sounds or icons.

## 9. Approved Calm Minimal screens (`screens/`)
| File | Screen |
|---|---|
| `Main.dc.html` | Hangout — Room chat (dock, rooms & lounges, messages, mention, attachment, reactions, composer, members with presence) |
| `Voice.dc.html` | Lounge call — screen share, speaking ring, muted badge, round call controls, side chat |
| `SignIn.dc.html` | Sign in — Continue with Google, email + password, inline error |
| `Verify.dc.html` | Verify email — 6-digit code, resend timer, change email |
| `Onboarding.dc.html` | First hangout — create or join with invite, profile name/username |
| `Settings.dc.html` | Settings — My profile, status picker with all four presence shapes, profile card preview |

The `.dc.html` files use the design canvas runtime (`support.js`), so they don't open on their own; read them as HTML/CSS reference. Bracketed text (`[your name]`, `[file size]`, `[expiry time]`) is placeholder — never ship it. The "H" tile is a stand-in until the real logo (MASTER_PLAN §2.1) exists.

Live canvas: the owner's private claude.ai artifact **"HangCord UI Redesign"**.
