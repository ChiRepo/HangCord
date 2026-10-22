# Preferences: what the owner wants

These come from the owner's own words. When a choice isn't covered here or in `AGENTS.md` / `docs/`, ask; don't guess. The owner's latest message always wins over this file.

## Product
- **Name and tagline:** "HangCord — Better place to hang out."
- **Full rebrand:** no Discord code, names, logos, colours or sounds. Use HangCord's own vocabulary (Hangout, Room, Lounge, Spotlight, Board, Bulletin, Strand, Together).
- **Features:**
  - All the features Discord users expect, built from public behaviour and reviews.
  - The headline fixes are **Lightweight mode** and **encrypted DMs**.
  - New ideas: live translation, watch/listen together, a whiteboard in calls, schedule + reminders, and an AI summary of unread messages.
  - **Every category has a +** to add text or voice rooms. A new room either follows the category's guidelines or gets its own, and the user's preference pre-selects which.
- **Platforms:** desktop (Windows, macOS, Linux) is **the** product; there's also a web companion. It is a **real, installable application, not a webapp**: test it, debug it and build it carefully.
- **No paid tier for now:** keep an empty, flexible slot to add a paid tier later.
- **Be honest with users:** the app tells them it's in development, so there may be slow loading, bugs or glitches.
- **Memory:** use more RAM on bigger machines for smoothness, but never more than **1.7 GB**.
- **Feel:** fast and smooth, with zero lag or stutter.

## Design
- **The "Calm Minimal" direction:**
  - dark graphite, one warm amber brand colour, green for online
  - flat surfaces, no shadows
  - Space Grotesk for headings, Inter for the UI
- **A premium, round feel.** Online status must be **perfectly round**, not square, and avatars and call controls are round too.
- **Mobile matters:** optimise every checkpoint for phones. That's the mobile gate, which now runs on the `WebApp` branch.
- **Design work lives in `ui-ux/`;** keep the guides and docs in step with it.

## Infrastructure and data
- **Free tier everywhere.** The owner reviewed alternatives (Supabase, Resend, Sentry) and **kept the original free-tier plan**.
- **Secrets stay server-side in Cloudflare Workers secrets.** That covers every API key, generated code and all sensitive data, so normal users can never reach it. The owner sets secrets themselves.
- **Firebase config is stored in Cloudflare Workers too,** not in the app or the repo (2026-10-22).
- **Databases:** only D1 and Firestore are working databases. If both fail, use a backup Firestore project, then Backup DB #2, whose key the owner will provide. GitHub is never a database.
- **CSV safety net:**
  - A CSV journal for every write, and CSV backups of everything, all encrypted.
  - A decryption key only for emergencies, kept in private server-side storage.
  - When a database is out of writes, buffer in CSV, then save everything as one write to another database; restore it back afterwards.
- **Hangout keys:** each hangout has a secret key kept server-side, and each member's encrypted copy sits deep in a private folder in their Firestore profile until they leave.

## Process
- **Checkpoints:**
  - Checkpoint 1 is the foundation; checkpoint 1.1 is the real desktop app.
  - Work in checkpoints, and test, debug and document each one.
  - Keep **all** guides and .md files updated as the work goes.
- **Branches:** the GitHub repo is `ChiRepo/HangCord`. **`main` is the real application only**, not the web app; **`WebApp`** holds everything about the web app.
- **Push rule:** push changes before starting new work, and commit only when the owner asks.
- **Releases** link the installers from the repo.
- **Private folders** (owner's notes and `rules.md`) are off-limits to AI unless the owner says so. They change only after the owner types "yes change the files from now on", or when the owner directly asks for a specific file.
- **Reverts:** when the owner asks for one, do exactly that, keep the history (a revert commit, not a force-push, unless told otherwise), and don't redo the work unasked.
- **Code map:** use the Graphify map in its own `graphify/` folder.
- **Plugins:** claude-mem, rtk, headroom, token-optimizer-mcp, superpowers and context-mode are wanted; use them.

## Working with the owner
- **Style:** clear and direct, with no filler. Don't address the owner by name.
- **Interruptions:** they're common. When the owner stops a run or rejects an action, stop and wait for direction.
- **Long builds:** if the owner is chatting with you, say so before a long build or test run.
- **Delegation:** when the owner says "do it yourself", do as much as your access allows, and explain exactly what still needs them.
- **Facts vs guesses:** keep what the owner stated separate from your own estimates, and recheck old numbers before relying on them.
- **Other models:** the owner also works with ChatGPT models, for example GPT-6 Astra. Leave the repo and this folder so any model can pick up without the owner repeating context.
