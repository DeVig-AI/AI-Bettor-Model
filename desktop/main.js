// DeVig desktop: a window onto the hosted DeVig app (devigai.pages.dev, deployed from the repo by Cloudflare Pages). The app's code and data live on the site,
// so pushing to the repo updates every installed copy -- no reinstall needed.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = "https://devigai.pages.dev/";
const SITE = "https://devigai.pages.dev/";

// Sign-in is Cloudflare Access's email-code page on <team>.cloudflareaccess.com; it has to stay in the app window (its
// form posts the email there, and the sign-in cookie must land in this window), so it counts as part of the site.
const SIGN_IN = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//;

function onSite(url) {
  return url.startsWith(SITE) || SIGN_IN.test(url);
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 360, minHeight: 600,   // wide: the site's computer layout (sidebar, grid); narrow it for the phone one
    title: "DeVig", backgroundColor: "#0c0f14", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // pages of the site open in an app window; anything else in the normal browser
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (onSite(target)) {
      createWindow(target);
    } else if (/^https?:/.test(target)) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (!onSite(target) && !target.startsWith("file:")) {
      event.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });
  win.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, "offline.html"));   // -3 = aborted, not offline
  });
  win.loadURL(url);
  return win;
}

app.whenReady().then(() => {
  createWindow(APP_URL);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(APP_URL);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
