// Service worker do Invest Moment: permite instalar como app e mostra aviso quando estiver sem internet.
// Não guarda respostas da API nem do painel (dados sempre ao vivo).
const CACHE = "im-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return; // só páginas; API e arquivos seguem direto
  e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
