// After packaging on macOS: an ad-hoc signature (no Apple account; what an Apple Silicon Mac
// needs to run the app at all). Players open it once with "Open Anyway" in Privacy & Security.
'use strict';
const { execSync } = require('child_process');
const path = require('path');

exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
};
