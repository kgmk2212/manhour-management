# Coding Standards & Conventions

## JavaScript
- **Modules**: Use ES Modules (`import`/`export`). 22 files in js/.
- **State Management**: Centralized in `js/state.js` with getter/setter pattern.
- **Constants**: Avoid magic numbers. Use `js/constants.js`.
- **DOM Manipulation**: Centralized in `js/ui.js` where possible.
- **Utils**: Use `js/utils.js` for common logic.
- **Window globals**: Many functions are exposed via `window` object in `init.js` for HTML onclick compatibility. This is intentional due to circular dependency constraints.

## Key Module Groups
- **Estimate**: estimate.js, estimate-add.js, estimate-edit.js, estimate-split.js, estimate-selection.js
- **Schedule**: schedule.js, schedule-render.js (Gantt chart feature)
- **UI/Theme**: ui.js, theme.js, modal.js, tab-filter.js
- **Data**: state.js, storage.js, constants.js, utils.js
- **Features**: actual.js, quick.js, report.js, vacation.js, other-work.js
- **Initialization**: init.js, events.js

## CSS
- **Variables**: Use CSS variables for theming (managed by `js/theme.js` and `style.css`).
- **Responsiveness**: Support mobile/tablet/PC (breakpoint: 768px).

## Documentation
- Update JSDoc for functions.
- `ARCHITECTURE.md` is the primary architecture reference (may need updates for schedule-related files).
- `CODEBASE_STRUCTURE.md` exists but is outdated/trimmed.