# Changelog

## [1.0.2.1] - 2026-09-15

### Added

- Edit existing routine activities from the saved activities list.
- Delete activities with a confirmation prompt to prevent accidental loss.

## [1.0.2.0] - 2026-09-14

### Added

- Review daily activity timelines with completed, ignored, missed, and break states.
- Compare planned and actual time with period summaries, status graphs, filters, and pagination.

### Changed

- Analytics Day, Week, and Month views now load and aggregate their selected period.

## [1.0.1.1] - 2026-09-10

### Added

- Choose activity start and end times with native clock or wheel pickers.

### Changed

- Activity duration is now calculated from the selected start and end times.
- End times must be after their activity's start time.

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
