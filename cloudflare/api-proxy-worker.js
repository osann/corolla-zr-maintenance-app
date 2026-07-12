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
//   1. Workers & Pages -> Create -> Create Worker (deploy the default template first).
//   2. Edit code, paste this file's contents in, Deploy.
//   3. Worker's Settings -> Triggers -> Routes -> Add route:
//        Route: corolla.jhosan.top/api/*
//        Zone:  jhosan.top
//
// Only after that route is confirmed live should the BACKEND_URL GitHub secret be changed
// from the Render URL to https://corolla.jhosan.top — flipping it earlier breaks the site.

const BACKEND_ORIGIN = 'https://corolla-zr-maintenance-app.onrender.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const backendUrl = new URL(url.pathname + url.search, BACKEND_ORIGIN);
    return fetch(new Request(backendUrl, request));
  },
};
