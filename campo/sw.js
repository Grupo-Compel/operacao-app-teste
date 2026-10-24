/* sw.js — app do encarregado (Operação, 5a). O pedaço que o navegador guarda
   no celular: serve o app sem sinal e envia em segundo plano.

   PRIMEIRO O QUE ESTÁ GUARDADO: em campo, esperar a rede para depois cair no
   guardado deixa a tela branca até o tempo esgotar. Versão nova entra quando
   VERSAO_CACHE muda, e o app avisa.

   O ENVIO NUNCA PASSA PELO GUARDADO: só GET do próprio site é servido daqui. Um
   POST respondido do cache seria um "enviado" que não chegou. */
/* 5e.3: o resumo do servidor antes da fila: o envio em segundo plano também confere para onde vai. */
importScripts('servidor.js', 'fila.js');

var VERSAO_CACHE = 'operacao-campo-7u-1';
/* 2f: o leitor de PDF (pdfjs/) vem guardado, para o projeto abrir na obra sem sinal. */
var ARQUIVOS = ['./', './index.html', './app.js', './fila.js', './servidor.js', './manifest.webmanifest', './icone-192.png', './icone-512.png',
  './pdfjs/pdf.min.js', './pdfjs/pdf.worker.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO_CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    /* Só apaga os caches DESTE app: o app de teste mora no mesmo site (a pasta de cima). */
    return Promise.all(nomes.filter(function (n) { return /^operacao-campo-/.test(n) && n !== VERSAO_CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSAO_CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (guardado) {
    if (guardado) return guardado;
    return fetch(req).catch(function () {
      if (req.mode === 'navigate') return caches.open(VERSAO_CACHE).then(function (c) { return c.match('./index.html'); });
      throw new Error('sem sinal e sem cópia guardada: ' + req.url);
    });
  }));
});

/* ENVIO EM SEGUNDO PLANO (Android/Chrome): acordado, o app espera e tenta de
   novo dentro da mesma vez, porque a rede que acabou de voltar ainda não está de
   pé (07/10/2026, 16:14 e 20:38: 5, 15, 30 e 60 s). Se o Chrome cortar antes,
   nada se perde: o diário continua na fila. */
var ESPERAS_SEM_REDE = [5000, 15000, 30000, 60000];
function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
function enviarComPaciencia(tentativa) {
  return enviarFila('segundo plano').then(function (r) {
    if (r && (r.semRede || r.servidorFora) && tentativa < ESPERAS_SEM_REDE.length)
      return esperar(ESPERAS_SEM_REDE[tentativa]).then(function () { return enviarComPaciencia(tentativa + 1); });
    if (r) r.tentativa = tentativa + 1;
    return r;
  });
}

self.addEventListener('sync', function (e) {
  if (e.tag !== 'enviar-diarios') return;
  e.waitUntil(enviarComPaciencia(0).then(function (r) {
    var vez = r && r.tentativa > 1 ? ' (na ' + r.tentativa + 'ª tentativa)' : '';
    return anotarSegundoPlano(r && r.ocupado ? 'o app aberto já estava enviando' : r && r.erro ? 'parou: ' + r.erro + vez : (r ? r.enviados : 0) + ' diário(s) enviado(s)' + vez).then(function () {
      return avisarAsTelas();
    }).then(function () {
      if (r && (r.semRede || r.servidorFora)) throw new Error('sem rede: o navegador tenta de novo');
    });
  }, function (erro) {
    return anotarSegundoPlano('falhou: ' + (erro && erro.message)).then(function () { throw erro; });
  }));
});

/* O app aberto relê a fila quando o segundo plano mexeu nela. */
function avisarAsTelas() {
  return self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ fila: true }); }); }).catch(function () { });
}

/* As 10 últimas vezes que o Android acordou o app: sem isso não se sabe se ele
   nunca acordou ou se acordou e o envio falhou (07/10/2026). */
function anotarSegundoPlano(resultado) {
  return lerConfig('segundoPlano').then(function (l) {
    return gravarConfig('segundoPlano', (l || []).concat([{ quando: new Date().toISOString(), resultado: resultado }]).slice(-10));
  }).catch(function () { });
}
