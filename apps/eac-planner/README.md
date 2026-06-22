# EAC and Resource Management

This folder contains the interactive prototype workspace for a production-grade EAC and Resource Management system.

Current contents:

- `index.html`: the browser entry point
- `src/`: state, calculations, charts, seeded demo data, and interactive planning screens
- `docs/ARCHITECTURE.md`: target system architecture
- `docs/ROADMAP.md`: phased delivery plan

This is intentionally a clean starting point beside the legacy app, not a refactor of it.

## How to review

Run a simple local server from this folder:

```bash
cd /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac
npm run serve
```

Then open `http://localhost:4173`.

What you can test:

- switch between projects
- edit Labor by employee and monthly hours
- add as many Sub, Equipment, Material, and ODC line items as needed
- review Resource Management rollups by labor category and employee
- run a mock QuickBooks sync
- review updated KPIs and monthly reports

The prototype persists changes in `localStorage`. Use the `Reset Demo` button to restore the seeded data.
