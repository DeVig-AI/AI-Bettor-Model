/*
 * repo-data.js -- DeVig (free version) data layer. Stands in for the claude.ai database: it reads the public export
 * files the GitHub Actions bots commit to the repo and serves them through the same small API the app already uses
 * (collection(...).orderBy(...).onSnapshot / get / add). No Claude, no keys, no sync jobs.
 *
 * Claude-only features (photo reading, Ask chat, AI parlay) get `null` from claude.use(), which the app already
 * treats as "not available"; free.css hides their buttons.
 */
(function () {
  "use strict";
  var RAW = "https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/";
  // every: minutes between refreshes while the app is open (raw.githubusercontent.com caches up to ~5 minutes)
  var SOURCES = [
    {path: "nfl/live/props_live.json", every: 2, live: true},
    {path: "live/live_lines.json", every: 2, live: "LIVE_LINES"},
    {path: "live/game_lines.json", every: 10, live: "GAME_LINES"},
    {path: "live/cfb_history.json", every: 15, live: "CFB_HISTORY"},
    {path: "nfl/live/props_results.json", every: 15, live: "PROPS_ARCHIVE"},
    {path: "nfl/lineboard_export.json", every: 10},
    {path: "mlb/lineboard_export.json", every: 10},
    {path: "nba/lineboard_export.json", every: 10},
    {path: "nba/preseason_trial_export.json", every: 30},
    {path: "nba/roster_changes.json", every: 60, live: "NBA_ROSTERS"},
    {path: "nba/injuries_export.json", every: 15},
    {path: "nfl/comparison_lineboard_export.json", every: 30},
    {path: "live/models_export.json", every: 15},
    {path: "nfl/props_model_export.json", every: 15, props: true},
    {path: "nba/props_model_export.json", every: 15, props: true},
    {path: "nhl/props_model_export.json", every: 15, props: true}
  ];
  var SCANS_KEY = "devig_free_scans";
  var store = {};      // collection -> {source path -> [doc data]}
  var listeners = {};  // collection -> [{fn, order}]
  var loadedAt = {};   // source path -> ms
  var firstRound = null;

  // The app reads props rows in the compact form the claude.ai sync used: columns + arrays.
  var PROP_COLS = ["player", "stat", "line", "kb", "ka", "koi", "pp", "pliq", "mp", "ex", "n", "inj", "stale"];
  function compactProps(d) {
    var out = {};
    Object.keys(d).forEach(function (k) { if (k !== "rows") out[k] = d[k]; });
    out.cols = PROP_COLS;
    out.rows = (d.rows || []).map(function (r) {
      var k = r.k || {}, p = r.p || {};
      return [r.player, r.stat, r.line, nz(k.bid), nz(k.ask), nz(k.oi), nz(p.price), nz(p.liq), nz(r.model_p),
              nz(r.expected), r.n_games || 0, r.injury || null, r.stale || null];
    });
    if (!out.prices_fetched) out.prices_fetched = d.scored_utc || null;
    return out;
  }
  function nz(v) { return v === undefined ? null : v; }

  function docsOf(coll) {
    var out = [], s = store[coll] || {};
    Object.keys(s).forEach(function (k) { out = out.concat(s[k]); });
    return out;
  }
  function sorted(list, order) {
    if (!order) return list.slice();
    var f = order[0], desc = order[1] === "desc";
    return list.slice().sort(function (a, b) {
      var x = a[f], y = b[f];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
    });
  }
  function snap(list) {
    return {size: list.length, empty: !list.length,
            docs: list.map(function (d) { return {id: d.__id, data: function () { return d; }}; })};
  }
  function notify(coll) {
    (listeners[coll] || []).forEach(function (l) {
      var list = sorted(docsOf(coll), l.order);
      if (l.limit) list = list.slice(0, l.limit);
      try { l.fn(snap(list)); } catch (e) { console.error(e); }
    });
  }

  function load(src) {
    loadedAt[src.path] = Date.now();
    return fetch(RAW + src.path + "?t=" + Date.now(), {cache: "no-store"})
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (json) {
        if (!json) return [];                       // missing file (e.g. a sport not in season) = no docs
        var touched = {};
        if (src.live) {
          var name = src.live === true ? "NFL_PROPS_LIVE" : src.live;
          var doc = Object.assign({doc: name, __id: name === "NFL_PROPS_LIVE" ? "NFL" : name}, json);
          (store.live = store.live || {})[src.path] = [doc];
          touched.live = true;
        } else {
          var byColl = {};
          (json.docs || []).forEach(function (d) {
            var data = d.data || {};
            if (src.props && d.collection === "props_model") data = compactProps(data);
            data.__id = d.doc_id;
            (byColl[d.collection] = byColl[d.collection] || []).push(data);
          });
          // collections this file filled before but not now are emptied too
          Object.keys(store).forEach(function (c) { if (store[c][src.path] && !byColl[c]) byColl[c] = []; });
          Object.keys(byColl).forEach(function (c) {
            (store[c] = store[c] || {})[src.path] = byColl[c];
            touched[c] = true;
          });
        }
        return Object.keys(touched);
      });
  }

  function refreshAll(force) {
    var due = SOURCES.filter(function (s) { return force || !loadedAt[s.path] || Date.now() - loadedAt[s.path] >= s.every * 60000; });
    return Promise.all(due.map(load)).then(function (lists) {
      var seen = {};
      lists.forEach(function (l) { l.forEach(function (c) { seen[c] = true; }); });
      Object.keys(seen).forEach(notify);
    });
  }

  // ---- saved scans live in this browser only (the photo reader needs Claude, so this stays empty in practice) ----
  function readScans() {
    try { return JSON.parse(localStorage.getItem(SCANS_KEY) || "[]"); } catch (e) { return []; }
  }

  function Query(coll, order, lim) { this.coll = coll; this.order = order || null; this.lim = lim || 0; }
  Query.prototype.orderBy = function (f, dir) { return new Query(this.coll, [f, dir || "asc"], this.lim); };
  Query.prototype.limit = function (n) { return new Query(this.coll, this.order, n); };
  Query.prototype.where = function () { return this; };
  Query.prototype.onSnapshot = function (fn) {
    var l = {fn: fn, order: this.order, limit: this.lim}, c = this.coll;
    (listeners[c] = listeners[c] || []).push(l);
    // after the first load every listener hears once, even when its collection has no file (so nothing waits forever)
    firstRound.then(function () {
      var list = sorted(docsOf(c), l.order);
      if (l.limit) list = list.slice(0, l.limit);
      try { fn(snap(list)); } catch (e) { console.error(e); }
    });
    return function () { listeners[c] = (listeners[c] || []).filter(function (x) { return x !== l; }); };
  };
  Query.prototype.get = function () {
    var self = this;
    if (self.coll === "scans") {
      var s = sorted(readScans(), self.order);
      return Promise.resolve(snap(self.lim ? s.slice(0, self.lim) : s));
    }
    return firstRound.then(function () {
      var list = sorted(docsOf(self.coll), self.order);
      return snap(self.lim ? list.slice(0, self.lim) : list);
    });
  };
  Query.prototype.add = function (obj) {
    if (this.coll !== "scans") return Promise.reject(new Error("read-only"));
    var all = readScans();
    all.push(obj);
    try { localStorage.setItem(SCANS_KEY, JSON.stringify(all.slice(-200))); } catch (e) {}
    return Promise.resolve({id: String(all.length)});
  };

  var db = {collection: function (name) { return new Query(name); }};
  firstRound = refreshAll(true);
  setInterval(function () { if (!document.hidden) refreshAll(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshAll(false); });

  // Chat: the app's Ask tab calls sample(messages, {signal, onText}); here it goes to /api/ask (Cloudflare Workers AI,
  // free, signed-in accounts only) and streams the answer back. Errors carry a code the Ask tab turns into words.
  function sample(input, opts) {
    opts = opts || {};
    function fail(code, text) { var e = new Error(code); e.code = code; e.text = text || ""; throw e; }
    return fetch("/api/ask", {method: "POST", credentials: "same-origin", signal: opts.signal,
                              headers: {"content-type": "application/json"}, body: JSON.stringify({messages: input})})
      .catch(function (e) { fail(e && e.name === "AbortError" ? "cancelled" : "offline"); })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { fail(e.code || (r.status === 404 ? "off" : "ai"), ""); });
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", text = "";
        function pump() {
          return reader.read().then(function (x) {
            if (x.done) return {text: text.trim()};
            buf += dec.decode(x.value, {stream: true});
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (line) {
              if (line.indexOf("data:") !== 0) return;
              var d = line.slice(5).trim();
              if (!d || d === "[DONE]") return;
              try {
                var j = JSON.parse(d);                 // Workers AI {response} or OpenAI-style {choices:[{delta:{content}}]}
                var piece = j.response != null ? j.response : (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content);
                if (piece) text += piece;
              } catch (e) {}
            });
            if (opts.onText) opts.onText({text: text});
            return pump();
          });
        }
        return pump().catch(function (e) { fail(e && e.name === "AbortError" ? "cancelled" : "ai", text); });
      });
  }

  window.devigAskCompact = true;           // the free chat gets a shorter pick history (see the app's askContext)
  window.claude = {use: function (name) { return Promise.resolve(name === "db" ? db : name === "sample" ? sample : null); }};
})();
