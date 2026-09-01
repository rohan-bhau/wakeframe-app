# Wakeframe — Agent Instructions

Read SPEC.md fully before starting any task.

## Design reference (frontend repo only)
Before building or restyling any screen, check the `design/` folder for a matching
subfolder (e.g. `design/today/` for the Today screen). Each subfolder contains an
exported HTML/CSS file and a PNG image from the design tool. Treat the HTML/CSS as
the precise source of truth — exact colors, spacing, and structure — and the PNG as
a quick visual double-check. Match these as closely as React Native's components
allow (note: some raw HTML/CSS patterns don't translate 1:1 to React Native, so use
judgment on layout primitives while still preserving the visual result). If no
matching subfolder exists for a screen yet, use the color/type tokens described in
SPEC.md and ask before inventing a new visual direction.

## Git workflow
- Commit after every working, tested change — small, atomic commits with clear messages.
- After completing a meaningful unit of work (a full feature, a bug fix, a working data
  model, etc.) — not after every tiny edit — use the gstack-ship skill to commit, push,
  and open a PR.
- Before shipping, use the gstack-review skill to check the code first.
- Never push broken or untested code. If something doesn't work yet, keep it local and
  uncommitted (or commit locally without pushing) until it does.
- Ask me before force-pushing or rewriting history.
- Before starting a new feature or task, create a new branch off main
  (e.g. `feature/short-description`) rather than working directly on main.