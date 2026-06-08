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

## Maintenance

The `reference/` directory holds human-readable snapshots of the extension's display code — the source of truth for understanding what needs RTL fixes:

| File | Description |
|------|-------------|
| `reference/index.css` | Formatted copy of `webview/index.css` (the React SPA stylesheet) |
| `reference/review-template.html` | HTML + CSS of the plan-review webview (extracted from `extension.js`) |
| `reference/chat-template.html` | Shell HTML of the main chat webview |
| `reference/VERSION` | Extension version the snapshots were taken from |

There is deliberately **no automated analyzer** — deciding what to fix requires reading the CSS in context (a `text-align: left` on a code block is correct; the same rule on a message is a bug), and a property-name filter throws that context away. The workflow is a plain, human-read `git diff`:

```bash
# 1. Locate the installed extension's stylesheet. The unpatched original is
#    the .bak file fix-rtl.js leaves behind; otherwise use index.css directly.
#    (Path varies by version/platform — adjust the glob.)
#    Windows:  $env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.css.bak
#    macOS/Linux: ~/.vscode/extensions/anthropic.claude-code-*/webview/index.css.bak

# 2. Overwrite the snapshot and re-format it (prettier is the only mechanical step).
cp <that index.css> reference/index.css
npx --yes prettier --write reference/index.css --parser css

# 3. Read the change with full selector context, then update reference/VERSION.
git diff reference/index.css
```

The HTML templates (`review-template.html`, `chat-template.html`) change rarely. When they do, extract them manually from the new `extension.js` and commit the update alongside any fix-rtl changes.

## Supported Platforms

Windows, macOS, Linux, WSL, Codespaces, Cursor, VS Code Insiders.

---

Built in one shot with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) + [Babysitter](https://github.com/a5c-ai/babysitter) — spun up an GitHub Codespace (so Claude has VS Code to run tests), gave it a single prompt to write an RTL fix with E2E tests using Babysitter, and ran it on YOLO mode. When the agent has clear completion criteria, self-feedback capabilities, and Babysitter enforcing no skipped steps — it delivers.
