# Authenticity — the interview defense map

This file maps every defensible decision in commit-storyteller to where it
lives in the code and the one-line reason behind it. Ask about any row.

| Decision | Where | Why |
|---|---|---|
| **Offline engine is the core**, not a stub | `core/summarizer.js` | The tool works with zero setup and never depends on a network being up; the engine infers type/scope/files straight from the diff. |
| Commit **type inference** (feat/fix/docs/test/ci/refactor…) | `summarizer.js::inferType` | A useful default message names the *kind* of change; rules are derived from paths (tests/docs/ci) and add/remove ratios. |
| Commit **scope inference** (dominant module) | `summarizer.js::inferScope`, `topDir` | Scope should name the module, not the layout — a leading `src/` is skipped so `src/auth/x.js` scopes to `auth`. |
| **Strategy-pattern** provider abstraction | `providers/base.js` + adapters | One `generate()` method; the hook is vendor-agnostic and the pipeline is testable with no network. |
| **Offline `FakeProvider`** satisfies the same interface | `providers/base.js::FakeProvider` | It is both the no-key default and the fallback; tests use it instead of mocking HTTP. |
| **Never block a commit** | `core/orchestrator.js`, installed hook `\|\| true` | A 429/timeout/bad-key degrades to the offline summary (when `fallbackToOffline`); a hook crash can't wedge `git commit`. |
| **Noise collapse** of lockfiles/dist/binaries | `core/diff-processor.js::isNoiseFile` | 80 lines of `package-lock.json` churn must not drown a 3-line logic change or the token budget. |
| **Token/character budget** with signal ranking | `diff-processor.js::processDiff`, `score` | Models cost per token and have a context limit; include the most informative files first, trim the rest to header-only. |
| **Per-file line cap** | `diff-processor.js` PER_FILE_LINE_CAP | One enormous file can't monopolize the prompt. |
| **Merge ABOVE git's comment block**, preserved verbatim | `core/message.js::mergeIntoCommitFile` | Keeps git's `# Please enter…` UX intact; the message is a suggestion, not a takeover. |
| **Never clobber a user's typed message** | `message.js` (`hasUserMessage`, merge guard) | `git commit -m "wip"` must survive the hook; overridable with `overwriteUserMessage`. |
| **Strip fences / conversational lead-ins** from model output | `message.js::sanitizeMessage` | Models wrap output in ```fences``` or "Here is your message:"; commit messages must be clean. |
| **Bounded lead-in regex** | `message.js` LEAD_IN_RE | The greedy first version ate a following `type:` prefix — see the bug writeup below. |
| **Subject length cap** with ellipsis | `message.js`, `prompt-builder.js` SUBJECT_LIMIT | Conventional subjects stay under ~72 chars. |
| **Layered, pure config** (defaults → file → env) | `core/config.js` | Predictable precedence; the merge is side-effect-free and unit-tested. |
| **API keys kept out of persisted config** | `config.js::applyEnvOverrides` (`keys` object) | Secrets must never be written to `.storytellerrc.json` by accident. |
| **Injectable `fetch`** in every remote provider | `providers/*.js` | Lets the suite test request shaping and error handling with no network. |
| **Injectable `git`** boundary | `core/git.js` + orchestrator taking `diff` as input | The orchestrator is tested on diff strings, not by shelling out. |
| **`prepare-commit-msg` default over `post-commit`** | `cli.js`, `hooks/` | Pre-fills the editor so you always review before saving; post-commit's amend bypasses other hooks. |
| **Retryable-error classification** (429/5xx) | `providers/*.js` ProviderError `retryable` | Distinguishes transient failures from permanent ones for callers/fallback. |
| **Zero runtime dependencies** | `package.json` | A commit hook should be lighter than the code it documents; only dev tooling is installed. |

## The bug found & fixed during this build

**Greedy lead-in stripper ate valid commit prefixes.** The sanitizer removes
conversational openers a model might emit. The first regex —
`/^(here(?:'s| is)[^\n:]*:|commit message:|sure[^\n:]*:)\s*/i` — matched, on
the input `"Sure! fix: oops"`, all the way to the **second** colon, leaving
just `"oops"` and silently destroying the Conventional-Commits `fix:` type.
The test `sanitizeMessage removes a conversational lead-in` asserted the
result should be `"fix: oops"` and failed. The fix bounds each alternative so
a lead-in can only ever consume a recognised whole phrase and never a
following `type:` segment (see `sanitizeMessage` in `src/core/message.js` and
its tests in `test/message.test.js`).

Also verified live in a throwaway repo, which is the real test of a hook:

* an empty commit was auto-filled (`feat(payments): add charge.js`) by the
  offline engine with no key;
* `git commit -m "wip: my own words"` was preserved exactly;
* zero `#` comment lines leaked into the stored commit message.

## AI assistance, plainly

Designed and directed by Mughirah Nasir; implemented in disclosed
pair-programming sessions with Claude (Anthropic). See `PROVENANCE.md` for
the verification approach (clean source snapshot → SHA-256 manifest in
`CERTIFICATE.html` → GitHub push timestamp once published → optional
OpenTimestamps anchor).
