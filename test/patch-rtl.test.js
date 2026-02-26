#!/usr/bin/env node
/**
 * Unit tests for the RTL patch logic.
 * Uses Node's built-in assert module — no external test runner needed.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  extractHashSuffix,
  extractClassMap,
  generateRtlCss,
  applyPatch,
  revertPatch,
  checkPatch,
  removePatchContent,
  PATCH_START,
  PATCH_END,
} = require("../src/patch-rtl");

let tmpDir;
let passed = 0;
let failed = 0;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtl-test-"));
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function test(name, fn) {
  try {
    setup();
    fn();
    teardown();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// --- Sample CSS that mimics the Claude Code extension structure ---
const SAMPLE_CSS = `
.chatContainer_Abc123{display:flex;overflow:hidden}
.messagesContainer_Abc123{overflow-y:auto;display:flex;flex-direction:column}
.message_Abc123{color:var(--app-primary-foreground);display:flex;flex-direction:column;align-items:flex-start;padding:8px 0}
.message_Abc123.userMessageContainer_Abc123{text-align:left;position:relative;align-items:flex-start;margin-left:0}
.userMessageContainer_Abc123{display:inline-block;position:relative;margin:4px 0}
.userMessage_Abc123{color:var(--app-secondary-foreground);width:100%;font-style:italic}
.timelineMessage_Abc123{user-select:text;align-items:flex-start;padding-left:30px}
.timelineMessage_Abc123:before{content:"";position:absolute;left:9px}
.slashCommandMessage_Abc123{font-weight:bold}
.slashCommandResultMessage_Abc123{opacity:0.8}
.interruptedMessage_Abc123{border-top:1px dashed}
.progressContent_Abc123{display:flex}
.highlightedMessage_Abc123{opacity:1}
`.trim();

console.log("\nRunning patch-rtl unit tests...\n");

// --- extractHashSuffix ---

test("extractHashSuffix: finds hash from message class", () => {
  const hash = extractHashSuffix(SAMPLE_CSS);
  assert.strictEqual(hash, "Abc123");
});

test("extractHashSuffix: finds hash from chatContainer fallback", () => {
  const css = `.chatContainer_XyZ789{display:flex}`;
  const hash = extractHashSuffix(css);
  assert.strictEqual(hash, "XyZ789");
});

test("extractHashSuffix: returns null for unrecognized CSS", () => {
  const hash = extractHashSuffix(".foo{color:red}");
  assert.strictEqual(hash, null);
});

// --- extractClassMap ---

test("extractClassMap: extracts all known classes", () => {
  const map = extractClassMap(SAMPLE_CSS);
  assert.strictEqual(map.message, "Abc123");
  assert.strictEqual(map.messagesContainer, "Abc123");
  assert.strictEqual(map.chatContainer, "Abc123");
  assert.strictEqual(map.userMessageContainer, "Abc123");
  assert.strictEqual(map.userMessage, "Abc123");
  assert.strictEqual(map.timelineMessage, "Abc123");
  assert.strictEqual(map.slashCommandMessage, "Abc123");
  assert.strictEqual(map.slashCommandResultMessage, "Abc123");
  assert.strictEqual(map.interruptedMessage, "Abc123");
  assert.strictEqual(map.progressContent, "Abc123");
});

test("extractClassMap: handles different hashes for different modules", () => {
  const css = `.message_AAA111{color:red}.userMessage_BBB222{color:blue}`;
  const map = extractClassMap(css);
  assert.strictEqual(map.message, "AAA111");
  assert.strictEqual(map.userMessage, "BBB222");
});

// --- generateRtlCss ---

test("generateRtlCss: generates valid CSS with correct class names", () => {
  const classMap = extractClassMap(SAMPLE_CSS);
  const css = generateRtlCss(classMap);

  assert(css.includes(PATCH_START), "Should start with patch marker");
  assert(css.includes(PATCH_END), "Should end with patch marker");
  assert(css.includes("unicode-bidi: plaintext"), "Should use unicode-bidi: plaintext");
  assert(css.includes("text-align: start"), "Should use text-align: start");
  assert(css.includes(".message_Abc123"), "Should reference correct message class");
  assert(css.includes(".userMessage_Abc123"), "Should reference correct userMessage class");
  assert(css.includes("direction: ltr"), "Should keep code blocks LTR");
  assert(css.includes('data-testid="assistant-message"'), "Should target assistant message testid");
  assert(css.includes("padding-inline-start"), "Should use logical properties for timeline");
});

test("generateRtlCss: falls back to attribute selectors for missing classes", () => {
  const partialMap = { message: "XYZ999" };
  const css = generateRtlCss(partialMap);

  assert(css.includes(".message_XYZ999"), "Should use known class");
  assert(css.includes('[class*="userMessage_"]'), "Should use attribute selector fallback");
});

// --- applyPatch ---

test("applyPatch: patches a CSS file successfully", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);

  const result = applyPatch(cssFile);
  assert(result.success, "Patch should succeed");
  assert(result.classMap.message === "Abc123", "Should find correct hash");
  assert(fs.existsSync(cssFile + ".rtl-backup"), "Should create backup");

  const patched = fs.readFileSync(cssFile, "utf8");
  assert(patched.includes(PATCH_START), "Patched file should contain start marker");
  assert(patched.includes(PATCH_END), "Patched file should contain end marker");
  assert(patched.includes("unicode-bidi: plaintext"), "Should include RTL CSS");
});

test("applyPatch: is idempotent (re-applying replaces existing patch)", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);

  applyPatch(cssFile);
  const firstPatch = fs.readFileSync(cssFile, "utf8");
  const firstCount = (firstPatch.match(/CLAUDE-CODE-RTL-FIX:START/g) || []).length;

  applyPatch(cssFile);
  const secondPatch = fs.readFileSync(cssFile, "utf8");
  const secondCount = (secondPatch.match(/CLAUDE-CODE-RTL-FIX:START/g) || []).length;

  assert.strictEqual(firstCount, 1, "First patch should have one marker");
  assert.strictEqual(secondCount, 1, "Second patch should still have only one marker");
});

test("applyPatch: returns error for missing file", () => {
  const result = applyPatch("/nonexistent/path/index.css");
  assert(!result.success, "Should fail for missing file");
  assert(result.error.includes("not found"), "Error should mention not found");
});

test("applyPatch: returns error for unrecognized CSS", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, ".foo{color:red}");

  const result = applyPatch(cssFile);
  assert(!result.success, "Should fail for unrecognized CSS");
});

// --- revertPatch ---

test("revertPatch: restores from backup", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);

  applyPatch(cssFile);
  assert(checkPatch(cssFile), "Should be patched");

  const result = revertPatch(cssFile);
  assert(result.success, "Revert should succeed");
  assert.strictEqual(result.method, "backup", "Should restore from backup");
  assert(!fs.existsSync(cssFile + ".rtl-backup"), "Backup should be removed");

  const restored = fs.readFileSync(cssFile, "utf8");
  assert(!restored.includes(PATCH_START), "Restored file should not contain patch");
  assert.strictEqual(restored, SAMPLE_CSS, "Restored content should match original");
});

test("revertPatch: strips markers when no backup exists", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);

  applyPatch(cssFile);
  // Remove the backup to simulate missing backup
  fs.unlinkSync(cssFile + ".rtl-backup");

  const result = revertPatch(cssFile);
  assert(result.success, "Revert should succeed by stripping");
  assert.strictEqual(result.method, "strip", "Should use strip method");

  const restored = fs.readFileSync(cssFile, "utf8");
  assert(!restored.includes(PATCH_START), "Should not contain patch markers");
});

test("revertPatch: returns error when nothing to revert", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);

  const result = revertPatch(cssFile);
  assert(!result.success, "Should fail when nothing to revert");
});

// --- checkPatch ---

test("checkPatch: returns false for unpatched file", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);
  assert(!checkPatch(cssFile), "Should not be patched");
});

test("checkPatch: returns true for patched file", () => {
  const cssFile = path.join(tmpDir, "index.css");
  fs.writeFileSync(cssFile, SAMPLE_CSS);
  applyPatch(cssFile);
  assert(checkPatch(cssFile), "Should be patched");
});

test("checkPatch: returns false for nonexistent file", () => {
  assert(!checkPatch("/nonexistent/file.css"), "Should return false");
});

// --- removePatchContent ---

test("removePatchContent: removes patch section cleanly", () => {
  const original = "body{color:red}";
  const patched = original + "\n" + PATCH_START + "\n.rtl{}" + "\n" + PATCH_END;
  const result = removePatchContent(patched);
  assert.strictEqual(result, original, "Should restore original content");
});

test("removePatchContent: is no-op when no patch markers", () => {
  const css = "body{color:red}";
  assert.strictEqual(removePatchContent(css), css, "Should return input unchanged");
});

// --- Integration: patch works on real extension CSS ---

test("integration: patch works on actual Claude Code CSS if available", () => {
  const extDirs = require("../src/patch-rtl").findExtensionDirs();
  if (extDirs.length === 0) {
    console.log("    (skipped — Claude Code extension not installed)");
    return;
  }
  const cssFile = path.join(extDirs[0], "webview", "index.css");
  if (!fs.existsSync(cssFile)) {
    console.log("    (skipped — CSS file not found)");
    return;
  }

  // Read the real CSS and test class extraction
  const realCss = fs.readFileSync(cssFile, "utf8");
  const classMap = extractClassMap(realCss);
  assert(classMap.message, "Should find message class in real CSS");
  assert(classMap.userMessage, "Should find userMessage class in real CSS");
  assert(classMap.timelineMessage, "Should find timelineMessage class in real CSS");

  // Generate CSS and verify it's valid
  const rtlCss = generateRtlCss(classMap);
  assert(rtlCss.includes(`.message_${classMap.message}`), "Should reference real hash");
});

// --- Summary ---
console.log(`\n  ${passed} passing, ${failed} failing\n`);
process.exit(failed > 0 ? 1 : 0);
