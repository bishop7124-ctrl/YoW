# QA Automation

This project has two QA layers:

- `npm run qa` runs static/basic checks: lint, production build, and load check.
- `npm run qa:smoke` runs browser smoke tests through Playwright in offline mode.

GitHub Actions runs both layers automatically on pushes and pull requests to `main`.
It also runs once per day and can be started manually from the GitHub Actions tab.
Browser smoke is split into named CI jobs for launch, project types, export formats,
and responsive coverage. When browser smoke fails in CI, Playwright artifacts are
uploaded for the failing area.

Before the first browser run on a machine:

```bash
npm run qa:smoke:install
```

Then run:

```bash
npm run qa:smoke
```

Current browser smoke coverage:

- Create, write, refresh, ZIP export, and ZIP restore.
- DOCX and visual PDF export downloads.
- All configured project types can be created with starter structure and default sections.
- Mobile and tablet writing flows are reachable and survive refresh.

Known notes:

- The Codex macOS sandbox may block Chromium launch at the OS permission layer, so browser smoke verification should be run in a normal local terminal or CI runner.
- React compiler advisories currently remain lint warnings, not failing errors.
