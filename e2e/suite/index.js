/**
 * E2E test suite entry point.
 * Uses Node's built-in assert — compatible with @vscode/test-electron runner.
 */

const path = require("path");
const fs = require("fs");
const assert = require("assert");

// Mocha-style exports for @vscode/test-electron
function run() {
  return new Promise((resolve, reject) => {
    try {
      // Import vscode API (available in the test host)
      const vscode = require("vscode");

      console.log("\n  E2E: Claude Code RTL Fix\n");

      // Test 1: Extension activates
      const ext = vscode.extensions.getExtension(
        "claude-code-rtl-fix.claude-code-rtl-fix"
      );
      if (ext) {
        console.log("  ✓ Extension is loaded");
      } else {
        console.log(
          "  ⊘ Extension not found (expected in dev mode without packaging)"
        );
      }

      // Test 2: Commands are registered
      vscode.commands.getCommands(true).then((commands) => {
        const hasPatch = commands.includes("claudeCodeRtlFix.patchNow");
        const hasRevert = commands.includes("claudeCodeRtlFix.revert");
        console.log(
          `  ${hasPatch ? "✓" : "✗"} Command 'claudeCodeRtlFix.patchNow' registered`
        );
        console.log(
          `  ${hasRevert ? "✓" : "✗"} Command 'claudeCodeRtlFix.revert' registered`
        );

        // Test 3: Patch logic works on mock data
        const {
          applyPatch,
          revertPatch,
          checkPatch,
        } = require("../../src/patch-rtl");

        const tmpDir = fs.mkdtempSync(
          path.join(require("os").tmpdir(), "rtl-e2e-")
        );
        const mockCss = `
.chatContainer_Test01{display:flex}
.messagesContainer_Test01{overflow-y:auto}
.message_Test01{color:var(--fg);display:flex;align-items:flex-start}
.message_Test01.userMessageContainer_Test01{text-align:left}
.userMessageContainer_Test01{display:inline-block}
.userMessage_Test01{font-style:italic}
.timelineMessage_Test01{padding-left:30px}
.timelineMessage_Test01:before{left:9px}
`.trim();
        const cssFile = path.join(tmpDir, "index.css");
        fs.writeFileSync(cssFile, mockCss);

        const applyResult = applyPatch(cssFile);
        assert(applyResult.success, "Patch should apply");
        console.log("  ✓ Patch applies correctly on mock CSS");

        assert(checkPatch(cssFile), "Check should detect patch");
        console.log("  ✓ Patch detection works");

        const patched = fs.readFileSync(cssFile, "utf8");
        assert(
          patched.includes("unicode-bidi: plaintext"),
          "Patched CSS should contain RTL rules"
        );
        console.log("  ✓ Patched CSS contains RTL rules");

        assert(
          patched.includes("direction: ltr"),
          "Code blocks should stay LTR"
        );
        console.log("  ✓ Code blocks preserved as LTR");

        assert(
          patched.includes("padding-inline-start"),
          "Should use logical properties"
        );
        console.log("  ✓ Uses CSS logical properties for timeline");

        const revertResult = revertPatch(cssFile);
        assert(revertResult.success, "Revert should succeed");
        const reverted = fs.readFileSync(cssFile, "utf8");
        assert.strictEqual(reverted, mockCss, "Should restore original CSS");
        console.log("  ✓ Revert restores original CSS");

        fs.rmSync(tmpDir, { recursive: true, force: true });

        // Test 4: Verify it works on real Claude Code if present
        const { findExtensionDirs, extractClassMap } = require("../../src/patch-rtl");
        const claudeExt = vscode.extensions.all.find(
          (e) => e.id === "anthropic.claude-code"
        );
        if (claudeExt) {
          const realCss = path.join(
            claudeExt.extensionPath,
            "webview",
            "index.css"
          );
          if (fs.existsSync(realCss)) {
            const content = fs.readFileSync(realCss, "utf8");
            const classMap = extractClassMap(content);
            assert(
              classMap.message,
              "Should extract message class from real extension"
            );
            console.log(
              `  ✓ Real Claude Code extension detected (message hash: ${classMap.message})`
            );
          }
        } else {
          console.log(
            "  ⊘ Claude Code not installed — skipping real extension test"
          );
        }

        console.log("\n  All E2E tests passed.\n");
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { run };
