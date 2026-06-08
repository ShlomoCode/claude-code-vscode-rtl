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

  // `.message_` appears in several unrelated CSS modules (status text,
  // empty-state), and those are emitted *before* the chat module in the bundle,
  // so a naive first-match grabs the wrong hash and the message-body rules never
  // match the real chat DOM. Anchor on `userMessageContainer`, whose hash is
  // unique to the chat module, and reuse it for `.message_`. Fall back to the
  // first-match heuristic only if that class is absent.
  const familyHash = (css.match(/\.userMessageContainer_([A-Za-z0-9]+)/) || [])[1];
  const msg = familyHash ? `.message_${familyHash}` : h("message");
  const timeline = h("timelineMessage");

  // Level 2 — UI chrome outside the message body (menus, session list, links,
  // labels). In the bundle these carry a hardcoded `text-align: left`, which
  // resolves to physical left regardless of locale. Pairing `text-align: start`
  // with `unicode-bidi: plaintext` lets each element follow its own content's
  // direction — the same proven pair used on the message body above.
  // Several of these base names appear with multiple module hashes, so we use
  // `[class*="name_"]` rather than a single discovered hash.
  const uiChrome = [
    "menuItem", "menuItemV2", "popupOption", "optionButton", "effortRow", "scopeOption",
    "sessionItem", "nullStateLink", "viewToolsLink", "manageLink",
    "noteBeneathButton", "titleText", "toolBodyRowLabel",
  ].map((n) => `[class*="${n}_"]`).join(", ");

  // Block-level elements inside the message body (including rendered markdown).
  // `unicode-bidi: plaintext` does NOT inherit to block children, so each block
  // tag must be targeted directly — headings, list items, table cells, and
  // blockquotes otherwise fall back to the default ltr direction and align left
  // regardless of their text.
  const bodyPrefixes = [msg, '[data-testid="assistant-message"]'];
  const blockTags = [
    "p", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "th", "td", "dd", "dt",
  ];
  const bodyBlocks = bodyPrefixes
    .flatMap((pfx) => blockTags.map((tag) => `${pfx} ${tag}`))
    .join(", ");

  return `
${MARKER}
${msg}, ${h("userMessage")}, ${h("userMessageContainer")},
${timeline}, ${h("slashCommandMessage")}, ${h("slashCommandResultMessage")},
${h("interruptedMessage")}, ${h("progressContent")},
[data-testid="assistant-message"] { unicode-bidi: plaintext; text-align: start; }

${msg}${h("userMessageContainer")} { text-align: start; }

${bodyBlocks}
{ unicode-bidi: plaintext; text-align: start; }

${msg} pre, ${msg} code,
[data-testid="assistant-message"] pre, [data-testid="assistant-message"] code
{ unicode-bidi: normal; direction: ltr; text-align: left; }

/* The composer is a mirror-based editor: a transparent contenteditable
   (.messageInput_, color: #0000) holds the caret, while an absolutely
   positioned .mentionMirror_ paints the visible text + mention chips on top.
   Both layers must get the SAME bidi treatment, or the visible text and the
   caret drift apart. plaintext makes each line follow its own direction. */
[class*="messageInput_"], [class*="mentionMirror_"],
[class*="inputContainer_"] textarea
{ unicode-bidi: plaintext; text-align: start; }

${uiChrome}
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

// ── Exports (for testing) / CLI ──────────────────────────────────────────────

module.exports = { MARKER, findExtensions, buildCss, stripPatch };

if (require.main === module) {
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
}
