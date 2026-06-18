/**
 * A thin wrapper over the few git commands we need. Kept separate so the
 * orchestrator can be tested with a fake git object instead of shelling out.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export class Git {
  /**
   * @param {object} [opts]
   * @param {string} [opts.cwd]
   */
  constructor(opts = {}) {
    this.cwd = opts.cwd ?? process.cwd();
  }

  async _git(args) {
    const { stdout } = await run("git", args, {
      cwd: this.cwd,
      maxBuffer: 50 * 1024 * 1024, // large diffs are fine; we trim later
    });
    return stdout;
  }

  /** The staged diff, with renames detected. */
  async stagedDiff() {
    return this._git(["diff", "--cached", "--no-color", "-M"]);
  }

  /** Current branch name, or '' in detached HEAD. */
  async currentBranch() {
    try {
      const out = await this._git(["rev-parse", "--abbrev-ref", "HEAD"]);
      const name = out.trim();
      return name === "HEAD" ? "" : name;
    } catch {
      return "";
    }
  }

  /** True if there is anything staged. */
  async hasStagedChanges() {
    try {
      // --quiet exits 1 when there ARE differences.
      await this._git(["diff", "--cached", "--quiet"]);
      return false;
    } catch (err) {
      // exit code 1 => differences exist; anything else is a real error.
      if (err && typeof err.code === "number" && err.code === 1) return true;
      throw err;
    }
  }

  /** Amend the most recent commit's message (used by the post-commit hook). */
  async amendMessage(message) {
    await run("git", ["commit", "--amend", "-m", message, "--no-verify"], {
      cwd: this.cwd,
    });
  }
}
