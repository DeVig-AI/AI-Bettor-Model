// DeVig alerts timer: a tiny Cloudflare Worker whose cron trigger runs every minute and asks the site's alert
// checker (functions/api/alerts.js, POST /api/alerts?run=1) to send whatever is due. Pages can't run on a timer,
// and GitHub's schedules drift by hours, so this is what makes live-game alerts land within a minute or two.
// It runs the checker twice a minute (now and 30 seconds later). The checker locks itself for 25 seconds, so the
// GitHub bots calling it too never double-send.
//
// Setup (Cloudflare dashboard, no install): Workers & Pages → Create → Worker → paste this file → Deploy.
// Settings → Triggers → Cron: * * * * *.  Settings → Variables → secret ALERTS_RUN_KEY (same value as the
// Pages project's ALERTS_RUN_KEY).  Optional plain variable ALERTS_URL to point at another deploy.

const URL_DEFAULT = "https://devigai.pages.dev/api/alerts?run=1";

async function tick(env) {
  const r = await fetch(env.ALERTS_URL || URL_DEFAULT, {method: "POST", headers: {"x-run-key": env.ALERTS_RUN_KEY || ""}});
  const body = await r.text();
  if (!r.ok) console.log(`alerts checker ${r.status}: ${body.slice(0, 200)}`);
  return r.status;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await tick(env);
      await new Promise(res => setTimeout(res, 30e3));
      await tick(env);
    })());
  },
  // visiting the Worker's own URL just says what it is; it never runs the checker
  async fetch() {
    return new Response("DeVig alerts timer. Runs on its cron trigger.\n", {headers: {"content-type": "text/plain"}});
  },
};
