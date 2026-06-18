import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(fileURLToPath(new URL("../src/cli.js", import.meta.url)));

function freshRepo() {
  const dir = mkdtempSync(join(tmpdir(), "storyteller-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  return dir;
}

test("install writes a prepare-commit-msg hook that calls the CLI by absolute path", () => {
  const dir = freshRepo();
  try {
    execFileSync("node", [CLI, "install"], { cwd: dir });
    const hookPath = join(dir, ".git", "hooks", "prepare-commit-msg");
    assert.ok(existsSync(hookPath), "hook file should exist");

    const content = readFileSync(hookPath, "utf8");
    // The critical fix: an absolute `node "<path>/cli.js"` invocation, not npx.
    assert.match(content, /^#!\/bin\/sh/);
    assert.ok(content.includes(`node "${CLI}"`), "hook must call the CLI by absolute path");
    assert.ok(content.includes('run "$1" "$2" "$3"'), "hook must pass git's hook args");
    assert.ok(
      content.trimEnd().endsWith("|| true"),
      "hook must not be able to block a commit",
    );
    // Regression guard: the broken npx form must be gone.
    assert.ok(!content.includes("npx --no-install"), "must not use npx --no-install");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install post-commit writes a post-commit hook by absolute path", () => {
  const dir = freshRepo();
  try {
    execFileSync("node", [CLI, "install", "post-commit"], { cwd: dir });
    const content = readFileSync(join(dir, ".git", "hooks", "post-commit"), "utf8");
    assert.ok(content.includes(`node "${CLI}" post-commit`));
    assert.ok(!content.includes("npx --no-install"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a commit with staged changes gets an auto-generated message (end to end)", () => {
  const dir = freshRepo();
  try {
    execFileSync("node", [CLI, "install"], { cwd: dir });
    writeFileSync(join(dir, "app.js"), "export const x = 1;\n", "utf8");
    execFileSync("git", ["add", "app.js"], { cwd: dir });
    // --no-edit so no editor opens; the hook should fill the empty message.
    execFileSync("git", ["commit", "--no-edit"], { cwd: dir });

    const msg = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: dir })
      .toString()
      .trim();
    assert.ok(msg.length > 0, "commit message must not be empty");
    // Offline engine produces a conventional-commit subject for a new file.
    assert.match(msg, /^(feat|fix|chore|docs|test|refactor|build|ci|style)/);
    assert.ok(msg.includes("app.js"), "message should mention the changed file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the installed hook does not clobber a user-provided -m message", () => {
  const dir = freshRepo();
  try {
    execFileSync("node", [CLI, "install"], { cwd: dir });
    writeFileSync(join(dir, "a.js"), "export const y = 2;\n", "utf8");
    execFileSync("git", ["add", "a.js"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "my own message"], { cwd: dir });

    const msg = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: dir })
      .toString()
      .trim();
    assert.equal(msg, "my own message");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
