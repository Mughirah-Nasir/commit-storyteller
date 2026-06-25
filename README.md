# commit-storyteller ✍️

**A git hook that turns your staged diff into a clean, reviewable commit message — with a deterministic offline engine, so it works the moment you install it, no API key required.**

[![CI](https://github.com/Mughirah-Nasir/commit-storyteller/actions/workflows/ci.yml/badge.svg)](https://github.com/Mughirah-Nasir/commit-storyteller/actions)
[![Node 18+](https://img.shields.io/badge/node-18%2B-blue)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-71%20passed-brightgreen)](test/)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)

```text
$ git add src/payments/charge.js
$ git commit
# your editor opens, already filled in:

feat(payments): add charge.js

- add src/payments/charge.js
```

No model was called for that. It came from the **offline engine** — pure heuristics over the parsed diff. Point it at Claude, OpenAI, or a local Ollama model and the messages get more fluent; the offline engine stays as the zero-config default and the fallback if a model call ever fails.

## Why this exists

Everyone's commit history is full of `update`, `fix stuff`, `wip`. Good messages are the cheapest documentation a team has, and the worst to keep writing by hand. An LLM is the obvious tool — but a commit hook that *requires* a network round-trip and an API key is a hook that breaks on a plane, breaks when the key expires, and blocks your commit when the provider 500s.

So commit-storyteller is built the other way around: a deterministic engine that always works, with LLMs as an optional upgrade layered on top. The hook can **never block your commit** — every failure path degrades to the offline summary.

## How it works

```text
git commit
    │
    ▼ (prepare-commit-msg hook)
┌──────────────┐   git diff --cached
│  git diff    │──────────────────────────►
└──────┬───────┘
       ▼
┌──────────────┐   structured FileChange[]: status, ± counts, hunks
│ diff parser  │
└──────┬───────┘
       ▼
┌──────────────┐   collapse noise (lockfiles, dist/, binaries),
│ diff         │   rank by signal, trim to a token budget
│ processor    │
└──────┬───────┘
       ▼
┌──────────────┐         ┌─────────────────────────────┐
│ provider     │────────►│ offline  (no key, default)  │
│ (Strategy)   │         │ anthropic · openai · ollama │
└──────┬───────┘         └─────────────────────────────┘
       ▼  raw text                 │ on failure
┌──────────────┐                   ▼
│  sanitizer   │◄────────  fall back to offline engine
└──────┬───────┘   strip fences/lead-ins, cap subject,
       ▼           merge ABOVE git's comments, never
   COMMIT_EDITMSG  clobber a message you already typed
```

## Quick start

Clone the repo somewhere, then from **inside your own git repo** install the hook. There are two ways, depending on whether you want a `storyteller` command on your PATH.

**Option A — no install (call the CLI by path):**

```bash
# from inside your own repo
node /path/to/commit-storyteller/src/cli.js install   # installs the hook
node /path/to/commit-storyteller/src/cli.js preview   # preview a message for staged changes

# then commit normally — the hook pre-fills the message for your review
git add .
git commit
```

**Option B — link the command first, then use `storyteller`:**

```bash
cd /path/to/commit-storyteller
npm link                 # puts `storyteller` on your PATH

cd /path/to/your/repo
storyteller install
storyteller preview
```

The installed hook always calls the CLI by its absolute path, so once installed it keeps working whether or not `storyteller` is linked.

Pick a provider (default is `offline`, which needs nothing and stays on your machine):

```bash
# one-off (Option A form shown; with npm link, drop the `node .../cli.js` prefix)
STORYTELLER_PROVIDER=anthropic ANTHROPIC_API_KEY=your_anthropic_api_key_here \
  node /path/to/commit-storyteller/src/cli.js preview

# or persist it in .storytellerrc.json (the `init` command writes a starter)
{
  "provider": "openai",
  "style": "conventional",
  "hook": "prepare-commit-msg",
  "fallbackToOffline": true
}
```

> **Privacy note.** The `offline` provider keeps your staged diff entirely on your machine. If you configure **Anthropic** or **OpenAI**, your staged diff is sent to that provider's API to generate the commit message. Do not use remote providers on private code, secrets, customer data, or anything you are not allowed to share — and never stage secrets in the first place (the diff is what gets sent). The `ollama` provider runs locally and also keeps your diff on your machine. See [SECURITY.md](SECURITY.md).

| Provider | Key needed | Where your diff goes |
|---|---|---|
| `offline` | none | stays local (default) |
| `ollama` | none | stays local (local daemon at `127.0.0.1:11434`) |
| `anthropic` | `ANTHROPIC_API_KEY` | sent to Anthropic's Messages API |
| `openai` | `OPENAI_API_KEY` | sent to OpenAI's Chat Completions API (`OPENAI_BASE_URL` for gateways) |

Two message styles, set via config or `STORYTELLER_STYLE`:

- **`conventional`** (default) — `type(scope): subject` + optional bullet body
- **`prose`** — a plain imperative sentence, no type prefix

## Architecture & trade-offs

The decisions I'd defend in an interview:

* **The offline engine is the core, not a stub.** It infers commit *type* (feat/fix/docs/test/ci/refactor…) and *scope* (the dominant module) straight from the diff, names the primary changed file, and lists the rest in the body. It's not as fluent as a model and it deliberately doesn't invent *why* a change was made. It's deterministic and limited to information visible in the staged diff — it doesn't invent anything outside that diff — which makes it useful with zero setup, though its type/scope guesses are heuristics that you review before committing.
* **Provider abstraction (Strategy pattern).** Every provider implements one method, `generate({ system, user })`. The hook has no idea which one it's talking to. Adding a provider is one small file; testing the pipeline needs no network because the offline `FakeProvider` satisfies the same interface.
* **The hook can never block a commit.** A remote failure (offline, 429, bad key, timeout) is caught and degraded to the offline summary when `fallbackToOffline` is on; the installed hook also ends in `|| true`. Your commit going through does not depend on a third party being up.
* **Noise collapse + token budget in the diff processor.** Lockfiles, `dist/`, minified bundles and binaries are recorded as "this changed" but their line content is dropped, so 80 lines of `package-lock.json` churn never drowns a 3-line logic change — or your token budget. Files are ranked by signal and trimmed to a character budget (a cheap, deterministic proxy for tokens).
* **Message merging preserves git's comments and your text.** The generated message is inserted *above* git's `# Please enter…` block, which is kept verbatim. If you already typed a message with `-m`, the hook leaves it completely alone (overridable with `overwriteUserMessage`).
* **Layered, side-effect-free config.** Defaults → `.storytellerrc.json` (searched cwd-upward) → environment. The merge functions are pure and unit-tested. API keys are collected into a separate `keys` object that is never written to a config file.
* **Zero runtime dependencies.** The whole engine is standard-library Node. ESLint/Prettier are dev-only. A commit hook should be lighter than the thing it documents.

### A real bug this caught (the proof it was *developed*)

The message sanitizer strips conversational lead-ins like `"Sure! "` or `"Here is your commit message:"`. The first version of that regex was too greedy: on `"Sure! fix: oops"` it matched up to the **second** colon and produced `"oops"` — silently eating a valid Conventional-Commits `fix:` prefix. A test (`sanitizeMessage removes a conversational lead-in`) caught it; the fix bounds the alternatives so a lead-in can't swallow a following `type:`. See `AUTHENTICITY.md` for the full writeup.

### Known limits (honest)

* The offline engine describes **what and where**, not **why**. For intent ("why this change"), use an LLM provider.
* Type/scope inference is heuristic. It's right for the common cases (single-purpose commits, module-scoped changes) and falls back to sensible defaults for ambiguous ones; it is not a substitute for your judgment.
* `post-commit` mode amends with `--no-verify`, so it bypasses other commit-msg hooks on the amend. `prepare-commit-msg` (the default) is the cleaner integration and is recommended.
* It summarizes the diff, not your test results or issue tracker.

## Development

```bash
npm install        # dev deps only (eslint, prettier); zero runtime deps
npm test           # 71 tests, node:test runner
npm run lint       # eslint
npm run format:check
```

Layout: `src/core/` (parser, processor, summarizer, prompt, message, config, git, orchestrator), `src/providers/` (base + offline, anthropic, openai, ollama, factory), `src/cli.js`, `hooks/` (copyable hook scripts), `test/`.

## Security & privacy

This tool reads your staged git diff. With the `offline` (default) or `ollama` providers, that diff never leaves your machine; with `anthropic` or `openai`, it is sent to that provider's API. Don't use remote providers on private code or secrets, and never stage secrets in the first place. Full details and reporting instructions are in [SECURITY.md](SECURITY.md).

## AI assistance disclosure

This project was designed and directed by me and built in pair-programming sessions with Claude (Anthropic), which I use openly as a coding partner. The architecture — the offline-first design, the Strategy-pattern provider layer, the never-block-a-commit guarantee, the noise-collapsing diff processor, and the comment-preserving message merge — reflects deliberate decisions I understand and stand behind. The conversational-lead-in bug described above was caught by the test suite during development and fixed. See [AUTHENTICITY.md](AUTHENTICITY.md) and [PROVENANCE.md](PROVENANCE.md) for how authorship is evidenced.

## License

[MIT](LICENSE) © 2026 Mughirah Nasir

## Local verification

This repository is intended to be easy to inspect and verify locally. After cloning, run the documented install and test commands before using the tool in your own workflow.


## Documentation maintenance

This repository is maintained as a small, reviewable public project. Setup steps, verification commands, limitations, and security notes should stay clear enough for someone to inspect the project quickly before running it.
