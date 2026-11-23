# ai-exploratory-tester

An exploratory testing agent (Claude + Playwright MCP), measured against a shop app with planted bugs.

> Work in progress. Numbers appear here only after the scorer produces them.

## Why

"I use AI for testing" is easy to say. This repo asks a QA question about an AI agent: **how many real bugs does it find, how many false alarms does it raise, and what does each run cost?**

## Pieces

| Piece | What it is | Status |
|---|---|---|
| `app/` | Small shop (register, login, search, cart, coupons, checkout, profile). Every planted bug is behind a flag. | done |
| `bugs.yaml` | Ground truth: the planted bugs, written by hand | in progress |
| `tests/` | Playwright tests proving each bug appears when its flag is on and disappears when off | planned |
| `qa-report/` | MCP server the agent uses to file structured bug reports | planned |
| `agent/` | Claude Agent SDK + Playwright MCP, with step, time and cost limits | planned |
| `score/` | Matches reports to `bugs.yaml`, computes recall, precision and cost per run | planned |

## Run the app

Requirements: Node 24. No dependencies.

```bash
npm start                      # correct app, no bugs
BUGS=B01,B04 npm start         # with planted bugs on
npm run test:unit              # bug-flag preprocessor tests
```

The app runs at http://localhost:4000. Flags are stripped before files reach the browser, so the agent cannot read which bugs are on. With no flags on, the app is the baseline for counting false positives.

## Who built what

- `app/` was scaffolded with AI assistance. It is the target, not the work being shown.
- The planted bugs, the tests, the MCP server, the scorer and the analysis are written by me.
