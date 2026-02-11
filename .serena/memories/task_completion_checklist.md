# Task Completion Checklist

When finishing a task:
1. **Verification**:
   - Run the app locally (`python -m http.server`).
   - Verify functionality works as expected.
   - Check browser console for errors.
2. **Code Quality**:
   - Check for hardcoded values; move to `constants.js` if necessary.
   - Ensure new functions have JSDoc.
   - Follow existing patterns (window globals in init.js, state management in state.js).
3. **Documentation**:
   - Update `ARCHITECTURE.md` if files/modules were added/renamed/deleted.
   - Note: `CODEBASE_STRUCTURE.md`, `PHASE3_IMPLEMENTATION.md`, `IMPROVEMENT_PLAN.md` exist but are partially outdated legacy docs.