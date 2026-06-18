# Provenance

**Project:** commit-storyteller v1.0.0
**Author / Director:** Mughirah Nasir (<mnasir.bee25seecs@seecs.edu.pk>)
**GitHub:** [@Mughirah-Nasir](https://github.com/Mughirah-Nasir)
**Built:** June 2026

## What this document is

A plain statement of where this project came from and how to verify it.

## Origin of the idea

commit-storyteller is project **B3** in my summer 2026 portfolio build plan,
described there as a "Git Commit Storyteller": a local git hook that turns a
diff into a clean, human-readable commit message. The distinctive design
choice — making a **deterministic offline engine** the core (so the tool
works with no API key) and treating LLM providers as an optional, swappable
upgrade layer — is mine, and it is the thing that makes this more than a
thin wrapper around a chat endpoint.

## How it was built (honestly)

I design and direct these projects and build them in openly disclosed
pair-programming sessions with **Claude (Anthropic)**. Concretely:

* The offline-first architecture, the Strategy-pattern provider abstraction,
  the never-block-a-commit fallback guarantee, the noise-collapsing /
  token-budgeted diff processor, and the comment-preserving message merge are
  my design decisions, and I can explain every one without notes.
* Implementation was AI-assisted, disclosed in the README, the way the
  industry treats such tools in 2026 — a velocity tool, with my understanding
  (not my typing speed) as the thing being evidenced.
* The test suite caught a genuine bug during this build: the conversational
  lead-in stripper in the message sanitizer was greedy enough to eat a valid
  Conventional-Commits `type:` prefix (`"Sure! fix: oops"` → `"oops"`). The
  test that catches it (`sanitizeMessage removes a conversational lead-in`)
  and the corrected code both ship in this snapshot. Real bugs found and
  fixed are part of the evidence that this was *developed*, not pasted.

## How to verify authorship

1. **Clean source snapshot.** This public release is provided as a clean
   source snapshot rather than with embedded `.git` history. The full source
   tree — code, tests, documentation, design notes, and package metadata — is
   included for inspection, and the source tree is fingerprinted (below) so
   you can confirm nothing changed after it was sealed.
2. **GitHub push timestamp.** Once published, the push date on
   `github.com/Mughirah-Nasir/commit-storyteller` is recorded by GitHub's
   servers and is not editable by me.
3. **Source-tree fingerprint.** `CERTIFICATE.html` embeds a SHA-256 hash over
   a sorted manifest of the source files. Anyone can recompute it (the exact
   command is in the certificate) and confirm the tree they are reading is
   the tree that was fingerprinted.
4. **(Optional) Blockchain anchor.** The hash can be anchored in the Bitcoin
   blockchain via [OpenTimestamps](https://opentimestamps.org)
   (`ots stamp PROVENANCE.md`), proving the file existed no later than the
   anchored block's time, with no trust in me required.

## What I do *not* claim

* I do not claim every line was typed by hand without AI assistance.
* I do not claim this is the only tool of its kind.
* I do not claim the offline engine writes messages as well as a model does —
  it describes *what* changed, not *why*.

I claim the thing that matters: this is **my project** — my problem, my
design decisions, my understanding — and the evidence above is checkable.

— Mughirah Nasir, June 2026
