# Claude Code RTL Fix

Fixes RTL text alignment in the [Claude Code VS Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) for Hebrew, Arabic, and other RTL languages.

## Installation & Usage

```bash
npx claude-code-rtl-fix
```

Re-run after each extension update.

### Options

```bash
npx claude-code-rtl-fix --revert  # Revert
npx claude-code-rtl-fix --check   # Check status
```

After running, reload VS Code: `Ctrl+Shift+P` → "Reload Window".

Re-run after each extension update.

## How It Works

Injects CSS with `unicode-bidi: plaintext` into the extension's webview, so each paragraph auto-detects its direction. Code blocks stay LTR. Version-agnostic — discovers CSS class hashes dynamically.

## Supported Platforms

Windows, macOS, Linux, WSL, Codespaces, Cursor, VS Code Insiders.

---

Built in one shot with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) + [Babysitter](https://github.com/a5c-ai/babysitter) — spun up an GitHub Codespace (so Claude has VS Code to run tests), gave it a single prompt to write an RTL fix with E2E tests using Babysitter, and ran it on YOLO mode. When the agent has clear completion criteria, self-feedback capabilities, and Babysitter enforcing no skipped steps — it delivers.
