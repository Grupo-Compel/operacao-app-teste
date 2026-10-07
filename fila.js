/* fila.js — app de teste da Operação. O que roda tanto na tela quanto no
   "service worker" (o pedaço do app que o Android acorda sozinho quando o
   sinal volta): o banco do celular, a fila de envio e a conta do UTM.

   POR QUE UM ARQUIVO SÓ PARA OS DOIS: o envio em segundo plano e o botão
   "Enviar agora" têm de fazer exatamente a mesma coisa. Duas cópias do envio
   seriam a família 2 do 02_LICOES (a mesma regra em dois lugares, e só um
   aprende). */

var VERSAO_APP = '1 · 06/10/2026';
var BANCO = 'operacao-teste';

function abrirBanco() {
  return new Promise(function (ok, falha) {
    var p = indexedDB.open(BANCO, 1);
    p.onupgradeneeded = function () {
      var db = p.result;
      if (!db.objectStoreNames.contains('registros')) db.createObjectStore('registros', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' });
    };
    p.onsuccess = function () { ok(p.result); };
    p.onerror = function () { falha(p.error); };
  });
}

function noBanco(loja, modo, faz) {
  return abrirBanco().then(function (db) {
    return new Promise(function (ok, falha) {
      var t = db.transaction(loja, modo), resultado;
      var req = faz(t.objectStore(loja));
      if (req) req.onsuccess = function () { resultado = req.result; };
      t.oncomplete = function () { db.close(); ok(resultado); };
      t.onerror = function () { db.close(); falha(t.error); };
      t.onabort = function () { db.close(); falha(t.error || new Error('gravação cancelada')); };
    });
  });
}

function guardarRegistro(r) { return noBanco('registros', 'readwrite', function (s) { return s.put(r); }); }
function listarRegistros() {
  return noBanco('registros', 'readonly', function (s) { return s.getAll(); })
    .then(function (l) { return (l || []).sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; }); });
}
function lerConfig(chave) {
  return noBanco('config', 'readonly', function (s) { return s.get(chave); }).then(function (x) { return x ? x.valor : null; });
}
function gravarConfig(chave, valor) { return noBanco('config', 'readwrite', function (s) { return s.put({ chave: chave, valor: valor }); }); }

/* A foto fica guardada como arquivo (Blob) e só vira texto na hora de enviar:
   guardar como texto ocuparia um terço a mais no celular. */
function blobParaDataUrl(blob) {
  return blob.arrayBuffer().then(function (buf) {
    var bytes = new Uint8Array(buf), partes = [], PEDACO = 0x8000;
    for (var i = 0; i < bytes.length; i += PEDACO) partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO)));
    return 'data:image/jpeg;base64,' + btoa(partes.join(''));
  });
}

var enviandoAgora = false;

/**
 * Envia o que está pendente, um registro por vez, e para no primeiro sinal de
 * que não adianta continuar (sem rede, ou o servidor recusando o código).
 *
 * O QUE CONTA COMO ENVIADO: só a resposta "ok" do servidor. Resposta que não
 * é JSON é quase sempre a página de login do Google -- a implantação não está
 * como "Qualquer pessoa" -- e o registro continua no celular.
 */
