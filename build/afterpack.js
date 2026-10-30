// On macOS, an ad-hoc signature (no Apple account; what an Apple Silicon Mac needs to run the app
// at all). Players open it once with "Open Anyway" in Privacy & Security. Run as afterPack and as
// afterSign: a universal build packs an Intel and an Apple Silicon app and merges them, and those
// two must stay untouched (the merge wants them identical but for the binaries): only the merged
// app (or a single-arch one) is signed
'use strict';
const { execSync } = require('child_process');
const path = require('path');

// electron-builder's Arch: x64 1, arm64 3, universal 4
const UNIVERSAL = 4;

exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const mac = ctx.packager.config.mac || {};
  const archs = (mac.target || []).flatMap((t) => t.arch || []);
  if (archs.includes('universal') && ctx.arch !== UNIVERSAL) return;
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
};
