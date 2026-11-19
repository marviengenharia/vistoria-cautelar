// Service Worker: guarda todos os arquivos do app no aparelho para abrir sem internet.
// IMPORTANTE: a cada mudança em qualquer arquivo do app, aumentar VERSAO
// (senão o celular continua usando a cópia antiga guardada).
const VERSAO = '0.4.0';
const CACHE = `vistoria-${VERSAO}`;

const ARQUIVOS = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/dominio.js',
  'js/foto.js',
  'js/exif.js',
  'js/gps.js',
  'js/util.js',
  'js/zip.js',
  'js/compartilhar.js',
  'js/backup.js',
  'js/obra.js',
  'js/laudo.js',
  'js/area-assinatura.js',
  'js/tela-lista.js',
  'js/tela-imovel.js',
  'js/tela-ambientes.js',
  'js/tela-assinaturas.js',
  'vendor/idb/index.js',
  'vendor/jspdf/jspdf.umd.min.js',
  'img/logo-cbs.png',
  'vendor/fontes/barlow-latin-400-normal.woff2',
  'vendor/fontes/barlow-latin-500-normal.woff2',
  'vendor/fontes/barlow-latin-600-normal.woff2',
  'vendor/fontes/barlow-latin-700-normal.woff2',
  'vendor/fontes/barlow-condensed-latin-600-normal.woff2',
  'vendor/fontes/barlow-condensed-latin-700-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' = busca sempre do servidor, nunca do cache HTTP do navegador
      cache.addAll(ARQUIVOS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes
          .filter((nome) => nome.startsWith('vistoria-') && nome !== CACHE)
          .map((nome) => caches.delete(nome))
      ))
      .then(() => self.clients.claim())
  );
});

// O app pede para trocar de versão quando o usuário toca em "Atualizar".
self.addEventListener('message', (evento) => {
  if (evento.data === 'pular-espera') self.skipWaiting();
});

// Primeiro o que está guardado no aparelho; só vai à internet se não tiver.
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    evento.respondWith(
      caches.match('index.html', { cacheName: CACHE }).then((resp) => resp || fetch(req))
    );
    return;
  }

  evento.respondWith(
    caches.match(req, { ignoreSearch: true }).then((resp) => resp || fetch(req))
  );
});
