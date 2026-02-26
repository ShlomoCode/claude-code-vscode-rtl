#!/usr/bin/env node
/**
 * Claude Code RTL Patch
 *
 * Patches the Claude Code VS Code extension to support RTL text alignment
 * for Hebrew, Arabic, and other RTL languages.
 *
 * This script is version-agnostic: it dynamically discovers the extension
 * directory and CSS module class names regardless of the installed version.
 *
 * Usage:
 *   node patch-rtl.js            # Apply RTL fix
 *   node patch-rtl.js --revert   # Revert the fix
 *   node patch-rtl.js --check    # Check if patch is applied
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Marker comments used to identify our injected CSS
const PATCH_START = "/* CLAUDE-CODE-RTL-FIX:START */";
const PATCH_END = "/* CLAUDE-CODE-RTL-FIX:END */";

/**
 * Finds the Claude Code extension directory across platforms and VS Code variants.
 * Returns the path or null if not found.
 */
function findExtensionDirs() {
  const home = os.homedir();
  const candidates = [];

  // Standard VS Code — all platforms
  candidates.push(path.join(home, ".vscode", "extensions"));
  candidates.push(path.join(home, ".vscode-server", "extensions"));
  candidates.push(path.join(home, ".vscode-remote", "extensions"));

  // VS Code Insiders
  candidates.push(path.join(home, ".vscode-insiders", "extensions"));

  // Cursor
  candidates.push(path.join(home, ".cursor", "extensions"));

  // Windows-specific: APPDATA / LOCALAPPDATA locations
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (appData) {
      candidates.push(path.join(appData, "Code", "User", "extensions"));
      candidates.push(path.join(appData, "Code - Insiders", "User", "extensions"));
      candidates.push(path.join(appData, "Cursor", "User", "extensions"));
    }
    if (localAppData) {
      candidates.push(path.join(localAppData, "Programs", "Microsoft VS Code", "extensions"));
    }
  }

  // macOS-specific
  if (process.platform === "darwin") {
    candidates.push(path.join(home, "Library", "Application Support", "Code", "User", "extensions"));
    candidates.push(path.join(home, "Library", "Application Support", "Cursor", "User", "extensions"));
  }

  // WSL: access Windows host extensions from inside WSL
  if (process.platform === "linux" && fs.existsSync("/mnt/c/Users")) {
    try {
      const winUsers = fs.readdirSync("/mnt/c/Users").filter(
        (u) => u !== "Public" && u !== "Default" && u !== "Default User" && u !== "All Users"
      );
      for (const user of winUsers) {
        candidates.push(path.join("/mnt/c/Users", user, ".vscode", "extensions"));
        candidates.push(path.join("/mnt/c/Users", user, ".vscode-server", "extensions"));
      }
    } catch {
      // No access to /mnt/c/Users
    }
  }

  // Allow override via environment variable
  if (process.env.CLAUDE_CODE_EXT_DIR) {
    return [process.env.CLAUDE_CODE_EXT_DIR];
  }

  const found = [];
  for (const extDir of candidates) {
    if (!fs.existsSync(extDir)) continue;
    try {
      const entries = fs.readdirSync(extDir);
      for (const entry of entries) {
        if (entry.startsWith("anthropic.claude-code-")) {
          const fullPath = path.join(extDir, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            found.push(fullPath);
          }
        }
      }
    } catch {
      // Permission denied or other error, skip
    }
  }

  return found;
}

/**
 * Extracts the CSS module hash suffix from the extension's CSS file.
 * We look for known class patterns like `message_XXXXXX` to discover the hash.
 */
