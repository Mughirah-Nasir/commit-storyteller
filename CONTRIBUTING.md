# Contributing to commit-storyteller

Thanks for looking at the project. It's small on purpose, and contributions are
welcome as long as they keep it small, honest, and tested.

## Setup

```bash
npm install        # dev tooling only (eslint, prettier); zero runtime deps
```

Node 18, 20, and 22 are supported and exercised in CI (plus Windows on Node 20).

## Before opening a pull request

All four of these must pass locally — CI runs the same:

```bash
npm test            # node:test runner
npm run lint        # eslint
npm run format:check
npm pack --dry-run  # confirm the published file list is sane
```

## Adding code

- **New behaviour needs a test.** Bug fixes should add the test that *would
  have caught* the bug. There are examples of exactly that in the suite (the
  lead-in-stripper fix in `test/message.test.js`, and the hook-installer fix in
  `test/hook-install.test.js`).
- **The core has no runtime dependencies.** Please don't add any; everything
  ships as standard-library Node so the hook stays lightweight.
- **Providers** implement one method, `generate({ system, user })`. To add one,
  drop a file in `src/providers/` and wire it into `src/providers/factory.js`.
  Test it with an injected `fetchImpl` so no network is needed.
- **The hook must never block a commit.** Any failure path should degrade to
  the offline engine (when `fallbackToOffline` is on); the installed hook also
  ends in `|| true`.

## Keeping the docs honest

This project deliberately avoids inflated claims:

- The offline engine describes *what* changed, not *why*. Don't document it as
  if it infers intent.
- Don't claim it writes "perfect" commit messages. It writes clean, reviewable
  ones that you approve before saving.
- If you change the number of tests, update the README badge and text to the
  **actual** `npm test` count.

## Commit style

Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) with
a short imperative summary. Small commits that do one thing are easier to
review than one big one — and yes, you can let commit-storyteller draft them.
