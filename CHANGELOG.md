# Changelog

This project follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

- Initial project documentation
- Quick capture based on the current system time.
- Automatic and manual encrypted synchronization with pending-change tracking.
- Append-only medication merge and deletion tombstones for diary entries and medication doses.
- Shared input validation and extended data-integrity diagnostics.
- Treatment-plan adherence, planned-versus-recorded dose matching, and timing classification.
- Long-term trend view for 30, 90, 180, and 365 day periods.
- Medication reminders for Firefox and Chrome through persistent service-worker notifications.
- Backend readiness, capability metadata, structured request logging, CI, and deployment smoke tests.
- Date-ranged treatment-plan versions used by daily and long-term adherence.
- Day-data quality classification with missing-range guidance and reliable-period coverage.

### Changed

- Timeline hour header is aligned with cells and remains sticky while scrolling.
- Local calendar dates are used instead of UTC when determining the current day.
