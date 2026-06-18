/**
 * Public API for commit-storyteller, for anyone who wants to use the engine
 * programmatically instead of through the hook/CLI.
 */

export { parseDiff, summarizeStats } from "./core/diff-parser.js";
export { processDiff, isNoiseFile } from "./core/diff-processor.js";
export { offlineSummary } from "./core/summarizer.js";
export { buildPrompt, SYSTEM_PROMPT } from "./core/prompt-builder.js";
export {
  sanitizeMessage,
  mergeIntoCommitFile,
  splitCommitFile,
  hasUserMessage,
} from "./core/message.js";
export { generateMessage } from "./core/orchestrator.js";
export { loadConfig, DEFAULT_CONFIG } from "./core/config.js";
export { createProvider } from "./providers/factory.js";
export { FakeProvider, ProviderError } from "./providers/base.js";
