// Service worker mínimo do HORUS Newsroom — existe basicamente pra
// satisfazer o critério de instalabilidade do PWA (Chrome/Android exigem
// um service worker registrado com handler de fetch). Não faz cache
// agressivo de propósito: este é um sistema de redação com dados que
// mudam a toda hora (status, escalada, WebSocket) — cachear respostas de
// API esconderia informação desatualizada sem o usuário perceber. Só
// guarda o "esqueleto" do app (HTML/CSS/JS estáticos) pra abrir mais
// rápido e sobreviver a uma queda de conexão breve; tudo que vem do
// servidor (fetch pra rotas da API) sempre vai direto pra rede.
const CACHE_NAME = 'horus-newsroom-v1';
const ARQUIVOS_ESQUELETO = [
  '/pautas.html',
  '/sugestoes.html',
  '/agenda.html',
  '/escala.html',
  '/materia.html',
  '/manifest.json'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESQUELETO))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first: tenta a rede sempre primeiro (dados sempre atuais);
// só usa o cache do esqueleto se a rede falhar (ex. sem conexão),
// e só pra navegação de página (não pra chamadas de API).
self.addEventListener('fetch', (evento) => {
  if (evento.request.mode !== 'navigate') return;

  evento.respondWith(
    fetch(evento.request).catch(() => caches.match(evento.request))
  );
});
