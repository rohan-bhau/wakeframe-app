# Changelog

## [1.0.1.0] - 2026-09-09

### Added

- Add local activity reminders with actionable Accept, Ignore, and Break controls.
- Add break duration selection, break completion reminders, and break cap handling.
- Add Firestore persistence for activity instances and break logs.

### Changed

- Accepting an activity starts its active timer and schedules the end check-in.
- Break completion offers Accept, Ignore, or Add Break without running the task during the break.

### Fixed

- Cancel pending notifications when an activity is ignored or paused for a break.
- Process notification actions when the app opens from a closed state.
