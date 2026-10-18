/* DeVig: a short "add DeVig to your home screen" tutorial, shown once on a visitor's first open.
   Never shown when DeVig is already opened from the home screen. "Got it" hides it for good on this device;
   "Later" hides it until the next visit. window.devigInstallTip() opens it again (footer link). */
(function () {
  "use strict";
  var KEY = "devig.installTip.v1";
  var deferred = null;           // Chrome / Edge / Android: the browser's own install prompt, when offered

  function standalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function seen() {
    try { return !!localStorage.getItem(KEY) || !!sessionStorage.getItem(KEY); } catch (e) { return false; }
  }
  function remember(forGood) {
    try { (forGood ? localStorage : sessionStorage).setItem(KEY, "1"); } catch (e) {}
  }

  var ua = navigator.userAgent || "";
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var iosSafari = ios && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua);
  var android = /Android/.test(ua);

  var SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function steps() {
    if (iosSafari) return {
      title: "Add DeVig to your Home Screen",
      list: ["Tap the <b>Share</b> button " + SHARE + " at the bottom of Safari.",
             "Scroll down and tap <b>Add to Home Screen</b>.",
             "Tap <b>Add</b>. DeVig opens full screen, like an app."]
    };
    if (ios) return {
      title: "Add DeVig to your Home Screen",
      list: ["Open <b>devigai.pages.dev</b> in <b>Safari</b> (iPhone only allows this from Safari).",
             "Tap <b>Share</b> " + SHARE + ", then <b>Add to Home Screen</b>, then <b>Add</b>."]
    };
    if (android) return {
      title: "Add DeVig to your home screen",
      list: deferred ? ["Tap <b>Install DeVig</b> below. It opens full screen, like an app."]
                     : ["Tap the <b>⋮</b> menu in Chrome.", "Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Add</b>."]
    };
    return {
      title: "Keep DeVig one click away",
      list: deferred ? ["Click <b>Install DeVig</b> below to get it as its own window."]
                     : ["Press <b>" + (/Mac/.test(navigator.platform) ? "⌘" : "Ctrl") + " + D</b> to bookmark this page,",
                        "or in Chrome / Edge use the install icon at the right end of the address bar."]
    };
  }

  var box = null;
  function close(forGood) {
    remember(forGood);
    if (box) { box.remove(); box = null; }
  }
  function show() {
    if (box) return;
    var s = steps();
    box = document.createElement("div");
    box.className = "itip";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", s.title);
    box.innerHTML = '<div class="itip-card">' +
      '<div class="itip-head"><img src="icons/icon-192.png" alt="" width="40" height="40"><div><b>' + s.title + '</b>' +
      '<div class="itip-sub">Free, no download or account. It always shows the latest picks.</div></div></div>' +
      '<ol>' + s.list.map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ol>' +
      '<div class="itip-btns">' +
      (deferred ? '<button type="button" class="itip-go" data-act="install">Install DeVig</button>' : '') +
      '<button type="button" class="itip-ok" data-act="ok">Got it</button>' +
      '<button type="button" class="itip-later" data-act="later">Later</button></div></div>';
    box.addEventListener("click", function (e) {
      var act = e.target.closest && e.target.closest("[data-act]");
      if (!act && e.target === box) { close(false); return; }
      if (!act) return;
      act = act.getAttribute("data-act");
      if (act === "install" && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; close(true); }, function () { close(true); });
      } else {
        close(act === "ok");
      }
    });
    document.body.appendChild(box);
    var first = box.querySelector("button");
    if (first) first.focus({preventScroll: true});
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    if (box) { box.remove(); box = null; show(); }   // redraw with the Install button
  });
  window.addEventListener("appinstalled", function () { close(true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box) close(false); });

  window.devigInstallTip = function () { show(); return false; };

  if (!standalone() && !seen()) {
    window.addEventListener("load", function () { setTimeout(show, 1500); });
  }
})();
