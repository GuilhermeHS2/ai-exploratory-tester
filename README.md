# ai-exploratory-tester

An exploratory testing agent (Claude + Playwright MCP), measured against a shop app with planted bugs.

> Results so far are preliminary: one run per configuration (n=1). They show the pipeline works end to end; they are not conclusions about the agent.

## Why

"I use AI for testing" is easy to say. This repo asks a QA question about an AI agent: **how many real bugs does it find, how many false alarms does it raise, and what does each run cost?**

## Pieces

| Piece | What it is | Status |
|---|---|---|
| `app/` | Small shop (register, login, search, cart, coupons, checkout, profile). Every planted bug is behind a flag. | done |
| `bugs.yaml` | Ground truth: the 10 planted bugs (the answer key) | done |
| `tests/` | Playwright tests: baseline of every flow, plus one `@Bxx` detector per bug | done |
| `qa-report/` | MCP server the agent uses to file structured bug reports (`report_bug`, `list_reported`) | done |
| `agent/` | Claude Agent SDK + Playwright MCP, with turn, time and cost limits; mission prompts in `prompts/` | done |
| `score/` | LLM judge matches reports to `bugs.yaml`; computes recall, precision and cost per run; human audit sheet | done |
| `results/` | Generated results table and one `score.json` per run | n=1 per config |

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

## Run the agent

Requirements: `npm ci`, `npx playwright install chromium`, and Claude credentials: either `ANTHROPIC_API_KEY` or a logged-in Claude Code on the machine (the Agent SDK uses it). The browser always runs headless.

```bash
npm run agent -- --bugs B01,B04,B07,B08,B10 --model claude-sonnet-5-5 --prompt v1 --runs 1
npm run agent -- --bugs none                  # baseline: correct app, counts false positives
npm run agent -- --random 4 --seed 7          # random subset of 4 bugs, reproducible by seed
# limits: --max-turns 200 --timeout-min 20 --max-cost 3   (defaults)
```

Each run starts the shop on a free port with the chosen bugs, runs the agent, stops the shop and writes `runs/<runId>/`: `reports.json` (what the agent filed), `transcript.jsonl` (every SDK message) and `meta.json` (model, prompt version, bugs on, seed, limits, duration, turns, cost and token usage from the SDK result message, stop reason, and the tool list the agent actually had). `runs/` is not committed.

What the agent can and cannot do:

- Only two MCP servers: Playwright MCP (`@playwright/mcp`, pinned, `--headless --isolated`, browser origins limited to the shop) and `qa-report`. All built-in tools are off (`tools: []`): no file reading, Bash, web search or web fetch. `browser_run_code_unsafe` and `browser_file_upload` are denied too, since they reach outside the page. The run fails if the agent reports any other tool at startup.
- No user or project settings, CLAUDE.md, hooks or user plugins (`settingSources: []`, `skills: []`, `strictMcpConfig`). Claude Code's own bundled plugins and skills are still listed at startup (`meta.json` records them), but they add no tools and the agent has no Skill tool to call them.
- Its working directory is an empty temp dir, deleted after the run.
- The mission prompt (`prompts/v1.md`) is generic: explore as a senior QA, report only reproduced bugs. It names no flow, bug or bug type from the catalog.
- On hitting a limit (turns, cost or time) it stops and keeps the reports filed so far. The stop reason is recorded.

## Score a run

```bash
npm run score -- runs/<runId>      # writes runs/<runId>/score.json and audit.csv
npm run agreement                  # judge vs human, over audited rows only
npm run results                    # results/results.md + the table below
```

Measurement design:

1. **Judge.** An LLM (`claude-sonnet-5-5`, Agent SDK with no tools, structured JSON output, prompt in `score/prompts/judge-v1.md`) matches each report to one of the bugs **enabled in that run**, or "none". It sees the answer key; the agent never does. On a baseline run there is nothing to match, so every report is a false positive and no judge call is made.
2. **Metrics, in code** (`score/metrics.mts`, unit tested):
   - recall = distinct enabled bugs found / bugs enabled
   - precision = reports matched to an enabled bug / all reports
   - duplicates = extra reports of a bug already found; false positives = reports matched to "none"
   - cost, duration, turns and stop reason come from `meta.json` (the SDK result message). Cost is the SDK's estimate in USD, not a bill; with a Claude Code login it is what the same tokens would cost on the API.
3. **Human audit.** `audit.csv` has one row per report with the judge's match and an empty `human_match` column. `npm run agreement` reports agreement only over rows a human filled, and says "pending human audit" otherwise.
4. **Results.** `npm run results` copies each `score.json` to `results/runs/`, groups runs by model and prompt, and writes the table below. No number in this README is typed by hand.

## Results

<!-- results:start -->
Generated by `npm run results` from 2 scored run(s) in `results/runs/`. Do not edit by hand.

| Model | Prompt | Runs with bugs | Recall, mean (min–max) | Precision, mean (min–max) | Baseline runs | False positives per baseline run | Mean cost per run |
|---|---|---|---|---|---|---|---|
| claude-sonnet-5-5 | v1 | 1 | 40% (40%–40%) | 100% (100%–100%) | 1 | 1.0 | $0.49 |

| Run | Bugs on | Found | Recall | Precision | Reports | False positives | Duplicates | Cost | Minutes | Turns | Stop reason |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23T19-37-32_claude-sonnet-5-5_v1_B01-B04-B07-B08-B10 | B01, B04, B07, B08, B10 | B07, B10 | 40% | 100% | 2 | 0 | 0 | $0.31 | 2.1 | 73 | completed |
| 2026-11-23T19-37-34_claude-sonnet-5-5_v1_baseline | none (baseline) | - | n/a | 0% | 1 | 1 | 0 | $0.66 | 3.7 | 88 | completed |

Judge-human agreement: pending human audit (0 of 3 judged reports audited).
<!-- results:end -->

## Limitations

- **n=1.** One run per configuration. The agent is not deterministic, so these numbers can move a lot between runs. The plan is 5 runs per configuration before drawing any conclusion.
- **The judge can err.** It is an LLM matching free text to the answer key. The human audit that would measure its error rate is pending.
- **The answer key is public.** This repo is public, so an agent with web or file access could read `bugs.yaml` or the server code. That is why the agent has no file, shell, web search or web fetch tools and the browser is limited to the shop's origin. Playwright's origin filter is not a hard security boundary. A future model could also have seen this repo in training; enabling a different subset of bugs per run (`--random`) makes a memorized key less useful.
- **"False positive" means "not a planted bug".** A report on the baseline can still be a real defect of the base app; only the human audit can tell.
- **The agent stops early.** In both first runs it ended on its own after a few minutes, far below the turn, time and cost limits. Prompt v1 does not push for coverage; that is the first thing a v2 prompt would test.
- **One app, ten bugs.** The planted bugs were written for this repo to look realistic; they are not a sample of real-world bugs.

## Who built what

Code written with Claude Code (AI) under my direction; I chose the scope, the bug mix and the measurement design.
