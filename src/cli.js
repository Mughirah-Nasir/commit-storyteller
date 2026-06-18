#!/usr/bin/env node
/**
 * commit-storyteller CLI.
 *
 * Subcommands:
 *   storyteller preview            generate a message for the current staged
 *                                  diff and print it (no git changes)
 *   storyteller run <msgfile> ...  the prepare-commit-msg entry point
 *   storyteller post-commit        the post-commit entry point (amends)
 *   storyteller install            install git hooks into .git/hooks
 *   storyteller init               write a starter .storytellerrc.json
 *   storyteller --help
 *
 * The CLI never lets an operational failure block a commit: in hook mode any
 * unexpected error is reported to stderr and we exit 0 so git proceeds with
 * whatever message already exists.
 */

import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, DEFAULT_CONFIG } from "./core/config.js";
import { generateMessage } from "./core/orchestrator.js";
import { mergeIntoCommitFile, hasUserMessage } from "./core/message.js";
import { Git } from "./core/git.js";

const HOOK_NAMES = ["prepare-commit-msg", "post-commit"];

async function main(argv) {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "preview":
      return cmdPreview(rest);
    case "run":
    case "prepare-commit-msg":
      return cmdPrepareCommitMsg(rest);
    case "post-commit":
      return cmdPostCommit(rest);
    case "install":
      return cmdInstall(rest);
    case "init":
      return cmdInit(rest);
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;
    case "--version":
    case "-v":
      printVersion();
      return 0;
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n`);
      printHelp();
      return 2;
  }
}

/** Print a generated message for the staged diff; makes no changes. */
async function cmdPreview(_args) {
  const config = safeLoadConfig();
  const git = new Git();

  if (!(await git.hasStagedChanges())) {
    process.stderr.write("nothing staged -- `git add` something first.\n");
    return 1;
  }

  const diff = await git.stagedDiff();
  const branch = await git.currentBranch();
  const result = await generateMessage({ diff, branch, config });

  if (!result.message) {
    process.stderr.write("no message could be generated (empty diff?).\n");
    return 1;
  }

  process.stdout.write(result.message + "\n");
  if (result.fellBack) {
    process.stderr.write(
      `\n(note: ${config.provider} failed, used offline engine: ${result.meta.fallbackReason})\n`,
    );
  } else {
    process.stderr.write(`\n(provider: ${result.usedProvider})\n`);
  }
  return 0;
}

/**
 * prepare-commit-msg hook. git calls:
 *   <hook> <path-to-COMMIT_EDITMSG> [source] [sha]
 * We skip when source indicates the message is already provided (merge,
 * squash, commit, template) or when the user already typed one.
 */
async function cmdPrepareCommitMsg(args) {
  const [msgFile, source] = args;
  if (!msgFile || !existsSync(msgFile)) {
    // Not enough context to do anything safely; let git proceed.
    return 0;
  }

  // Sources where we must not interfere: an existing message (-m / -F / -c),
  // a merge, or a squash. We only fill the empty-template and undefined cases.
  if (
    source === "message" ||
    source === "merge" ||
    source === "squash" ||
    source === "commit"
  ) {
    return 0;
  }

  try {
    const config = safeLoadConfig();
    const current = readFileSync(msgFile, "utf8");

    if (hasUserMessage(current) && !config.overwriteUserMessage) {
      return 0; // respect what the user wrote
    }

    const git = new Git();
    const diff = await git.stagedDiff();
    const branch = await git.currentBranch();
    const result = await generateMessage({ diff, branch, config });

    if (result.message) {
      const merged = mergeIntoCommitFile(current, result.message, {
        force: config.overwriteUserMessage,
      });
      writeFileSync(msgFile, merged, "utf8");
    }
  } catch (err) {
    // Never block a commit because of us.
    process.stderr.write(`commit-storyteller (non-fatal): ${err.message}\n`);
  }
  return 0;
}

/** post-commit hook: amend the just-made commit with a generated message. */
async function cmdPostCommit(_args) {
  try {
    const config = safeLoadConfig();
    const git = new Git();
    // At post-commit the changes are no longer staged; diff against HEAD~1.
    let diff = "";
    try {
      diff = await git._git(["diff", "HEAD~1", "HEAD", "--no-color", "-M"]);
    } catch {
      return 0; // first commit / shallow; nothing to do
    }
    const branch = await git.currentBranch();
    const result = await generateMessage({ diff, branch, config });
    if (result.message) await git.amendMessage(result.message);
  } catch (err) {
    process.stderr.write(`commit-storyteller (non-fatal): ${err.message}\n`);
  }
  return 0;
}

/** Install hook scripts into .git/hooks. */
function cmdInstall(args) {
  const git = new Git();
  const hooksDir = join(git.cwd, ".git", "hooks");
  if (!existsSync(join(git.cwd, ".git"))) {
    process.stderr.write("not a git repository (no .git directory here).\n");
    return 1;
  }
  mkdirSync(hooksDir, { recursive: true });

  const which = args[0] && HOOK_NAMES.includes(args[0]) ? [args[0]] : ["prepare-commit-msg"];

  for (const hook of which) {
    const target = join(hooksDir, hook);
    if (existsSync(target)) {
      process.stderr.write(
        `hook ${hook} already exists at ${target} -- not overwriting. ` +
          "Add the storyteller line manually (see README).\n",
      );
      continue;
    }
    const script = hookScript(hook);
    writeFileSync(target, script, "utf8");
    chmodSync(target, 0o755);
    process.stdout.write(`installed ${hook} -> ${target}\n`);
  }
  return 0;
}

function hookScript(hook) {
  // Resolve THIS cli.js file's absolute path and bake it into the hook, so the
  // hook works in any repo without the package being installed or linked there
  // (the previous `npx --no-install storyteller` approach failed with "could
  // not determine executable to run" in a fresh repo). The `|| true` keeps a
  // hook failure from ever blocking a commit.
  const cliPath = fileURLToPath(import.meta.url);
  const sub = hook === "post-commit" ? "post-commit" : 'run "$1" "$2" "$3"';
  return (
    "#!/bin/sh\n" +
    `# commit-storyteller ${hook} hook\n` +
    `node "${cliPath}" ${sub} || true\n`
  );
}

