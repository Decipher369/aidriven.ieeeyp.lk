/* Cache the public app shell/assets only. Personal ticket data stays in the
   user-keyed localStorage cache; no Auth, API or receipt response is cached. */
const CACHE = "aidsl-ticket-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_TICKET_SHELL") return;
  const resources = Array.isArray(event.data.resources) ? event.data.resources : [];
  const urls = ["/portal/ticket", ...resources.filter(value => {
    try { const url = new URL(value, self.location.origin); return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/")); } catch { return false; }
  })];
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await Promise.all(urls.map(async url => { try { const response = await fetch(url); if (response.ok) await cache.put(url, response); } catch { /* Keep the existing cache on transient network failure. */ } }));
  }));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const ticket = event.request.mode === "navigate" && url.pathname === "/portal/ticket";
  const asset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/");
  if (!ticket && !asset) return;
  event.respondWith(fetch(event.request).then(async response => { if (response.ok) { const cache = await caches.open(CACHE); await cache.put(ticket ? "/portal/ticket" : event.request, response.clone()); } return response; }).catch(async () => {
    const cached = await caches.match(ticket ? "/portal/ticket" : event.request);
    return cached ?? new Response("Please reconnect to load your saved ticket.", { status: 503 });
  }));
});
