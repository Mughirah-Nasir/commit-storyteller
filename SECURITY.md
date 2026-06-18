# Security policy

commit-storyteller reads your **staged git diff** to generate a commit message.
Where that diff goes depends entirely on which provider you configure.

## Keys and secrets

- **Never commit API keys or secrets.** Provider keys are read from environment
  variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) and are never written to a
  config file by the tool.
- **Don't stage secrets.** The staged diff is the input to this tool. If you
  stage a `.env` file, a private key, or a hard-coded credential, it becomes
  part of what a remote provider receives. Keep secrets out of your commits in
  the first place.

## Where your staged diff goes, by provider

- **`offline`** (default) — your diff is processed entirely on your machine.
  Nothing is sent anywhere.
- **`ollama`** — your diff is sent to a local Ollama daemon on your own machine
  (`127.0.0.1:11434` by default). It does not leave your machine.
- **`anthropic`** — your staged diff is sent to Anthropic's Messages API.
- **`openai`** — your staged diff is sent to OpenAI's Chat Completions API
  (or to whatever endpoint you point `OPENAI_BASE_URL` at).

## Using remote providers responsibly

Do **not** use the `anthropic` or `openai` providers on:

- private or proprietary code you are not permitted to share,
- secrets, credentials, or key material,
- customer data or other regulated/confidential information.

For that kind of work, use the `offline` or `ollama` provider so your diff
never leaves your machine. When in doubt, default to `offline`.

## Reporting a vulnerability

Please report security issues privately by email to
**mnasir.bee25seecs@seecs.edu.pk** rather than opening a public issue. After a
fix is released you are welcome to disclose publicly.
