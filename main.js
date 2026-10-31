// Worms Online as a desktop app (user 2026-10-30): a thin shell round the live site, so every
// player runs the same Chromium with the browser limits off. The page is wormsonline.net's as
// deployed: a site deploy reaches the app at once; the app only changes when this shell does.
//
// What the shell fixes that a browser won't let a page change:
// - no throttling of an unfocused or covered window (the game's worker ticks on timers and
//   draws on requestAnimationFrame: a browser slows both when the tab isn't in front);
// - the GPU used even where Chromium's blocklist would fall back to software drawing;
// - the system not suspending the app (macOS App Nap, power saving) while it runs;
// - real fullscreen on F11, and keys a browser keeps for itself.
'use strict';
const { app, BrowserWindow, Menu, powerSaveBlocker, shell, session } = require('electron');
const path = require('path');

const SITE = process.env.WORMS_ONLINE_URL || 'https://wormsonline.net/';
// pages that stay in the app's window: the site (old and new address), and the sign-in providers
// it sends players to, so Google / Discord sign-in happens in the app and lands back in it
const INSIDE = ['wormsonline.net', 'ropersheaven.com', 'accounts.google.com', 'accounts.youtube.com', 'discord.com', 'discordapp.com'];

// before `ready`: Chromium's own switches
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// (one copy of the app at a time: a second start brings the first one's window up)
if (!app.requestSingleInstanceLock()) app.quit();

const inside = (url) => { try { const h = new URL(url).hostname; return INSIDE.some((d) => h === d || h.endsWith('.' + d)); } catch (_) { return false; } };

let win = null;
let blocker = -1;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#11151c', title: 'Worms Online', show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      // the game keeps running when the window isn't in front
      backgroundThrottling: false,
      additionalArguments: [`--wo-version=${app.getVersion()}`],
    },
  });
  // (sign-in providers refuse an "Electron" browser: a plain Chrome user agent; the page knows
  // it's the app from the preload's window.wormsOnline)
  const ua = win.webContents.getUserAgent().replace(/ ?(Electron|worms-online|WormsOnline)\/[\d.]+/g, '');
  win.webContents.setUserAgent(ua);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  // links out of the site open in the player's browser; the site's own pages in the window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inside(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, url) => {
    if (!inside(url)) { ev.preventDefault(); shell.openExternal(url); }
  });
  // no connection (or the site down): the offline page, which retries
  win.webContents.on('did-fail-load', (_ev, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { reason: desc, url } });
  });
  // F11 fullscreen, F5 reload (the page itself, not the offline one), F12 the tools
  win.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); ev.preventDefault(); }
    else if (input.key === 'F5') { win.loadURL(SITE); ev.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); ev.preventDefault(); }
  });
  win.loadURL(SITE);
}

// a small menu: the standard roles (quit, copy / paste in fields, zoom), hidden on Windows and
// Linux (Alt shows it), the app menu macOS needs
const isMac = process.platform === 'darwin';
// (update.js: once a new version is downloaded, "Restart to update" installs it now; otherwise it
// goes in when the app is closed)
let updateReady = null, installUpdate = () => {};
function setMenu() {
Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(isMac ? [{ role: 'appMenu' }] : []),
  { label: 'Game', submenu: [
    { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.loadURL(SITE) },
    { label: 'Fullscreen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
    ...(updateReady ? [{ type: 'separator' }, { label: `Restart to update (${updateReady})`, click: () => installUpdate() }] : []),
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' },
  ] },
  { role: 'editMenu' },
  { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
  { role: 'windowMenu' },
]));
}
setMenu();

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
app.on('activate', () => { if (!win) createWindow(); });
app.whenReady().then(() => {
  // the system never suspends the app while it's open (App Nap, power saving); the display may
  // still sleep when idle
  blocker = powerSaveBlocker.start('prevent-app-suspension');
  // (the site's own cache as a browser keeps it; nothing else persisted but its storage)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['fullscreen', 'pointerLock', 'clipboard-read'].includes(permission)));
  createWindow();
  installUpdate = require('./update').start((v) => { updateReady = v; setMenu(); });
});
app.on('will-quit', () => { if (powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker); });
