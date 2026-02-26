/**
 * Babysitter process definition for Claude Code RTL Fix.
 *
 * This process orchestrates:
 * 1. Running unit tests
 * 2. Applying the RTL patch
 * 3. Verifying the patch
 */

const { execSync } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

function createProcess() {
  return {
    id: "rtl-fix",
    name: "Claude Code RTL Fix",
    description:
      "Apply and verify RTL text alignment fix for Claude Code VS Code extension",

    steps: [
      {
        id: "unit-tests",
        kind: "shell",
        name: "Run unit tests",
        command: `node ${path.join(PROJECT_ROOT, "test", "patch-rtl.test.js")}`,
      },
      {
        id: "apply-patch",
        kind: "shell",
        name: "Apply RTL patch to Claude Code",
        command: `node ${path.join(PROJECT_ROOT, "src", "patch-rtl.js")}`,
        dependsOn: ["unit-tests"],
      },
      {
        id: "verify-patch",
        kind: "shell",
        name: "Verify RTL patch is applied",
        command: `node ${path.join(PROJECT_ROOT, "src", "patch-rtl.js")} --check`,
        dependsOn: ["apply-patch"],
      },
    ],
  };
}

module.exports = { createProcess };
