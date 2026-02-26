#!/usr/bin/env node
// Claude Code RTL Fix — node fix-rtl.js [--revert] [--check]
// Fixes Hebrew/Arabic/RTL text alignment in the Claude Code VS Code extension.
// Zero dependencies. Works on Windows/macOS/Linux/WSL/Codespaces/Cursor.

const fs = require("fs");
const path = require("path");
const os = require("os");

const MARKER = "/* CLAUDE-CODE-RTL-FIX */";

function findExtensions() {
  if (process.env.CLAUDE_CODE_EXT_DIR) return [process.env.CLAUDE_CODE_EXT_DIR];

  const home = os.homedir();
  const dirs = [
    ".vscode/extensions", ".vscode-server/extensions", ".vscode-remote/extensions",
    ".vscode-insiders/extensions", ".cursor/extensions",
  ].map((d) => path.join(home, d));

  if (process.platform === "win32" && process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, "Code", "User", "extensions"));
  }
  if (process.platform === "darwin") {
    dirs.push(path.join(home, "Library/Application Support/Code/User/extensions"));
  }
  if (process.platform === "linux" && fs.existsSync("/mnt/c/Users")) {
    try {
      for (const u of fs.readdirSync("/mnt/c/Users").filter((u) => !u.startsWith("."))) {
        dirs.push(path.join("/mnt/c/Users", u, ".vscode/extensions"));
      }
    } catch {}
  }

  const found = [];
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith("anthropic.claude-code-")) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) found.push(full);
        }
      }
    } catch {}
  }
  return found;
}

function buildCss(css) {
  // Extract CSS-module hash suffixes dynamically
  const h = (name) => {
    const m = css.match(new RegExp(`\\.${name}_([A-Za-z0-9]+)(?=[\\s{.,:])`));
    return m ? `.${name}_${m[1]}` : `[class*="${name}_"]`;
  };

  const msg = h("message");
  const timeline = h("timelineMessage");

  return `
${MARKER}
${msg}, ${h("userMessage")}, ${h("userMessageContainer")},
${timeline}, ${h("slashCommandMessage")}, ${h("slashCommandResultMessage")},
${h("interruptedMessage")}, ${h("progressContent")},
[data-testid="assistant-message"] { unicode-bidi: plaintext; text-align: start; }

${msg}${h("userMessageContainer")} { text-align: start; }

${msg} p, ${msg} li, ${msg} span, ${msg} div,
[data-testid="assistant-message"] p, [data-testid="assistant-message"] li,
[data-testid="assistant-message"] span, [data-testid="assistant-message"] div
{ unicode-bidi: plaintext; text-align: start; }

${msg} pre, ${msg} code,
[data-testid="assistant-message"] pre, [data-testid="assistant-message"] code
{ unicode-bidi: normal; direction: ltr; text-align: left; }

${timeline} { padding-inline-start: 30px; padding-left: unset; }
${timeline}::before { inset-inline-start: 9px; left: unset; }
${timeline}::after { inset-inline-start: 12px; left: unset; }

[class*="inputContainer_"] textarea, [class*="inputContainer_"] [contenteditable]
{ unicode-bidi: plaintext; text-align: start; }
${MARKER}
`.trim();
}

function stripPatch(css) {
  const i = css.indexOf(MARKER);
  if (i === -1) return css;
  const j = css.indexOf(MARKER, i + 1);
  return css.substring(0, i).replace(/\n+$/, "") + (j !== -1 ? css.substring(j + MARKER.length) : "");
}

// ── Main ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const exts = findExtensions();

if (!exts.length) { console.error("Claude Code extension not found."); process.exit(1); }

for (const ext of exts) {
  const file = path.join(ext, "webview", "index.css");
  const ver = path.basename(ext).replace("anthropic.claude-code-", "");
  if (!fs.existsSync(file)) continue;

  if (args.includes("--check")) {
    console.log(`[${ver}] ${fs.readFileSync(file, "utf8").includes(MARKER) ? "PATCHED" : "NOT PATCHED"}`);
    continue;
  }

  if (args.includes("--revert")) {
    const bak = file + ".bak";
    if (fs.existsSync(bak)) { fs.copyFileSync(bak, file); fs.unlinkSync(bak); }
    else { fs.writeFileSync(file, stripPatch(fs.readFileSync(file, "utf8"))); }
    console.log(`[${ver}] Reverted.`);
    continue;
  }

  let css = fs.readFileSync(file, "utf8");
  css = stripPatch(css); // idempotent
  if (!css.match(/\.message_[A-Za-z0-9]+/)) { console.error(`[${ver}] Unrecognized CSS.`); continue; }

  const bak = file + ".bak";
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, css);
  fs.writeFileSync(file, css + "\n" + buildCss(css));
  console.log(`[${ver}] RTL patch applied!`);
}

if (!args.includes("--check")) console.log('\nReload: Ctrl+Shift+P -> "Reload Window"');
