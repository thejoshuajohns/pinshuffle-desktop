<p align="center">
  <img src="desktop/assets/icon.png" alt="PinShuffle Logo" width="140" />
</p>

# PinShuffle

> One-click Pinterest board shuffler: paste a board URL, run, and get a fresh shuffled board.

PinShuffle creates or reuses a destination Pinterest board and saves a randomized order of pins from one or more source boards.

This tool uses **headed UI automation** (Playwright). There is no stable public Pinterest API path used.

## Features

- `init` creates `config.json`
- `login` stores Playwright `storageState` after manual login
- `scrape` captures pins from source board URLs into `pins.json`
- `plan` shuffles pins (Fisher–Yates + optional seed) into `plan.json`
- `apply` saves pins in planned order to destination board
- `diagnose` checks selector health and writes a report to `debug/`
- `--dry-run` mode prints intended actions without saving
- `--resume` mode continues from `state.json`
- Resume safety is keyed by `planHash` so stale state won’t apply to a different plan
- Retries failed saves up to 3 times and writes screenshots to `debug/`
- Electron desktop shell that runs the existing CLI commands

## Requirements

- Node.js 18+
- NPM

## Install

```bash
npm install
npx playwright install chromium
```

## Quick Start

1) Initialize config:

```bash
npm run init -- --source "https://www.pinterest.com/<user>/<board>/" --destination "Inspo Shuffle - 2026-03-01"
```

Optional config fields:

- `--pins 50` (default `50`, max `300`) or `--pins all`
- `--max-load 200` (default `200`) or `--max-load all`
- `--speed balanced` (`conservative|balanced|fast`; sets delay/batch defaults)
- `--seed "my-seed"` (optional deterministic runs)
- `--delay-min 250 --delay-max 900`
- `--batch-size 20`

2) Log in manually (headed browser):

```bash
npm run login
```

3) Scrape source board pins:

```bash
npm run scrape
```

4) Build a deterministic (or random-seeded) plan:

```bash
npm run plan
```

5) Apply plan:

```bash
npm run apply
```

Optional selector diagnostics:

```bash
npm run diagnose
```

## Desktop App Shell

Launch the desktop wrapper:

```bash
npm run desktop
```

Desktop shell notes:

- It runs your existing `dist/cli.js` commands under the hood.
- Default flow is one field + one button: paste board URL and click `Run Shuffle`.
- `Run Shuffle` auto-generates a fresh destination board name and runs `init -> login -> scrape -> plan -> apply`.
- `Connect Pinterest` runs `login --no-prompt` so users can pre-authorize once.
- Optional `Preview only` runs dry mode without saving.
- `Advanced Settings` contains full manual controls, diagnostics, and power-user options.
- Clear confirmation cards show login status, run status, and board result in plain language.
- `Unique Test Name` generates a fresh destination board name to avoid collisions.
- `Copy all scraped pins` and `Scrape full board` toggles enable large-board / uncapped mode from the UI.
- `Run Full Pipeline` executes `init -> login -> scrape -> plan -> apply` and stops on first failure.
- `Diagnose` in the desktop UI runs selector health checks and writes a report file.
- Wizard step chips show live status for `init/login/scrape/plan/apply`.
- `Stop` sends a SIGTERM to the active CLI process.
- `Technical Log (Advanced)` is collapsed by default; `Export Session Log` writes it to `debug/desktop-logs/`.

## Packaging (Desktop Distribution)

Build unpacked app directory:

```bash
npm run desktop:pack
```

Build macOS DMG:

```bash
npm run desktop:dist
```

Icon assets used for packaging live in `desktop/assets/icon.icns` and `desktop/assets/icon.png`.

Run non-browser smoke tests:

```bash
npm run test:smoke
```

## Dry Run / Resume

Dry run (no Pinterest mutations):

```bash
npm run apply -- --dry-run
```

Resume (default behavior):

```bash
npm run apply -- --resume
```

Ignore previous state and start from pin 1:

```bash
npm run apply -- --no-resume
```

Only process first N planned pins (useful for MVP validation):

```bash
npm run apply -- --max 10
```

## Generated Files

- `config.json` user settings
- `.auth/storageState.json` authenticated browser state
- `pins.json` scraped + deduplicated pin list
- `plan.json` shuffled selected pins, seed used, and `planHash`
- `state.json` apply progress (`index`, `savedIds`, `failures`, `planHash`)
- `debug/*.png` failure screenshots
- `debug/selector-health-*.json` selector diagnostics reports
- `debug/desktop-telemetry.jsonl` local desktop command telemetry (run metadata only)
- `debug/desktop-logs/*.log` exported desktop session logs

## Command Reference

### `init`

Creates `config.json` with:

```json
{
  "sourceBoardUrls": ["https://www.pinterest.com/<user>/<board>/"],
  "destinationBoardName": "Inspo Shuffle - 2026-03-01",
  "speedProfile": "balanced",
  "pinsToCopy": 50,
  "maxPinsToLoad": 200,
  "seed": null,
  "delayMsRange": [250, 900],
  "batchSize": 20
}
```

### `login`

- Opens Pinterest login page in headed mode.
- You log in manually.
- Terminal mode: press Enter to persist storage state.
- Desktop mode (or CLI with `--no-prompt`): session is auto-detected and saved.

### `scrape`

- Visits each `sourceBoardUrls` entry.
- Scrolls until `maxPinsToLoad`, or until end-of-board signals are detected.
- Extracts unique pin IDs/URLs and optional title/image metadata.
- Deduplicates across all source boards by pin ID.
- Writes incremental progress snapshots to `pins.json` during long runs.

### `plan`

- Loads `pins.json`.
- Uses Fisher–Yates shuffle.
- If `seed` exists in config, run is deterministic.
- If no seed in config, runtime seed is generated and written to `plan.json`.
- Supports `pinsToCopy: \"all\"` to include all available scraped pins.

### `apply`

- Reads `plan.json`.
- Ensures destination board exists via Create flow or Save-flow fallback.
- Saves each pin URL in planned order.
- Retries each failed save up to 3 times.
- Writes progress to `state.json` after each pin success/final failure.
- Resume only continues when destination board and `planHash` both match.

### `diagnose`

- Opens Pinterest in headed mode.
- Checks key selector groups for home/create/save flows with fallback selectors.
- Uses `--pin-url` if provided, otherwise first pin from `plan.json`/`pins.json`.
- Writes report JSON to `debug/selector-health-*.json`.

## Reliability Notes

- Uses role/text selectors with fallbacks.
- Adds randomized delays between actions.
- Supports conservative/balanced/fast speed presets.
- Stops with a clear error when block/rate-limit patterns are detected.
- Pinterest UI changes can still break selectors; `src/selectors.ts` is centralized for updates.

## Limitations

- UI automation is inherently brittle against major Pinterest UI redesigns.
- Public boards usually scrape without login, but private boards require logged-in state.
- Save confirmation signals differ by account/locale; verification is best effort.

## Troubleshooting

- Missing auth state: run `npm run login`.
- Empty `pins.json`: increase `maxPinsToLoad` and verify source board URL.
- Frequent save failures: lower run intensity via higher delay range.
- Repeated rate-limit messages: stop and retry later; do not brute-force retries.
- Selector breakage after Pinterest UI changes: run `npm run diagnose` and update `src/selectors.ts`.

## Security

- The tool never asks for, reads, or stores your password.
- Authentication is stored only as Playwright browser session state in `.auth/storageState.json`.
