// What the page can see of the app (contextIsolation: nothing else of Node or Electron reaches
// it): that it runs in the app, the app's version and platform. ranked.js can switch on app-only
// things by `window.wormsOnline`
'use strict';
const { contextBridge } = require('electron');
// (a sandboxed preload can't require files: main.js passes the version on the command line)
const arg = process.argv.find((a) => a.startsWith('--wo-version='));

contextBridge.exposeInMainWorld('wormsOnline', Object.freeze({
  app: true,
  version: arg ? arg.slice('--wo-version='.length) : '',
  platform: process.platform,
  // (0.1.1 on: the app updates itself; the site only asks older ones to download again)
  updates: true,
}));
