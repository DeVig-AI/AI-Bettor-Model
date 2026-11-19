// DeVig desktop: a window onto the hosted DeVig app (devigai.pages.dev, deployed from the repo by Cloudflare Pages). The app's code and data live on the site,
// so pushing to the repo updates every installed copy -- no reinstall needed.
const { app, BrowserWindow, Menu, ipcMain, screen, shell } = require("electron");
const fs = require("fs");
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
    if (onSite(target) && /\/pill\.html/.test(target)) {
      openPill();
    } else if (onSite(target)) {
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

// ---------- the score pill: the TV dock's pill floating over a game on this computer (web/public/pill.html) ----------
const PILL_URL = process.env.DEVIG_PILL_URL || SITE + "v2/pill.html";   // DEVIG_PILL_URL: a local copy, for testing
let pill = null;
const pillPlace = () => path.join(app.getPath("userData"), "pill.json");

function openPill() {
  if (pill) { pill.show(); pill.focus(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  let at = { x: area.x + area.width - 420 - 16, y: area.y + 16 };
  try { at = { ...at, ...JSON.parse(fs.readFileSync(pillPlace(), "utf8")) }; } catch {}
  pill = new BrowserWindow({
    x: at.x, y: at.y, width: 420, height: 46, frame: false, resizable: false, hasShadow: true,
    // macOS's own frosted glass behind the page (Control Center's look); the window's corners round on their own
    vibrancy: "hud", visualEffectState: "active", backgroundColor: "#00000000", roundedCorners: true,
    skipTaskbar: true, fullscreenable: false, minimizable: false, maximizable: false, alwaysOnTop: true, title: "DeVig Pill",
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "pill-preload.js") },
  });
  // above everything, a full-screen game too, on every desktop
  pill.setAlwaysOnTop(true, "screen-saver");
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pill.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  // not signed in yet: sign in in the app window, then open the pill again
  pill.webContents.on("will-navigate", (event, target) => {
    if (SIGN_IN.test(target)) { event.preventDefault(); pill.close(); createWindow(APP_URL); }
  });
  pill.webContents.on("did-redirect-navigation", (_e, target) => {
    if (SIGN_IN.test(target)) { pill.close(); createWindow(APP_URL); }
  });
  pill.on("moved", () => {
    const [x, y] = pill.getPosition(), [w] = pill.getSize();
    try { fs.writeFileSync(pillPlace(), JSON.stringify({ x, y, right: x + w })); } catch {}
  });
  pill.on("closed", () => { pill = null; });
  pill.loadURL(PILL_URL);
}

// the pill fits its window to what it shows, keeping its right edge where it is so it grows to the left
ipcMain.on("pill:resize", (e, w, h) => {
  if (!pill || e.sender !== pill.webContents) return;
  const [x, y] = pill.getPosition(), [ow] = pill.getSize();
  const width = Math.max(120, Math.min(800, Math.round(w) || 0)), height = Math.max(40, Math.min(900, Math.round(h) || 0));
  pill.setBounds({ x: x + ow - width, y, width, height });
});
ipcMain.on("pill:close", (e) => { if (pill && e.sender === pill.webContents) pill.close(); });

function menu() {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Score Pill", accelerator: "CmdOrCtrl+Shift+P", click: openPill },
      { type: "separator" }, { role: "reload" }, { role: "togglefullscreen" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
    ] },
    { role: "windowMenu" },
  ]));
}

app.whenReady().then(() => {
  menu();
  if (process.argv.includes("--pill")) openPill();   // "open -a DeVig --args --pill": just the pill
  else createWindow(APP_URL);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(APP_URL);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
