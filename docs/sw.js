// DeVig's service worker: only for alerts. It shows a push message from /api/alerts as a notification and opens the
// right page when it's tapped. It caches nothing and doesn't touch page loads, so the site works exactly as before.
// Lives at the site root so the classic app and the v2 beta (under /v2/) share it, and so does the installed app.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = {body: e.data ? e.data.text() : ""}; }
  const url = typeof m.url === "string" && m.url.startsWith("/") ? m.url : "/v2/";
  e.waitUntil(self.registration.showNotification(m.title || "DeVig", {
    body: m.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: m.tag || undefined,
    renotify: !!m.tag,
    data: {url},
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/v2/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      try { await w.focus(); return w.navigate ? w.navigate(url) : undefined; } catch (err) { /* open a new one */ }
    }
    return self.clients.openWindow(url);
  })());
});

// the browser replaced this device's subscription: hand the new one to DeVig so alerts keep coming
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    const key = old && old.options && old.options.applicationServerKey;
    const sub = e.newSubscription || (key ? await self.registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key}) : null);
    if (!sub) return;
    await fetch("/api/alerts", {method: "POST", credentials: "include", headers: {"content-type": "application/json"},
      body: JSON.stringify({op: "device", sub: sub.toJSON()})});
    if (old) await fetch("/api/alerts", {method: "POST", credentials: "include", headers: {"content-type": "application/json"},
      body: JSON.stringify({op: "forget", endpoint: old.endpoint})}).catch(() => null);
  })());
});
