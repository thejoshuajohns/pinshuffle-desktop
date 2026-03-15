# Contributing

## Before You Start

- Read [README.md](/Users/joshuajohns/Documents/PinShuffle/README.md), [ARCHITECTURE.md](/Users/joshuajohns/Documents/PinShuffle/ARCHITECTURE.md), and [ROADMAP.md](/Users/joshuajohns/Documents/PinShuffle/ROADMAP.md)
- Prefer small, focused PRs that touch one subsystem at a time
- Open an issue first for major architecture changes

## Local Setup

```bash
npm install
npx playwright install chromium
npm run build
```

## Development Workflow

```bash
npm test
npm run test:contracts
npm run test:smoke
```

- Keep new logic inside the `apps/` and `packages/` workspace layout
- Add or update tests for new pipeline behavior, selector logic, or config rules
- Use structured events and shared interfaces instead of bespoke ad-hoc state

## Pull Request Guidelines

- Explain the user-facing change and the subsystem it touches
- Call out any Pinterest selector assumptions or new UI dependencies
- Mention how the change was tested
- Prefer additive migrations over sweeping behavior changes without checkpoints

## Good First Areas

- Strategy plugins in `packages/shuffle`
- Selector fixtures and contract coverage in `tests/contracts`
- CLI ergonomics in `apps/cli`
- Desktop recovery and artifact browsing in `apps/desktop`