function enviarFila(enviadoPor) {
  if (enviandoAgora) return Promise.resolve({ ocupado: true });
  enviandoAgora = true;
  var resumo = { enviados: 0, pendentes: 0, erro: '', semRede: false };
  return lerConfig('servidor').then(function (cfg) {
    if (!cfg || !cfg.url || !cfg.codigo) { resumo.erro = 'Falta a linha de configuração.'; return resumo; }
    return listarRegistros().then(function (todos) {
      var fila = todos.filter(function (r) { return r.estado === 'pendente'; }).reverse();
      var i = 0;
      function proximo() {
        if (i >= fila.length) return Promise.resolve();
        var r = fila[i++];
        r.tentativas = (r.tentativas || 0) + 1;
        var t0 = Date.now();
        return (r.foto ? blobParaDataUrl(r.foto) : Promise.resolve('')).then(function (foto) {
          var corpo = {
            codigo: cfg.codigo, id: r.id, criadoEm: r.criadoEm, enviadoPor: enviadoPor, tentativas: r.tentativas,
            prefixo: r.prefixo, obra: r.obra, quantidade: r.quantidade, nota: r.nota,
            latitude: r.latitude, longitude: r.longitude, utm: r.utm, precisao: r.precisao, rumo: r.rumo,
            foto: foto, versao: VERSAO_APP, medicoes: r.medicoes
          };
          var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var relogio = controle ? setTimeout(function () { controle.abort(); }, 90000) : null;
          return fetch(cfg.url, { method: 'POST', body: JSON.stringify(corpo), redirect: 'follow',
                                  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: controle ? controle.signal : undefined })
            .then(function (resp) { return resp.text(); })
            .then(function (texto) {
              if (relogio) clearTimeout(relogio);
              var j;
              try { j = JSON.parse(texto); }
              catch (e) { throw { servidor: true, msg: 'O servidor não respondeu como esperado. Confira se a implantação está como "Qualquer pessoa".' }; }
              if (j.ok) {
                r.estado = 'enviado'; r.enviadoEm = new Date().toISOString(); r.enviadoPor = enviadoPor;
                r.msEnvio = Date.now() - t0; r.duplicado = !!j.duplicado; r.ultimoErro = '';
                resumo.enviados++;
                return guardarRegistro(r).then(proximo);
              }
              r.ultimoErro = j.erro || 'recusado';
              /* Grande demais ou inválido não melhora tentando de novo. */
              if (j.grandeDemais || /identificador|JPEG/.test(r.ultimoErro)) r.estado = 'recusado';
              return guardarRegistro(r).then(function () {
                if (j.codigoErrado || j.desligado) { resumo.erro = r.ultimoErro; return; }
                return proximo();
              });
            })
            .catch(function (e) {
              if (relogio) clearTimeout(relogio);
              r.ultimoErro = e && e.servidor ? e.msg : 'Sem conexão com o servidor.';
              resumo.erro = r.ultimoErro;
              if (!(e && e.servidor)) resumo.semRede = true;
              return guardarRegistro(r);   // para aqui: o resto também não passaria
            });
        });
      }
      return proximo().then(function () {
        return listarRegistros().then(function (l) {
          resumo.pendentes = l.filter(function (r) { return r.estado === 'pendente'; }).length;
          return resumo;
        });
      });
    });
  }).then(function (x) { enviandoAgora = false; return x; }, function (e) { enviandoAgora = false; throw e; });
}

/**
 * Latitude e longitude (WGS84) para UTM, o sistema que a marca d'água das fotos
 * da Energisa usa (conceito 21.1). Fórmulas de Snyder (USGS, 1987), as de
 * qualquer GPS. Conferida em 06/10/2026 contra a biblioteca pyproj em pontos de
 * Dourados, São Gonçalo, Vilhena e Colniza: diferença abaixo de 1 m.
 */
function utmDe(lat, lon) {
  var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  var e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  var zona = Math.floor((lon + 180) / 6) + 1;
  var lon0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
  var fi = lat * Math.PI / 180, la = lon * Math.PI / 180;
  var N = a / Math.sqrt(1 - e2 * Math.sin(fi) * Math.sin(fi));
  var T = Math.tan(fi) * Math.tan(fi), C = ep2 * Math.cos(fi) * Math.cos(fi), A = Math.cos(fi) * (la - lon0);
  var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * fi
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * fi)
    + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * fi)
    - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * fi));
  var leste = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
  var norte = k0 * (M + N * Math.tan(fi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
  if (lat < 0) norte += 10000000;
  var letras = 'CDEFGHJKLMNPQRSTUVWX';
  var letra = letras.charAt(Math.max(0, Math.min(19, Math.floor((lat + 80) / 8))));
  return { zona: zona, letra: letra, leste: Math.round(leste), norte: Math.round(norte),
           texto: zona + letra + ' ' + Math.round(leste) + ' ' + Math.round(norte) };
}
