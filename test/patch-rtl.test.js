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

// --- Bug: headings (h1-h6) missing from bidi selectors ---

test("buildCss: includes heading elements h1-h6 in unicode-bidi selectors", () => {
  const css = buildCss(SAMPLE_CSS);
  const headings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  // Find all rule blocks that contain unicode-bidi: plaintext
  const ruleBlocks = css.split(/\}/).map((block) => block + "}");
  const bidiBlocks = ruleBlocks.filter((b) => b.includes("unicode-bidi: plaintext"));
  // At least one bidi block should contain selectors for each heading level
  for (const tag of headings) {
    const found = bidiBlocks.some((block) => {
      // Match the tag as a descendant selector (e.g., ".message_Abc123 h1" or '[data-testid="assistant-message"] h1')
      const pattern = new RegExp(`\\b${tag}\\b`);
      return pattern.test(block);
    });
    assert(found, `Should include ${tag} in unicode-bidi: plaintext selectors`);
  }
});

// --- Bug: user messages always left-aligned (align-items: flex-start) ---

test("buildCss: overrides message container align-items for full-width children", () => {
  const css = buildCss(SAMPLE_CSS);
  // The message container has align-items: flex-start which keeps children narrow and left-positioned.
  // The patch should override this to allow children to stretch full-width so text-align: start works.
  assert(css.includes("align-items"), "Should include align-items override for message container");
  // Specifically, it should use align-items: stretch (or similar) on the message container
  const ruleBlocks = css.split(/\}/).map((block) => block + "}");
  const alignBlock = ruleBlocks.find((b) => b.includes("align-items"));
  assert(alignBlock, "Should have a rule block with align-items");
  assert(
    alignBlock.includes(".message_Abc123"),
    "align-items rule should target the message container"
  );
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
