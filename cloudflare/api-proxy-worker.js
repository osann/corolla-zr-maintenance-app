// Cloudflare Worker: proxies corolla.jhosan.top/api/* to the Render backend.
//
// Why this exists: the frontend (corolla.jhosan.top) and backend (Render, a different domain)
// used to talk directly to each other, which makes the session cookie a third-party cookie
// from the browser's point of view. Brave blocks those outright for every site, Safari blocks
// them unless cross-site tracking protection is disabled, and other browsers are moving the
// same direction — so signed-in state kept silently dying. Routing /api/* through this domain
// instead makes the cookie first-party (its Domain defaults to whatever host the response
// appears to come from, and the backend doesn't set an explicit Domain attribute, so once this
// Worker is the one answering, that's corolla.jhosan.top) — invisible to all of that blocking,
// the same way Google/Facebook's own-domain cookies are.
//
// Nothing else changes: this only forwards method/headers/body/querystring straight through
// to Render and returns the response as-is. No CORS handling needed here — once traffic goes
// through this domain, the browser sees it as same-origin and CORS doesn't apply at all.
//
// Setup (Cloudflare dashboard — see CLAUDE.md's Hosting section for full instructions):
//   1. Workers & Pages -> Create -> Create Worker (deploy the default blank/"Hello World"
//      template first). Do NOT use "Import a repository" / connect this to Git — that flow
//      pulls in the whole repo, auto-detects it as a static-assets project, and never runs
//      this script at all (every request then 404s with no X-Render-Origin-Server header —
//      happened once already; fix was deleting that Worker and recreating it the plain way).
//   2. Edit code, paste this file's contents in, Deploy.
//   3. Worker's Settings -> Triggers -> Routes -> Add route:
//        Route: corolla.jhosan.top/api/*
//        Zone:  jhosan.top
//
// This file is a reference copy — the deployed Worker is a manual paste, not Git-connected.
// Changing this file does NOT redeploy anything; re-paste and re-deploy in the dashboard too.
//
// Only after that route is confirmed live (curl https://corolla.jhosan.top/api/health should
// return the same JSON as hitting Render directly, with an X-Render-Origin-Server header)
// should the BACKEND_URL GitHub secret be changed from the Render URL to
// https://corolla.jhosan.top — flipping it earlier breaks the site.

const BACKEND_ORIGIN = 'https://corolla-zr-maintenance-app.onrender.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const backendUrl = new URL(url.pathname + url.search, BACKEND_ORIGIN);
    return fetch(new Request(backendUrl, request));
  },
};
