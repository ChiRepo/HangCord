# HangCord UI/UX

The visual source of truth for HangCord. Agents build `packages/ui` to match these screens. Rules for this folder are in `AGENTS.md` and the owner's private `rules.md`.

## Current design: Calm Minimal (approved 2026-10-21)
**Start here: [`calm-minimal/DESIGN_SYSTEM.md`](calm-minimal/DESIGN_SYSTEM.md).** It replaces the earlier Lantern-orange / Manrope look for colours, type, spacing, shapes and motion.

- **`calm-minimal/tokens.css`** — the tokens to use in code (replaces `tokens.css` below).
- **`calm-minimal/screens/`** — six redesigned screens: Room chat, Lounge call, Sign in, Verify email, First hangout, Settings & profile.
- **`calm-minimal/canvas.json`** — layout of the owner's "HangCord UI Redesign" canvas.
- Presence badges are always perfect circles with a shape per state (online dot, idle crescent, DND bar, offline ring).

The earlier design below stays as the reference for **features and layouts** of screens not yet redesigned; build those with the Calm Minimal look. Where both versions exist, Calm Minimal wins.

## Earlier design (v1, Lantern orange / Manrope)

- **Live design canvas (owner's claude.ai artifact):** "HangCord UI" — open it from the owner's artifacts. It is private; only the owner can share it.
- **`screens/`** — the source of every artboard (`*.dc.html`), exported 2026-10-21. These files use the design canvas's runtime (`support.js`), so they don't open on their own in a browser; read them as HTML/CSS reference for layout, spacing, colours, copy and states.
- **`canvas.json`** — the canvas layout (artboard sizes and order).
- **`tokens.css`** — colours, type, radii and sizes as CSS variables. Use these in code; never hard-code colours.
- **`exports/`** — PNG/PDF renders of the screens. The owner can export them from the canvas (Share › Export) and drop them here.

## Screens

| File | Screen | What it shows | Spec |
|---|---|---|---|
| `Main.dc.html` | Hangout — Room chat | title bar with BETA pill + live memory chip, hangout dock, rooms/lounges/boards list, voice-connected panel, "Catch me up" AI banner, translated message, reminder, reactions, typing, composer with schedule button, members list with roles | MASTER_PLAN §3 |
| `Lounge.dc.html` | Lounge — Watch together + whiteboard | Together tabs (Watch/Listen/Whiteboard), synced player with host + "In sync", queue, video tiles with speaking ring and mute badge, whiteboard, call controls | MASTER_PLAN §3.3, §10 |
| `DMs.dc.html` | Encrypted DM + schedule | chats list with Read later, E2EE banner + safety number, reminder chip, scheduled message (edit / send now / cancel), "Send later" menu, profile panel with reserved Plus slot | MASTER_PLAN §3.2–3.3 |
| `Settings.dc.html` | Settings — Performance & Plus | memory profile for this PC, live usage bar, Lightweight mode switch (interactive), profile picker, reserved "HangCord Plus — coming later" card | MASTER_PLAN §11, §2.3 |
| `Welcome.dc.html` | Sign in | beta notice, Continue with Google, email + password, forgot password, create account link | MASTER_PLAN §6.1 |
| `CreateAccount.dc.html` | Create account | name, email, password strength, age/terms consent, "Send my code" | MASTER_PLAN §6.1 |
| `VerifyEmail.dc.html` | Verify email (interactive) | 6-digit code boxes, resend, change email, fallback-link notice, success state | MASTER_PLAN §6.1 |
| `Roles.dc.html` | Hangout settings — Roles (interactive) | settings nav, role list in hierarchy order with locks, presets, permission switches with "SENSITIVE · EMAIL CODE" badges | ACCESS_AND_SETTINGS §3, §5, §6 |
| `RoomPermissions.dc.html` | Room settings — Permissions (interactive) | room schedule chip, not-synced banner, private room switch, deny / inherit / allow controls per role or member, "Why?" explainer with one-click fix | ACCESS_AND_SETTINGS §4, §7 |
| `Security.dc.html` | Hangout settings — Safety & security (interactive) | active security-action banner, "who can talk right away" levels, raid protection, rules, DM protection, step-up policy, pause invites/DMs, hangout key fingerprint + rotate with email code, audit log with "Chain verified" | ACCESS_AND_SETTINGS §8, §10–12 |
| `Brand.dc.html` | Brand sheet | logo on dark/light/Lantern, colour roles, type, HangCord words | MASTER_PLAN §2 |

## Building from these screens
- Desktop window reference size: 1440 × 900 (settings screens 1440 × 1100). Layouts are fluid: below ~900 px the side panels stack.
- Placeholders in square brackets (`[Google mark]`, `[thumb]`, `[poster-lineup.webp]`, `[MINIMUM AGE]`) must be replaced with real assets/values, never shipped as text. The Google button must follow Google's sign-in branding guidelines.
- Sample people and messages (meera, dev, kiran…) are mock data only.
- Accessibility as drawn: real buttons/links/inputs with labels, icon buttons have `aria-label`, text contrast ≥ 4.5:1, touch targets ≥ 44 px, never colour alone.
- Only the owner changes the design. If code needs a design change, ask the owner, update the canvas, re-export into `screens/`, and record it.
