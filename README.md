# ai-exploratory-tester

An exploratory testing agent (Claude + Playwright MCP), measured against a shop app with planted bugs.

> Work in progress. Numbers appear here only after the scorer produces them.

## Why

"I use AI for testing" is easy to say. This repo asks a QA question about an AI agent: **how many real bugs does it find, how many false alarms does it raise, and what does each run cost?**

## Pieces

| Piece | What it is | Status |
|---|---|---|
| `app/` | Small shop (register, login, search, cart, coupons, checkout, profile). Every planted bug is behind a flag. | done |
| `bugs.yaml` | Ground truth: the 10 planted bugs (the answer key) | done |
| `tests/` | Playwright tests: baseline of every flow, plus one `@Bxx` detector per bug | done |
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

## Planted bugs

Full description, repro steps, expected and actual results are in `bugs.yaml`. **`bugs.yaml` is the answer key: never give it to the agent** (nor the server code, which shows where each flag is checked).

| Id | Flow | Difficulty |
|---|---|---|
| B01 | register | easy |
| B02 | checkout | easy |
| B03 | register | easy |
| B04 | cart | medium |
| B05 | cart | medium |
| B06 | cart | medium |
| B07 | cart | medium |
| B08 | login | hard |
| B09 | checkout | hard |
| B10 | order | hard |

Each bug is toggled on its own (`BUGS=B07 npm start`). Hard bugs need state across steps: a saved cart and a later login, stock after a purchase, or two accounts.

## Verify the answer key

Requirements: `npm ci` and `npx playwright install chromium`. Everything runs headless.

```bash
npm test               # Playwright suite against the correct app: must all pass
BUGS=B04 npm test      # the @B04 detector fails, the rest should pass
npm run verify:bugs    # suite with no bugs, then once per bug alone
npm run typecheck
```

`verify:bugs` fails if any test fails with no bugs on, if a bug's `@Bxx` detector does not fail when that bug is on, or if a bug breaks more than 2 other tests. It prints a table and writes `test-results/verify-bugs.json` with the other failing tests per bug (blast radius). The app port for tests is `PORT` (default 4100). CI runs all of this on every push.

## Who built what

Code written with Claude Code (AI) under my direction; I chose the scope, the bug mix and the measurement design.
