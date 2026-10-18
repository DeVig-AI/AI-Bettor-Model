/* DeVig accounts (website only): keeps a signed-in person's tracking, name tag and favorite teams in their
   account through /api/me, so they follow them to every device. Without a login (or before accounts are set
   up) nothing changes: the app keeps saving in this browser. The app stores both in localStorage; this file
   copies them to and from the account and calls window.devigReloadPrefs() after loading. */
(function () {
  "use strict";
  var TRACK_KEY = "devig.tracked.v1", PREFS_KEY = "devig.prefs.v1";
  var email = null, pushTimer = null;

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
    t.updated = Math.max(lt.updated || 0, rt.updated || 0);
    var lp = local.prefs || {}, rp = remote.prefs || {};
    var prefs = (lp.updated || 0) > (rp.updated || 0) ? lp : rp;
    if (!prefs.teams) prefs = {name: lp.name || rp.name || "", teams: lp.teams || rp.teams || {}, updated: Date.now()};
    return {tracked: t, prefs: prefs};
  }

  function push() {
    if (!email) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      fetch("/api/me", {method: "PUT", credentials: "same-origin", headers: {"content-type": "application/json"},
                        body: JSON.stringify({tracked: read(TRACK_KEY) || {}, prefs: read(PREFS_KEY) || {}})})
        .then(function (r) { status(r.ok ? "saved to your account (" + email + ")" : "couldn't save to your account; saved on this device"); })
        .catch(function () { status("offline: saved on this device, will sync next time"); });
    }, 800);
  }

  window.addEventListener("devig:prefs-changed", push);

  fetch("/api/me", {credentials: "same-origin", headers: {accept: "application/json"}})
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.email) { status("saved on this device"); return; }
      email = d.email;
      var local = {tracked: read(TRACK_KEY) || {}, prefs: read(PREFS_KEY) || {}};
      var m = d.data ? merge(local, d.data) : local;
      write(TRACK_KEY, m.tracked);
      write(PREFS_KEY, m.prefs);
      if (window.devigReloadPrefs) window.devigReloadPrefs();
      status("saved to your account (" + email + ")");
      push();                                   // store the combined copy (first sign-in uploads this device's list)
    })
    .catch(function () { status("saved on this device"); });
})();