function extractHashSuffix(cssContent) {
  // Look for the message class pattern — it's always present
  const match = cssContent.match(/\.message_([A-Za-z0-9]+)\s*\{/);
  if (match) return match[1];

  // Fallback: look for chatContainer
  const fallback = cssContent.match(/\.chatContainer_([A-Za-z0-9]+)\s*\{/);
  if (fallback) return fallback[1];

  return null;
}

/**
 * Extracts all unique hash suffixes from the CSS to handle multiple CSS module files.
 * Returns a map of semantic name -> hash suffix.
 */
function extractClassMap(cssContent) {
  const classMap = {};
  const patterns = [
    "message",
    "messagesContainer",
    "chatContainer",
    "userMessageContainer",
    "userMessage",
    "timelineMessage",
    "emptyStateContent",
    "emptyStateText",
    "highlightedMessage",
    "slashCommandMessage",
    "slashCommandResultMessage",
    "interruptedMessage",
    "metaMessage",
    "progressContent",
  ];

  for (const name of patterns) {
    // Match .className_hashSuffix with either { or , or . or : following
    const regex = new RegExp(
      `\\.${name}_([A-Za-z0-9]+)(?=[\\s{.,:\\[>~+])`,
      "g"
    );
    const match = regex.exec(cssContent);
    if (match) {
      classMap[name] = match[1];
    }
  }

  return classMap;
}

/**
 * Generates the RTL CSS fix rules.
 * Uses Unicode Bidi algorithm for automatic direction detection.
 */
function generateRtlCss(classMap) {
  const lines = [
    PATCH_START,
    "",
    "/*",
    " * RTL (Right-to-Left) text support for Claude Code",
    " * Supports Hebrew, Arabic, Persian, Urdu, and other RTL scripts.",
    " * Uses CSS unicode-bidi: plaintext for automatic direction detection",
    " * per-paragraph, so mixed LTR/RTL content renders correctly.",
    " */",
    "",
  ];

  // Core: auto-direction on message text containers
  // unicode-bidi: plaintext makes each block-level element determine its own
  // direction from its content's first strong directional character.
  const messageClass = classMap.message
    ? `.message_${classMap.message}`
    : '[class*="message_"]';
  const userMsgClass = classMap.userMessage
    ? `.userMessage_${classMap.userMessage}`
    : '[class*="userMessage_"]';
  const userMsgContainerClass = classMap.userMessageContainer
    ? `.userMessageContainer_${classMap.userMessageContainer}`
    : '[class*="userMessageContainer_"]';
  const timelineClass = classMap.timelineMessage
    ? `.timelineMessage_${classMap.timelineMessage}`
    : '[class*="timelineMessage_"]';
  const slashCmdClass = classMap.slashCommandMessage
    ? `.slashCommandMessage_${classMap.slashCommandMessage}`
    : '[class*="slashCommandMessage_"]';
  const slashCmdResultClass = classMap.slashCommandResultMessage
    ? `.slashCommandResultMessage_${classMap.slashCommandResultMessage}`
    : '[class*="slashCommandResultMessage_"]';
  const interruptedClass = classMap.interruptedMessage
    ? `.interruptedMessage_${classMap.interruptedMessage}`
    : '[class*="interruptedMessage_"]';
  const progressClass = classMap.progressContent
    ? `.progressContent_${classMap.progressContent}`
    : '[class*="progressContent_"]';

  lines.push(
    "/* Auto-detect text direction on all message text content */",
    `${messageClass},`,
    `${userMsgClass},`,
    `${userMsgContainerClass},`,
    `${timelineClass},`,
    `${slashCmdClass},`,
    `${slashCmdResultClass},`,
    `${interruptedClass},`,
    `${progressClass},`,
    `[data-testid="assistant-message"] {`,
    "  unicode-bidi: plaintext;",
    "  text-align: start;",
    "}",
    "",

    "/* Fix user message container alignment for RTL content */",
    `${messageClass}${userMsgContainerClass} {`,
    "  text-align: start;",
    "}",
    "",

    "/* Ensure paragraphs and inline text respect auto-direction */",
    `${messageClass} p,`,
    `${messageClass} li,`,
    `${messageClass} span,`,
    `${messageClass} div,`,
    `[data-testid="assistant-message"] p,`,
    `[data-testid="assistant-message"] li,`,
    `[data-testid="assistant-message"] span,`,
    `[data-testid="assistant-message"] div {`,
    "  unicode-bidi: plaintext;",
    "  text-align: start;",
    "}",
    "",

    "/* Preserve code blocks as LTR (code is always LTR) */",
    `${messageClass} pre,`,
    `${messageClass} code,`,
    `[data-testid="assistant-message"] pre,`,
    `[data-testid="assistant-message"] code {`,
    "  unicode-bidi: normal;",
    "  direction: ltr;",
    "  text-align: left;",
    "}",
    "",

    "/* Timeline dot position: use logical properties so dot stays correct in RTL */",
    `${timelineClass} {`,
    "  padding-inline-start: 30px;",
    "  padding-left: unset;",
    "}",
    "",
    `${timelineClass}::before {`,
    "  inset-inline-start: 9px;",
    "  left: unset;",
    "}",
    "",
    `${timelineClass}::after {`,
    "  inset-inline-start: 12px;",
    "  left: unset;",
    "}",
    "",

    "/* Input area RTL support */",
    '[class*="inputContainer_"] textarea,',
    '[class*="inputContainer_"] [contenteditable] {',
    "  unicode-bidi: plaintext;",
    "  text-align: start;",
    "}",
    "",

    PATCH_END
  );

  return lines.join("\n");
}

/**
 * Applies the RTL patch to a CSS file.
 */
function applyPatch(cssFilePath) {
  if (!fs.existsSync(cssFilePath)) {
    return { success: false, error: `CSS file not found: ${cssFilePath}` };
  }

  let cssContent = fs.readFileSync(cssFilePath, "utf8");

  // Check if already patched
  if (cssContent.includes(PATCH_START)) {
    // Remove existing patch before re-applying (upgrade scenario)
    cssContent = removePatchContent(cssContent);
  }

  // Extract class name mapping
  const classMap = extractClassMap(cssContent);
  if (!classMap.message) {
    return {
      success: false,
      error:
        "Could not extract CSS class names from extension. The extension structure may have changed.",
    };
  }

  // Generate and append the RTL CSS
  const rtlCss = generateRtlCss(classMap);
  const patchedContent = cssContent + "\n" + rtlCss;

  // Backup original
  const backupPath = cssFilePath + ".rtl-backup";
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, cssContent);
  }

  // Write patched CSS
  fs.writeFileSync(cssFilePath, patchedContent);

  return {
    success: true,
    classMap,
    backupPath,
  };
}

