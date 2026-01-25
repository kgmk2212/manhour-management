# Coding Standards & Conventions

## JavaScript
- **Modules**: Use ES Modules (`import`/`export`).
- **State Management**: Centralized in `js/state.js`.
- **Constants**: Avoid magic numbers. Use `js/constants.js`.
- **DOM Manipulation**: Centralized in `js/ui.js` where possible.
- **Utils**: Use `js/utils.js` for common logic.

## CSS
- **Variables**: Use CSS variables for theming (defined in `js/theme.js` or `style.css`).
- **Responsiveness**: Support mobile/tablet/PC.

## Documentation
- Update JSDoc for functions.
- Maintain `ARCHITECTURE.md` and `CODEBASE_STRUCTURE.md` if structure changes.
