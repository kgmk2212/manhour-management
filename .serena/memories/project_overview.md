# Project Overview: Manhour Management

## Purpose
A web application for managing project estimates and recording actual man-hours.
- Manage estimates by process/member (version/task/process granularity).
- Record actual work hours via calendar.
- Analyze progress with reports and graphs.
- Schedule management with Gantt chart view.
- Data saved in LocalStorage (no backend).

## Tech Stack
- HTML5 (Semantic)
- CSS3 (Vanilla, CSS Variables)
- JavaScript (ES Modules, No Framework)
- Libraries: ExcelJS (Excel export), holiday_jp (JP holidays)
- Environment: Browser (Chrome/Edge recommended)
- Hosting: GitHub Pages (static files)

## Key Features
- 6 tabs: Quick Input, Estimates, Actuals, Report, Schedule, Settings
- Responsive design (mobile/tablet/PC).
- LocalStorage persistence with auto-backup.
- Export to Excel.
- Theme customization (11 color themes, patterns, tab/background colors).
- Gantt chart / schedule view (schedule.js, schedule-render.js).

## Codebase Stats (as of 2026-02)
- 22 JavaScript modules in js/ directory
- ~20,700 total lines of JavaScript
- Largest files: ui.js (3,831), report.js (3,361), schedule.js (1,618), actual.js (1,613)