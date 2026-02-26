const vscode = require("vscode");
const path = require("path");
const {
  findExtensionDirs,
  applyPatch,
  revertPatch,
  checkPatch,
} = require("./patch-rtl");

/**
 * Finds the Claude Code extension's CSS file path from inside VS Code,
 * using the VS Code extensions API for a more reliable discovery.
 */
function findCssFilesViaApi() {
  const claudeExt = vscode.extensions.all.find(
    (ext) => ext.id === "anthropic.claude-code"
  );
  if (claudeExt) {
    const cssPath = path.join(
      claudeExt.extensionPath,
      "webview",
      "index.css"
    );
    return [{ cssPath, extDir: claudeExt.extensionPath }];
  }
  // Fallback to filesystem discovery
  return findExtensionDirs().map((dir) => ({
    cssPath: path.join(dir, "webview", "index.css"),
    extDir: dir,
  }));
}

function activate(context) {
  // Auto-patch on activation
  try {
    const targets = findCssFilesViaApi();
    for (const { cssPath, extDir } of targets) {
      if (!checkPatch(cssPath)) {
        const result = applyPatch(cssPath);
        if (result.success) {
          vscode.window
            .showInformationMessage(
              "Claude Code RTL Fix: Patch applied. Reload window to see changes.",
              "Reload Now"
            )
            .then((choice) => {
              if (choice === "Reload Now") {
                vscode.commands.executeCommand("workbench.action.reloadWindow");
              }
            });
        }
      }
    }
  } catch (err) {
    console.error("Claude Code RTL Fix: auto-patch failed:", err.message);
  }

  // Watch for extension updates — re-patch when the Claude Code extension changes
  const watcher = vscode.extensions.onDidChange(() => {
    try {
      const targets = findCssFilesViaApi();
      for (const { cssPath } of targets) {
        if (!checkPatch(cssPath)) {
          const result = applyPatch(cssPath);
          if (result.success) {
            vscode.window
              .showInformationMessage(
                "Claude Code RTL Fix: Re-applied after extension update. Reload window.",
                "Reload Now"
              )
              .then((choice) => {
                if (choice === "Reload Now") {
                  vscode.commands.executeCommand(
                    "workbench.action.reloadWindow"
                  );
                }
              });
          }
        }
      }
    } catch (err) {
      console.error("Claude Code RTL Fix: re-patch failed:", err.message);
    }
  });
  context.subscriptions.push(watcher);

  // Manual patch command
  const patchCmd = vscode.commands.registerCommand(
    "claudeCodeRtlFix.patchNow",
    () => {
      const targets = findCssFilesViaApi();
      if (targets.length === 0) {
        vscode.window.showErrorMessage(
          "Claude Code extension not found. Install it first."
        );
        return;
      }
      let patched = 0;
      for (const { cssPath } of targets) {
        const result = applyPatch(cssPath);
        if (result.success) patched++;
      }
      if (patched > 0) {
        vscode.window
          .showInformationMessage(
            `Claude Code RTL Fix: Patched ${patched} installation(s). Reload window.`,
            "Reload Now"
          )
          .then((choice) => {
            if (choice === "Reload Now") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
          });
      } else {
        vscode.window.showWarningMessage(
          "Claude Code RTL Fix: Patch could not be applied."
        );
      }
    }
  );

  // Revert command
  const revertCmd = vscode.commands.registerCommand(
    "claudeCodeRtlFix.revert",
    () => {
      const targets = findCssFilesViaApi();
      let reverted = 0;
      for (const { cssPath } of targets) {
        const result = revertPatch(cssPath);
        if (result.success) reverted++;
      }
      if (reverted > 0) {
        vscode.window
          .showInformationMessage(
            `Claude Code RTL Fix: Reverted ${reverted} installation(s). Reload window.`,
            "Reload Now"
          )
          .then((choice) => {
            if (choice === "Reload Now") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
          });
      } else {
        vscode.window.showWarningMessage(
          "Claude Code RTL Fix: No patch found to revert."
        );
      }
    }
  );

  context.subscriptions.push(patchCmd, revertCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