/**
 * Removes the RTL patch from CSS content.
 */
function removePatchContent(cssContent) {
  const startIdx = cssContent.indexOf(PATCH_START);
  const endIdx = cssContent.indexOf(PATCH_END);
  if (startIdx === -1 || endIdx === -1) return cssContent;
  // Remove from the newline before PATCH_START to the end of PATCH_END
  const beforePatch = cssContent.substring(0, startIdx).replace(/\n+$/, "");
  const afterPatch = cssContent.substring(endIdx + PATCH_END.length);
  return beforePatch + afterPatch;
}

/**
 * Reverts the RTL patch.
 */
function revertPatch(cssFilePath) {
  if (!fs.existsSync(cssFilePath)) {
    return { success: false, error: `CSS file not found: ${cssFilePath}` };
  }

  const backupPath = cssFilePath + ".rtl-backup";

  if (fs.existsSync(backupPath)) {
    // Restore from backup
    const original = fs.readFileSync(backupPath, "utf8");
    fs.writeFileSync(cssFilePath, original);
    fs.unlinkSync(backupPath);
    return { success: true, method: "backup" };
  }

  // No backup — try to strip the patch markers
  let cssContent = fs.readFileSync(cssFilePath, "utf8");
  if (cssContent.includes(PATCH_START)) {
    cssContent = removePatchContent(cssContent);
    fs.writeFileSync(cssFilePath, cssContent);
    return { success: true, method: "strip" };
  }

  return { success: false, error: "No patch found to revert" };
}

/**
 * Checks if the patch is currently applied.
 */
function checkPatch(cssFilePath) {
  if (!fs.existsSync(cssFilePath)) return false;
  const content = fs.readFileSync(cssFilePath, "utf8");
  return content.includes(PATCH_START);
}

// --- CLI entry point ---
function main() {
  const args = process.argv.slice(2);
  const isRevert = args.includes("--revert");
  const isCheck = args.includes("--check");
  const isQuiet = args.includes("--quiet");

  const log = isQuiet ? () => {} : console.log;

  const extDirs = findExtensionDirs();
  if (extDirs.length === 0) {
    console.error(
      "Error: Claude Code extension not found. Make sure it is installed."
    );
    console.error("You can set CLAUDE_CODE_EXT_DIR to specify the path manually.");
    process.exit(1);
  }

  let anySuccess = false;

  for (const extDir of extDirs) {
    const cssFile = path.join(extDir, "webview", "index.css");
    const version = path.basename(extDir).replace("anthropic.claude-code-", "");

    if (isCheck) {
      const patched = checkPatch(cssFile);
      log(`[${version}] ${patched ? "PATCHED" : "NOT PATCHED"} — ${extDir}`);
      anySuccess = anySuccess || patched;
      continue;
    }

    if (isRevert) {
      const result = revertPatch(cssFile);
      if (result.success) {
        log(`[${version}] Reverted RTL patch (${result.method}) — ${extDir}`);
        anySuccess = true;
      } else {
        log(`[${version}] ${result.error} — ${extDir}`);
      }
      continue;
    }

    // Apply patch
    const result = applyPatch(cssFile);
    if (result.success) {
      log(`[${version}] RTL patch applied successfully — ${extDir}`);
      log(
        `  Classes found: ${Object.keys(result.classMap).join(", ")}`
      );
      log(`  Backup saved: ${result.backupPath}`);
      log('  Reload VS Code window to see changes (Ctrl+Shift+P → "Reload Window")');
      anySuccess = true;
    } else {
      console.error(`[${version}] Failed: ${result.error} — ${extDir}`);
    }
  }

  process.exit(anySuccess ? 0 : 1);
}

// Export for use as module (by the companion extension and tests)
module.exports = {
  findExtensionDirs,
  extractHashSuffix,
  extractClassMap,
  generateRtlCss,
  applyPatch,
  revertPatch,
  checkPatch,
  removePatchContent,
  PATCH_START,
  PATCH_END,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
