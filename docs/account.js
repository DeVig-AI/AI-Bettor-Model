/* DeVig accounts (website only): keeps a signed-in person's tracking, name tag and favorite teams in their
   account through /api/me, so they follow them to every device. Without a login (or before accounts are set
   up) nothing changes: the app keeps saving in this browser. The app stores both in localStorage; this file
   copies them to and from the account and calls window.devigReloadPrefs() after loading.
   A new account needs the invite code once (asked for in the Me tab); until then it saves on the device. */
(function () {
  "use strict";
  var TRACK_KEY = "devig.tracked.v1", PREFS_KEY = "devig.prefs.v1";
  var email = null, joined = false, pushTimer = null;

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

  // Signed in but no account yet: one box in the Me tab for the invite code.
  function askInvite() {
    status("signed in as " + email + ". Saved on this device until you enter the invite code");
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
  var WHY = {401: "you're not signed in", 503: "accounts aren't switched on yet", 404: "accounts only work on devigai.pages.dev"};

  fetch("/api/me", {credentials: "same-origin", headers: {accept: "application/json"}})
    .then(function (r) {
      if (r.ok) return r.json();
      status("saved on this device (" + (WHY[r.status] || "account error " + r.status) + ")");
      return "done";
    })
    .then(function (d) {
      if (d === "done") return;
      if (!d || !d.email) { status("saved on this device"); return; }
      email = d.email;
      if (d.joined) start(d.data); else askInvite();
    })
    .catch(function () { status("saved on this device"); });
})();
