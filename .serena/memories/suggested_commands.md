# Suggested Commands

## Running the Project
Since this is a static site (HTML/JS), you can run it using any static file server.

### Python
```bash
python -m http.server 8000
```
Then access `http://localhost:8000`.

### Direct File Access
You can also open `index.html` directly in the browser, but some features (ES Modules / CORS) might behave differently depending on browser security settings.

## Testing/Linting
There are no configured test scripts or linters (eslint/prettier) visible in the root.
Refactoring Phase 3 mentions increasing test coverage, but no command is specified.
