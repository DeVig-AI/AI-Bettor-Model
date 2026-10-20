/* DeVig accounts (website only). Anyone can use the app without signing in; tracking games and props, the name
   tag and favorite teams need a free account. Signing in happens at /login (Cloudflare Access, email code), and a
   new account needs the invite code once. The account's copy is kept through /api/me, so it follows the person
   to every device. The app stores everything in localStorage; this file copies it to and from the account and
   calls window.devigReloadPrefs() after loading. If accounts aren't available on this site at all (not set up,
   another host, offline), tracking simply stays on the device. */
(function () {
  "use strict";
  var TRACK_KEY = "devig.tracked.v1", PREFS_KEY = "devig.prefs.v1";
  var email = null, joined = false, pushTimer = null;
  var locked = true;                           // until /api/me says otherwise: tracking and settings need an account

  function setLocked(on) {
    locked = on;
    var panel = document.getElementById("panel-me");
    if (panel) panel.classList.toggle("locked", on);
    else window.addEventListener("load", function () { setLocked(locked); });
  }
  setLocked(true);

  // The app asks before every Track tap; without an account it opens the profile, which explains how to get one.
  window.devigCanTrack = function () {
    if (!locked) return true;
    if (window.devigShowProfile) window.devigShowProfile();
    var j = document.getElementById("meJoin");
    if (j) { j.classList.remove("flash"); void j.offsetWidth; j.classList.add("flash"); }
    return false;
  };

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function status(txt) {
    if (window.devigSyncStatus) window.devigSyncStatus(txt);
    else window.addEventListener("load", function () { if (window.devigSyncStatus) window.devigSyncStatus(txt); });
  }

  // Tracking from two devices is combined (nothing tracked on either is lost); for name and teams the newer wins.
  function merge(local, remote) {
    var t = {g: {}, p: {}, updated: 0}, lt = local.tracked || {}, rt = remote.tracked || {};
    ["g", "p"].forEach(function (k) {
      [rt[k] || {}, lt[k] || {}].forEach(function (src) { Object.keys(src).forEach(function (key) { t[k][key] = src[key]; }); });
    });
    // tracked parlays: every one either device has; a parlay removed on one device stays removed
    var lp_ = lt.parlays || {}, rp_ = rt.parlays || {};
    if (Object.keys(lp_).length || Object.keys(rp_).length) {
      t.parlays = {};
      [rp_, lp_].forEach(function (src) { Object.keys(src).forEach(function (id) {
        if (!t.parlays[id] || src[id].removed) t.parlays[id] = src[id];
      }); });
    }
    t.updated = Math.max(lt.updated || 0, rt.updated || 0);
    var lp = local.prefs || {}, rp = remote.prefs || {};
    var prefs = (lp.updated || 0) > (rp.updated || 0) ? lp : rp;
    if (!prefs.teams) prefs = {name: lp.name || rp.name || "", teams: lp.teams || rp.teams || {}, updated: Date.now()};
    return {tracked: t, prefs: prefs};
  }

  function push(delay) {
    if (!email || !joined) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      fetch("/api/me", {method: "PUT", credentials: "same-origin", headers: {"content-type": "application/json"},
                        body: JSON.stringify({tracked: read(TRACK_KEY) || {}, prefs: read(PREFS_KEY) || {}})})
        .then(function (r) {
          if (r.status === 429) {                 // saving too fast: try again once the server allows it
            return r.json().then(function (e) { if (e.retry_ms) push(e.retry_ms + 200); else status("daily save limit reached; saved on this device"); });
          }
          status(r.ok ? "saved to your account (" + email + ")" : "couldn't save to your account; saved on this device");
        })
        .catch(function () { status("offline: saved on this device, will sync next time"); });
    }, delay || 800);
  }

  function start(data) {
    joined = true;
    setLocked(false);
    window.devigLogos = true;                  // team logos (trademarks) show to signed-in accounts only
    var local = {tracked: read(TRACK_KEY) || {}, prefs: read(PREFS_KEY) || {}};
    var m = data ? merge(local, data) : local;
    write(TRACK_KEY, m.tracked);
    write(PREFS_KEY, m.prefs);
    if (window.devigReloadPrefs) window.devigReloadPrefs();
    status("saved to your account (" + email + ")");
    signOutLink();
    push();                                     // store the combined copy (first sign-in uploads this device's list)
  }

  // Cloudflare Access signs people out at this address.
  function signOutLink() {
    var at = document.getElementById("meSync");
    if (!at || document.getElementById("meSignOut")) return;
    var a = document.createElement("a");
    a.id = "meSignOut"; a.href = "/cdn-cgi/access/logout"; a.textContent = "Sign out";
    a.style.cssText = "display:inline-block; margin:0 0 12px; font-size:13px; color:var(--accent-strong)";
    at.parentNode.insertBefore(a, at.nextSibling);
  }

  // Not signed in: what an account is for, and the button to sign in or create one.
  function askSignIn() {
    status("you're using DeVig as a guest");
    var at = document.getElementById("meSync");
    if (!at) { window.addEventListener("load", askSignIn); return; }
    if (document.getElementById("meJoin")) return;
    var box = document.createElement("div");
    box.id = "meJoin";
    box.innerHTML = '<p style="margin:0 0 10px">Create a free account to track games and props, and to save your name tag and ' +
      'favorite teams on every device. Sign in with your email (you get a 6-digit code, no password). A new account ' +
      'needs the invite code from the person who shared DeVig.</p>' +
      '<a class="me-join-btn" href="/login">Sign in or create account</a>';
    at.parentNode.insertBefore(box, at.nextSibling);
  }

  // Signed in but no account yet: one box for the invite code.
  function askInvite() {
    status("signed in as " + email + ". Enter the invite code to open your account");
    var at = document.getElementById("meSync");
    if (!at) { window.addEventListener("load", askInvite); return; }
    if (document.getElementById("meInvite")) return;
    signOutLink();
    var box = document.createElement("form");
    box.id = "meInvite";
    box.style.marginBottom = "14px";
    box.innerHTML = '<div class="field"><label for="meInviteCode">Invite code</label>' +
      '<input id="meInviteCode" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="64" placeholder="From the person who shared DeVig"></div>' +
      '<button type="submit" class="ghost">Open my account</button> <span class="faint" id="meInviteMsg"></span>';
    at.parentNode.insertBefore(box, at.nextSibling);
    box.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg = document.getElementById("meInviteMsg");
      msg.textContent = "Checking…";
      fetch("/api/me", {method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"},
                        body: JSON.stringify({invite: document.getElementById("meInviteCode").value})})
        .then(function (r) { return r.json().then(function (e) { return {r: r, e: e}; }); })
        .then(function (x) {
          if (x.r.ok) { box.remove(); start(null); return; }
          msg.textContent = x.r.status === 403 ? "Wrong code" + (x.e.tries_left != null ? " (" + x.e.tries_left + " tries left)" : "") + "."
                          : (x.e.error || "Couldn't check the code") + ".";
        })
        .catch(function () { msg.textContent = "Offline, try again later."; });
    });
  }

  window.addEventListener("devig:prefs-changed", function () { push(); });

  // Why there's no account, in plain words, so a setup problem shows up in the profile page.
  var WHY = {503: "accounts aren't switched on yet", 404: "accounts only work on devigai.pages.dev"};
  function deviceOnly(why) { setLocked(false); status("saved on this device" + (why ? " (" + why + ")" : "")); }

  fetch("/api/me", {credentials: "same-origin", headers: {accept: "application/json"}})
    .then(function (r) {
      if (r.status === 401) { askSignIn(); return "done"; }
      if (r.ok) return r.json();
      deviceOnly(WHY[r.status] || "account error " + r.status);
      return "done";
    })
    .then(function (d) {
      if (d === "done") return;
      if (!d || !d.email) { deviceOnly(); return; }
      email = d.email;
      if (d.joined) start(d.data); else askInvite();
    })
    .catch(function () { deviceOnly(); });
})();
