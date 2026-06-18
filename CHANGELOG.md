# Changelog

All notable changes to commit-storyteller are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) loosely; versions
follow [SemVer](https://semver.org/).

## v1.0.0 — Initial public release

### Added
- A `prepare-commit-msg` git hook (default) and an alternative `post-commit`
  hook that turn your staged diff into a clean commit message
- A deterministic **offline engine** that generates a Conventional-Commits
  message from the diff with no API key and no network — also the fallback if
  a configured model call fails
- Provider abstraction with four implementations behind one interface: offline,
  Anthropic, OpenAI, and Ollama (local)
- A diff parser, a noise-collapsing / token-budgeting diff processor, and a
  message sanitizer that strips model fences/lead-ins and preserves git's
  comment block and any message you already typed
- CLI: `preview`, `install`, `init`, `run` (hook entry), `post-commit`,
  `--version`
- Two message styles: `conventional` (default) and `prose`
- Layered configuration (defaults → `.storytellerrc.json` → environment)
- CI across Node 18/20/22 (Linux) and Node 20 (Windows)

### Fixed
- **Hook installer.** `install` previously wrote a hook that called
  `npx --no-install storyteller`, which fails with "could not determine
  executable to run" in a fresh repo where the package isn't linked — silently
  skipping message generation. The installed hook now invokes the CLI by its
  resolved absolute path (`node "<path>/cli.js" ...`), so the documented
  quick-start works without installing or linking the package.

### Notes
- The offline engine describes *what* changed, not *why*; use an LLM provider
  for intent.
- The hook can never block a commit: every failure degrades to the offline
  engine, and the installed hook ends in `|| true`.