/** Write a starter config file. */
function cmdInit() {
  const target = join(process.cwd(), ".storytellerrc.json");
  if (existsSync(target)) {
    process.stderr.write(".storytellerrc.json already exists -- leaving it alone.\n");
    return 1;
  }
  const starter = {
    provider: DEFAULT_CONFIG.provider,
    style: DEFAULT_CONFIG.style,
    hook: DEFAULT_CONFIG.hook,
    fallbackToOffline: DEFAULT_CONFIG.fallbackToOffline,
  };
  writeFileSync(target, JSON.stringify(starter, null, 2) + "\n", "utf8");
  process.stdout.write(`wrote ${target}\n`);
  return 0;
}

function safeLoadConfig() {
  try {
    return loadConfig();
  } catch (err) {
    process.stderr.write(
      `commit-storyteller: config problem (${err.message}); using defaults.\n`,
    );
    return loadConfig({ env: {}, cwd: "/" }); // pure defaults
  }
}

function printVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
  } catch {
    process.stdout.write("unknown\n");
  }
}

function printHelp() {
  process.stdout.write(
    `commit-storyteller -- generate clean commit messages from your staged diff

Usage:
  storyteller preview              Print a message for the staged diff (no changes)
  storyteller install [hook]       Install a git hook (default: prepare-commit-msg)
  storyteller init                 Write a starter .storytellerrc.json
  storyteller run <file> [src]     prepare-commit-msg hook entry (called by git)
  storyteller post-commit          post-commit hook entry (called by git)
  storyteller --version            Print version

Providers (set STORYTELLER_PROVIDER or .storytellerrc.json):
  offline    deterministic, no API key (default)
  anthropic  needs ANTHROPIC_API_KEY
  openai     needs OPENAI_API_KEY
  ollama     local daemon, no key

Styles: conventional (default) | prose
`,
  );
}

main(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    // A crash in the CLI itself still must not wedge a commit when run as a
    // hook, but for direct invocation a non-zero exit is correct.
    process.stderr.write(`commit-storyteller: ${err.stack || err.message}\n`);
    process.exit(1);
  });
