#!/usr/bin/env node
/**
 * Unit tests for the RTL patch logic (fix-rtl.js).
 * Uses Node's built-in assert module — no external test runner needed.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { MARKER, buildCss, stripPatch } = require("../fix-rtl");

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
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.error(`  \u2717 ${name}`);
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

// --- buildCss ---

test("buildCss: extracts hash and generates correct selectors", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(css.includes(".message_Abc123"), "Should use discovered hash");
  assert(css.includes(".userMessage_Abc123"), "Should find userMessage hash");
  assert(css.includes(".timelineMessage_Abc123"), "Should find timelineMessage hash");
});

test("buildCss: includes unicode-bidi and text-align rules", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(css.includes("unicode-bidi: plaintext"), "Should use unicode-bidi: plaintext");
  assert(css.includes("text-align: start"), "Should use text-align: start");
});

test("buildCss: aligns markdown headings (bidi does not inherit to block children)", () => {
  const css = buildCss(SAMPLE_CSS);
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]) {
    assert(
      css.includes(`[data-testid="assistant-message"] ${tag}`),
      `Should target ${tag} directly in the message body`
    );
  }
});

test("buildCss: keeps code blocks LTR", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(css.includes("direction: ltr"), "Code should stay LTR");
  assert(css.includes("pre"), "Should target pre elements");
  assert(css.includes("code"), "Should target code elements");
});

test("buildCss: targets assistant-message testid", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(css.includes('data-testid="assistant-message"'), "Should target assistant message");
});

test("buildCss: falls back to attribute selectors for missing classes", () => {
  const minimalCss = `.message_XYZ999{color:red}`;
  const css = buildCss(minimalCss);
  assert(css.includes(".message_XYZ999"), "Should use known class");
  assert(css.includes('[class*="userMessage_"]'), "Should fallback for missing class");
});

test("buildCss: wraps output in markers", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(css.startsWith(MARKER), "Should start with marker");
  assert(css.endsWith(MARKER), "Should end with marker");
});

test("buildCss: handles different hashes per class", () => {
  const css = `.message_AAA111{color:red}.userMessage_BBB222{color:blue}`;
  const result = buildCss(css);
  assert(result.includes(".message_AAA111"), "Should use message hash");
  assert(result.includes(".userMessage_BBB222"), "Should use userMessage hash");
});

// --- Bug fix: correct .message_ hash when several modules share the name ---

test("buildCss: anchors .message_ on the chat module, not the first match", () => {
  // `.message_` appears first in unrelated modules; the chat module is the one
  // that also defines userMessageContainer with the same hash.
  const css = [
    ".message_STATUS1{opacity:0.6;font-style:italic}", // status text — comes first
    ".message_EMPTY2{text-align:center}", // empty-state
    ".message_CHAT99{display:flex;flex-direction:column}",
    ".userMessageContainer_CHAT99{display:inline-block}",
    ".message_CHAT99.userMessageContainer_CHAT99{text-align:left}",
  ].join("");
  const result = buildCss(css);
  assert(result.includes(".message_CHAT99"), "Should target the chat-module hash");
  assert(!result.includes(".message_STATUS1"), "Should NOT target the status-text hash");
  // The user-message override must match the real DOM to beat the (0,2,0) rule.
  assert(
    result.includes(".message_CHAT99.userMessageContainer_CHAT99"),
    "Should emit the two-class override against the correct hash"
  );
});

// --- Level 2: UI chrome outside the message body ---

test("buildCss: aligns UI chrome (menus, session list, links) to start", () => {
  const css = buildCss(SAMPLE_CSS);
  for (const name of ["menuItem", "sessionItem", "nullStateLink", "optionButton", "titleText"]) {
    assert(css.includes(`[class*="${name}_"]`), `Should target ${name}`);
  }
});

test("buildCss: UI chrome rule uses plaintext + start (not bare left→start)", () => {
  const css = buildCss(SAMPLE_CSS);
  // The UI-chrome block must pair plaintext with start; start alone is a no-op
  // while the element direction stays ltr.
  const uiRule = css.match(/\[class\*="sessionItem_"\][^{]*\{[^}]*\}/);
  assert(uiRule, "Should have a sessionItem rule");
  assert(uiRule[0].includes("unicode-bidi: plaintext"), "UI chrome needs plaintext");
  assert(uiRule[0].includes("text-align: start"), "UI chrome needs start");
});

// --- Mirror-based composer: both layers must share the bidi rule ---

test("buildCss: targets BOTH the contenteditable and its mention mirror", () => {
  const css = buildCss(SAMPLE_CSS);
  // The composer paints visible text in .mentionMirror_ over a transparent
  // .messageInput_; treating only one layer desyncs caret from glyphs.
  const inputRule = css.match(/\[class\*="messageInput_"\][^{]*\{[^}]*\}/);
  assert(inputRule, "Should have a messageInput rule");
  assert(inputRule[0].includes('mentionMirror_'), "Must also target the mirror layer");
  assert(inputRule[0].includes("unicode-bidi: plaintext"), "Composer needs plaintext (per-line direction)");
});

// --- Bug fix: no span selector (reversed bold text) ---

test("buildCss: does NOT apply unicode-bidi to span elements", () => {
  const css = buildCss(SAMPLE_CSS);
  // Split into individual selectors to check for span
  const lines = css.split("\n");
  const bidiLines = lines.filter((l) => l.includes("unicode-bidi: plaintext"));
  for (const line of bidiLines) {
    // The selectors that apply plaintext should not include span
    assert(!line.match(/\bspan\b/), `Should not apply unicode-bidi to span: ${line}`);
  }
  // But should still apply to p, li, div
  const blockRule = css.match(/\.message_\w+ p,.*\{[^}]*unicode-bidi: plaintext/s);
  assert(blockRule, "Should apply unicode-bidi to block elements");
});

test("buildCss: span elements inherit bidi from parent (no explicit rule)", () => {
  const css = buildCss(SAMPLE_CSS);
  // Ensure no selector targets span with unicode-bidi
  const selectorBlocks = css.split(/\{/);
  for (const sel of selectorBlocks) {
    if (sel.includes("span")) {
      // This selector block should NOT be followed by unicode-bidi: plaintext
      // (it should only appear in code block rules with unicode-bidi: normal)
      const ruleStart = css.indexOf(sel + "{");
      if (ruleStart === -1) continue;
      const ruleEnd = css.indexOf("}", ruleStart);
      const rule = css.substring(ruleStart, ruleEnd + 1);
      assert(
        !rule.includes("unicode-bidi: plaintext"),
        `Span rule should not have unicode-bidi: plaintext: ${rule}`
      );
    }
  }
});

// --- Bug fix: no timeline position overrides (dots overlapping content) ---

test("buildCss: does NOT override timeline padding-left", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(!css.includes("padding-inline-start"), "Should not override timeline padding");
  assert(!css.includes("padding-left: unset"), "Should not unset padding-left");
});

test("buildCss: does NOT override timeline dot position (left/inset-inline-start)", () => {
  const css = buildCss(SAMPLE_CSS);
  assert(!css.includes("inset-inline-start"), "Should not override dot position");
  assert(!css.includes("left: unset"), "Should not unset left position");
});

test("buildCss: preserves original timeline padding-left in source CSS", () => {
  // The patch should NOT touch the timeline element's padding-left
  const patched = SAMPLE_CSS + "\n" + buildCss(SAMPLE_CSS);
  // Original padding-left:30px should still be the only padding rule
  const paddingLeftMatches = patched.match(/padding-left:30px/g);
  assert(paddingLeftMatches, "Original padding-left should remain");
  assert.strictEqual(paddingLeftMatches.length, 1, "Should be exactly one padding-left rule");
});

// --- stripPatch ---

test("stripPatch: removes patch section between markers", () => {
  const original = "body{color:red}";
  const patched = original + "\n" + MARKER + "\n.rtl{}\n" + MARKER;
  assert.strictEqual(stripPatch(patched), original);
});

test("stripPatch: is no-op when no markers", () => {
  const css = "body{color:red}";
  assert.strictEqual(stripPatch(css), css);
});

test("stripPatch: handles single marker gracefully", () => {
  const css = "body{color:red}\n" + MARKER;
  const result = stripPatch(css);
  assert(!result.includes(MARKER), "Should remove single marker");
});

// --- Patch + strip roundtrip ---

test("roundtrip: patch then strip restores original", () => {
  const patched = SAMPLE_CSS + "\n" + buildCss(SAMPLE_CSS);
  const stripped = stripPatch(patched);
  assert.strictEqual(stripped, SAMPLE_CSS, "Strip should restore original");
});

test("idempotent: applying patch twice produces same result as once", () => {
  const once = SAMPLE_CSS + "\n" + buildCss(SAMPLE_CSS);
  const twice = stripPatch(once) + "\n" + buildCss(stripPatch(once));
  assert.strictEqual(once, twice, "Double patch should equal single patch");
});

// --- File operations ---

test("file: apply and check via file operations", () => {
  const dir = path.join(tmpDir, "anthropic.claude-code-test", "webview");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "index.css");
  fs.writeFileSync(file, SAMPLE_CSS);

  // Apply
  const css = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, css + "\n" + buildCss(css));

  // Check
  const patched = fs.readFileSync(file, "utf8");
  assert(patched.includes(MARKER), "Should contain marker");
  assert(patched.includes("unicode-bidi: plaintext"), "Should contain RTL rules");

  // Revert
  fs.writeFileSync(file, stripPatch(patched));
  const reverted = fs.readFileSync(file, "utf8");
  assert(!reverted.includes(MARKER), "Should not contain marker after revert");
  assert.strictEqual(reverted, SAMPLE_CSS, "Should match original after revert");
});

test("file: backup and restore", () => {
  const dir = path.join(tmpDir, "anthropic.claude-code-test", "webview");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "index.css");
  const bak = file + ".bak";
  fs.writeFileSync(file, SAMPLE_CSS);

  // Save backup, apply patch
  fs.writeFileSync(bak, SAMPLE_CSS);
  fs.writeFileSync(file, SAMPLE_CSS + "\n" + buildCss(SAMPLE_CSS));

  // Restore from backup
  fs.copyFileSync(bak, file);
  fs.unlinkSync(bak);
  assert.strictEqual(fs.readFileSync(file, "utf8"), SAMPLE_CSS);
  assert(!fs.existsSync(bak));
});

// --- Integration: real extension CSS ---

test("integration: patch works on actual Claude Code CSS if available", () => {
  const { findExtensions } = require("../fix-rtl");
  const exts = findExtensions();
  if (exts.length === 0) {
    console.log("    (skipped — Claude Code extension not installed)");
    return;
  }
  const cssFile = path.join(exts[0], "webview", "index.css");
  if (!fs.existsSync(cssFile)) {
    console.log("    (skipped — CSS file not found)");
    return;
  }

  const realCss = stripPatch(fs.readFileSync(cssFile, "utf8"));
  const generated = buildCss(realCss);
  assert(generated.includes("unicode-bidi: plaintext"), "Should generate RTL CSS");
  assert(!generated.match(/\bspan\b.*unicode-bidi: plaintext/), "Should not target span with plaintext");
  assert(!generated.includes("padding-inline-start"), "Should not override timeline padding");
});

// --- Summary ---
console.log(`\n  ${passed} passing, ${failed} failing\n`);
process.exit(failed > 0 ? 1 : 0);
