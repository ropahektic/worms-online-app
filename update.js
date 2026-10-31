// The app updates itself from the site (user 2026-10-31: no redownloading for every shell change).
// The site's app/ folder holds the installers and what describes them; the app checks at start and
// every few hours, downloads a newer build in the background and installs it when the player
// closes the app (never in the middle of a game). The Game menu's "Restart to update" installs it
// at once.
//
// - Windows (NSIS) and Linux (.AppImage): electron-updater from app/latest.yml / latest-linux.yml,
//   which electron-builder writes beside the installers.
// - macOS: the app isn't signed with an Apple certificate, and the Mac updater (Squirrel.Mac)
//   only installs signed builds, so the app does it itself: app/latest.json's mac.zip is unzipped
//   with ditto and swapped in for the running .app once it has quit. Where the .app can't be
//   replaced (started from the .dmg, or macOS runs it from a read-only copy because it was never
//   moved out of Downloads) the player gets the download page instead.
'use strict';
const { app, dialog, net, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const FEED = 'https://wormsonline.net/app/';
const EVERY_MS = 4 * 3600 * 1000;

let ready = null;        // the version downloaded and waiting to be installed
let onReady = () => {};  // the menu's "Restart to update" switches on
let installMac = null;   // (macOS) swaps the new .app in after the app has quit

const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// ---------- Windows, Linux ----------
function startBuilder() {
  if (process.platform === 'linux' && !process.env.APPIMAGE) return; // (only the AppImage can update)
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = null;
  autoUpdater.setFeedURL({ provider: 'generic', url: FEED });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => { ready = info.version; onReady(ready); });
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, EVERY_MS);
  return () => autoUpdater.quitAndInstall(true, true);
}

// ---------- macOS ----------
// the running .app: <bundle>/Contents/MacOS/<exe>
const bundle = () => path.resolve(app.getPath('exe'), '..', '..', '..');

function replaceable(dir) {
  if (!dir.endsWith('.app') || dir.startsWith('/Volumes/') || dir.includes('/AppTranslocation/')) return false;
  try { fs.accessSync(path.dirname(dir), fs.constants.W_OK); fs.accessSync(dir, fs.constants.W_OK); return true; } catch (_) { return false; }
}

async function checkMac() {
  if (ready) return;
  let feed;
  try { feed = await (await net.fetch(FEED + 'latest.json', { cache: 'no-store' })).json(); } catch (_) { return; }
  if (!feed || !newer(feed.version, app.getVersion()) || !feed.mac) return;
  const here = bundle();
  if (!feed.mac.zip || !replaceable(here)) return offerDownload(feed.version);
  const dir = path.join(app.getPath('temp'), 'worms-online-update');
  const zip = path.join(dir, 'update.zip');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const r = await net.fetch(FEED + feed.mac.zip, { cache: 'no-store' });
    if (!r.ok) return;
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    await new Promise((ok, fail) => execFile('/usr/bin/ditto', ['-x', '-k', zip, dir], (e) => (e ? fail(e) : ok())));
  } catch (_) { return; }
  const fresh = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
  if (!fresh) return;
  const src = path.join(dir, fresh);
  // after the app's process is gone: the old .app out, the new one in, macOS's download flag off
  // (so it opens without "Open Anyway" again), and with `relaunch` the app started again
  installMac = (relaunch) => {
    const sh = [
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done`,
      `rm -rf "${here}" && mv "${src}" "${here}" && xattr -cr "${here}"`,
      relaunch ? `open "${here}"` : ':',
      `rm -rf "${dir}"`,
    ].join('; ');
    spawn('/bin/sh', ['-c', sh], { detached: true, stdio: 'ignore' }).unref();
  };
  ready = feed.version;
  onReady(ready);
}

let offered = false;
function offerDownload(version) {
  if (offered) return;
  offered = true;
  dialog.showMessageBox({
    type: 'info', buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1,
    message: `Worms Online ${version} is out`,
    detail: 'This copy can\'t update itself (it runs from the disk image or from Downloads). Download the new version and drag it to Applications; after that it updates on its own.',
  }).then(({ response }) => { if (response === 0) shell.openExternal('https://wormsonline.net/#download'); });
}

function startMac() {
  checkMac();
  setInterval(checkMac, EVERY_MS);
  app.on('will-quit', () => { if (installMac) { installMac(false); installMac = null; } });
  return () => { if (installMac) { installMac(true); installMac = null; } app.quit(); };
}

// ---------- ----------
// start(cb): cb(version) once an update is ready; returns installNow()
exports.start = (cb) => {
  if (!app.isPackaged) return () => {};
  onReady = cb;
  return process.platform === 'darwin' ? startMac() : (startBuilder() || (() => {}));
};
