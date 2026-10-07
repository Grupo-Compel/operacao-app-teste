/* sw.js — app de teste da Operação. O "service worker": o pedaço que o
   navegador guarda no celular e que serve o app quando não há sinal.

   POR QUE "PRIMEIRO O QUE ESTÁ GUARDADO": em campo, esperar a rede responder
   para depois cair no guardado é o pior dos mundos (a tela fica branca até o
   tempo esgotar). O app abre sempre do celular; versão nova entra quando o
   arquivo deste sw.js muda (VERSAO_CACHE), e aí o app avisa.

   O ENVIO PARA O SERVIDOR NUNCA PASSA PELO GUARDADO: só GET do próprio site é
   servido daqui. Um POST para o Apps Script respondido do cache seria um
   "enviado" que não chegou. */
importScripts('fila.js');

var VERSAO_CACHE = 'operacao-teste-3';
var ARQUIVOS = ['./', './index.html', './app.js', './fila.js', './manifest.webmanifest', './icone-192.png', './icone-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO_CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO_CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (guardado) {
    if (guardado) return guardado;
    return fetch(req).catch(function () {
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw new Error('sem sinal e sem cópia guardada: ' + req.url);
    });
  }));
});

/* ENVIO EM SEGUNDO PLANO (só Android/Chrome tem): quando o sinal volta, o
   navegador acorda este arquivo mesmo com o app fechado. Se o envio falhar
   por falta de rede, a promessa falha e o navegador tenta de novo mais tarde.
   É exatamente uma das coisas que o teste existe para medir: a coluna
   ENVIADO_POR da aba APP_TESTE diz "segundo plano" quando foi ele. */
self.addEventListener('sync', function (e) {
  if (e.tag !== 'enviar-fila') return;
  e.waitUntil(enviarFila('segundo plano').then(function (r) {
    if (r && (r.semRede || r.servidorFora)) throw new Error('sem rede: o navegador tenta de novo');
  }));
});
