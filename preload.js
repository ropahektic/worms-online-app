// What the page can see of the app (contextIsolation: nothing else of Node or Electron reaches
// it): that it runs in the app, the app's version and platform. ranked.js can switch on app-only
// things by `window.wormsOnline`
'use strict';
const { contextBridge } = require('electron');
const pkg = require('./package.json');

contextBridge.exposeInMainWorld('wormsOnline', Object.freeze({
  app: true,
  version: pkg.version,
  platform: process.platform,
}));
