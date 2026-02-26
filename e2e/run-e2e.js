#!/usr/bin/env node
/**
 * E2E test runner for the Claude Code RTL Fix VS Code extension.
 *
 * Uses @vscode/test-electron to launch a real VS Code instance with
 * the extension loaded and verify the patch is applied correctly.
 */

const path = require("path");

async function main() {
  // Dynamic import to handle the case where the package isn't installed yet
  let runTests;
  try {
    ({ runTests } = require("@vscode/test-electron"));
  } catch {
    console.error(
      "Missing @vscode/test-electron. Run: npm install"
    );
    process.exit(1);
  }

  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--disable-extensions", // disable other extensions to isolate
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  } catch (err) {
    console.error("E2E tests failed:", err);
    process.exit(1);
  }
}

main();
