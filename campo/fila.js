/* fila.js — app do encarregado (Operação, etapa 5a, 13/10/2026).
   O que roda na tela E no "service worker" (o pedaço que o Android acorda
   sozinho quando o sinal volta): o banco do celular e o envio.

   UM ARQUIVO SÓ PARA OS DOIS: o envio em segundo plano e o botão "Enviar agora"
   têm de fazer exatamente a mesma coisa (a lição do app de teste, 07/10/2026).

   NADA DE DADO DA COMPEL NESTE ARQUIVO, nem endereço do servidor: tudo isso
   chega no celular (o link do supervisor e o pacote do dia) e fica só nele. */

var VERSAO_APP = '5e.2 · 20/10/2026';
var BANCO = 'operacao-campo';

function abrirBanco() {
  return new Promise(function (ok, falha) {
    var p = indexedDB.open(BANCO, 1);
    p.onupgradeneeded = function () {
      var db = p.result;
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' });
      if (!db.objectStoreNames.contains('diarios')) db.createObjectStore('diarios', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' });
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

function lerConfig(chave) { return noBanco('config', 'readonly', function (s) { return s.get(chave); }).then(function (x) { return x ? x.valor : null; }); }
function gravarConfig(chave, valor) { return noBanco('config', 'readwrite', function (s) { return s.put({ chave: chave, valor: valor }); }); }
function guardarDiario(d) { d.mudadoEm = new Date().toISOString(); return noBanco('diarios', 'readwrite', function (s) { return s.put(d); }); }
function lerDiario(id) { return noBanco('diarios', 'readonly', function (s) { return s.get(id); }); }
function listarDiarios() { return noBanco('diarios', 'readonly', function (s) { return s.getAll(); }).then(function (l) { return l || []; }); }
function apagarDiario(id) { return noBanco('diarios', 'readwrite', function (s) { return s.delete(id); }); }
function guardarFoto(f) { return noBanco('fotos', 'readwrite', function (s) { return s.put(f); }); }
function lerFoto(id) { return id ? noBanco('fotos', 'readonly', function (s) { return s.get(id); }) : Promise.resolve(null); }
function apagarFoto(id) { return id ? noBanco('fotos', 'readwrite', function (s) { return s.delete(id); }) : Promise.resolve(); }

/* A foto fica como arquivo (Blob) e só vira texto na hora de enviar: como
   texto, ocuparia um terço a mais no celular. */
function blobParaDataUrl(blob) {
  return blob.arrayBuffer().then(function (buf) {
    var bytes = new Uint8Array(buf), partes = [], PEDACO = 0x8000;
    for (var i = 0; i < bytes.length; i += PEDACO) partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO)));
    return 'data:image/jpeg;base64,' + btoa(partes.join(''));
  });
}

/* O pacote que o servidor confere (o mesmo da tela "Lançar PS em papel"). */
function pacoteDoDiario(d) {
  var x = d.form;
  return { id: d.id, dia: d.dia, prefixo: x.prefixo, matEnc: x.matEnc, nomeEnc: x.nomeEnc, tipoDia: x.tipoDia, placa: x.placa,
    expIni: x.expIni, expFim: x.expFim, almIni: x.almIni, almFim: x.almFim,
    pessoas: x.pessoas.filter(function (p) { return p.estado === 'foi'; }).map(function (p) { return { mat: p.mat, nome: p.nome }; }),
    faltaram: x.pessoas.filter(function (p) { return p.estado === 'faltou'; }).map(function (p) { return p.mat; }),
    dds: x.dds, ddsHora: x.ddsHora, ddsQuem: x.ddsQuem, contrato: x.contrato, obra: x.tipoDia === 'PLANTAO' ? '' : x.obra, municipio: x.municipio,
    atividade: x.atividade, processo: x.processo, status: x.status, ini: x.ini, fim: x.fim, alim: x.alim, ponto: x.ponto,
    codigos: x.tipoDia === 'PRODUCAO' ? x.codigos.filter(function (c) { return c.cod || c.qtd; }).map(function (c) { return { cod: c.cod, qtd: c.qtd, adc: c.adc, origem: 'Encarregado' }; }) : [],
    hhExtra: x.hhExtra, hhAdc: x.hhAdc, observacoes: x.observacoes,
    km: { saidaBase: x.kmSaida || '', chegadaCanteiro: x.kmChegada || '' }, fotos: [],
    /* 5b: a execução da obra (só na produção). O dia em horários vai à parte, no envio. */
    execucao: x.tipoDia === 'PRODUCAO' ? x.execucao || null : null };
}

/*
 * 5c: o book do diário, no formato das regras do servidor (validarBookDoApp):
 * as estruturas com a observação e as fotos com o lugar, a etiqueta e o item.
 * d.book.fotos é { 'lugar|etiqueta|item': id da foto no celular }; o ID é o
 * mesmo no servidor (a foto sobe com ele), e é por ele que o diário aponta.
 */
function retratoDoBook(d) {
  var b = d.book || {}, fotos = b.fotos || {}, est = b.estruturas || {};
  return {
    estruturas: Object.keys(est).filter(function (k) { return String(est[k].obs || '').trim(); }).map(function (k) { return { id: k, obs: String(est[k].obs).trim() }; }),
    fotos: Object.keys(fotos).filter(function (k) { return fotos[k]; }).map(function (k) { var c = k.split('|'); return { id: fotos[k], lugar: c[0], etiqueta: c[1], item: c.slice(2).join('|') }; })
  };
}

/* Um pedido ao servidor. Texto puro (JSON), e não "application/json": é o que
   deixa o navegador do celular falar com o Apps Script sem a pergunta prévia
   (CORS) que ele não responde. Resposta que não é JSON é a tela de login do
   Google (implantação fora de "Qualquer pessoa"): não conta como resposta. */
function postar(url, corpo, ms) {
  var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var relogio = controle ? setTimeout(function () { controle.abort(); }, ms || 90000) : null;
  corpo.app = 'campo'; corpo.versao = VERSAO_APP;
  /* 6e (15/10/2026): o relógio e o fuso do celular na hora do envio. O servidor compara com o dele: a hora
     do toque só vale se o relógio do celular estava certo, e o fuso diz que hora local o toque marcou
     (Dourados é UTC−4; o Rio, UTC−3). */
  corpo.relogio = new Date().toISOString(); corpo.fuso = new Date().getTimezoneOffset();
  return fetch(url, { method: 'POST', body: JSON.stringify(corpo), redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                      signal: controle ? controle.signal : undefined })
    .then(function (resp) { return resp.text(); })
    .then(function (texto) {
      if (relogio) clearTimeout(relogio);
      try { return JSON.parse(texto); }
      catch (e) { throw { servidor: true, msg: 'O servidor não respondeu como esperado (a implantação precisa estar como "Qualquer pessoa").' }; }
    }, function (e) {
      if (relogio) clearTimeout(relogio);
      var comSinal = typeof navigator !== 'undefined' && navigator.onLine;
      /* COM SINAL E SEM RESPOSTA NÃO QUER DIZER "NÃO CHEGOU" (07/10/2026, 20:39):
         o servidor pode ter gravado e a resposta se perdido. Por isso o ID de
         cada foto e de cada diário nasce aqui, e o servidor não grava duas vezes. */
      throw { rede: true, comSinal: comSinal, msg: comSinal ? 'Com sinal, mas a resposta do servidor não chegou. Vai de novo (se já tinha chegado, o servidor não duplica).' : 'Sem sinal.' };
    });
}

var enviandoAgora = false;

/* UMA TRAVA SÓ PARA A TELA E O SEGUNDO PLANO (navigator.locks): os dois mandariam
   o mesmo diário pela mesma rede fraca (o app de teste mostrou, 08/10/2026). */
function enviarFila(enviadoPor) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request('operacao-campo-enviar', { ifAvailable: true }, function (trava) {
      if (!trava) return { ocupado: true };
      return enviarDentroDaTrava(enviadoPor);
    });
  }
  return enviarDentroDaTrava(enviadoPor);
}

/*
 * Para cada diário encerrado, na ordem em que foi encerrado: primeiro as fotos
 * (frente e verso do PS, e o rosto), cada uma guardando o ID que o servidor
 * deu; depois o diário, com esses IDs. Para no primeiro sinal de que não
 * adianta continuar (sem rede, celular cortado).
 */
function enviarDentroDaTrava(enviadoPor) {
  if (enviandoAgora) return Promise.resolve({ ocupado: true });
  enviandoAgora = true;
  var resumo = { enviados: 0, recusados: 0, pendentes: 0, erro: '', semRede: false, servidorFora: false, desligado: false };
  var fim = function (x) { enviandoAgora = false; return x; };
  return lerConfig('servidor').then(function (cfg) {
    if (!cfg || !cfg.url || !cfg.token) { resumo.erro = 'Este celular ainda não está ligado.'; return resumo; }
    /* Desligado (cortado na tela do supervisor): não adianta insistir até ligar de novo. */
    if (cfg.desligado) { resumo.erro = 'Este celular foi desligado do sistema: peça um código novo ao supervisor.'; resumo.desligado = true; return resumo; }
    /* 5d: no celular da equipe, cada diário sobe com a sessão de quem o encerrou. */
    return Promise.all([listarDiarios(), lerConfig('pessoas')]).then(function (v) {
      var todos = v[0], pessoas = v[1] || {};
      var sessaoDe = function (d) { return cfg.login ? ((pessoas[String(d.form.matEnc || '').replace(/\D/g, '').replace(/^0+/, '')] || {}).sessao || '') : ''; };
      var fila = todos.filter(function (d) { return d.estado === 'encerrado'; }).sort(function (a, b) { return a.encerradoEm < b.encerradoEm ? -1 : 1; });
      var i = 0, parar = false, refeito = {};
      function proximo() {
        if (parar || i >= fila.length) return Promise.resolve();
        var d = fila[i++], ss = sessaoDe(d);
        if (cfg.login && !ss) { d.ultimoErro = 'Para este diário subir, ' + (d.form.nomeEnc || 'quem o encerrou') + ' precisa entrar neste celular com sinal.'; resumo.erro = d.ultimoErro; return guardarDiario(d).then(proximo); }
        d.tentativas = (d.tentativas || 0) + 1;
        return enviarFotosDoDiario(cfg, d, ss).then(function () {
          var p = pacoteDoDiario(d);
          p.fotos = [d.arquivos.PS_FRENTE, d.arquivos.PS_VERSO];
          var rb = d.form.tipoDia === 'PRODUCAO' ? retratoDoBook(d) : { estruturas: [], fotos: [] };
          return postar(cfg.url, { acao: 'lancamento', token: cfg.token, sessao: ss, pacote: p, rosto: d.arquivos.ROSTO, criadoEm: d.encerradoEm, enviadoPor: enviadoPor, tentativas: d.tentativas,
                                   dia: d.diaEnviado || null, book: { estruturas: rb.estruturas, fotos: rb.fotos.map(function (f) { return f.id; }) },
                                   /* 5e: a APR da folha (só na produção; a do plantão e do homem-hora não vai). */
                                   apr: d.apr || null });
        }).then(function (r) {
          d.resposta = r; d.ultimoErro = '';
          if (r.ok) { d.estado = 'enviado'; d.enviadoEm = new Date().toISOString(); d.enviadoPor = enviadoPor; resumo.enviados++; }
          else if (r.semSessao) { d.ultimoErro = 'A entrada de ' + (d.form.nomeEnc || 'quem encerrou') + ' venceu: ele precisa entrar neste celular de novo, com sinal. ' + (r.erro || ''); resumo.erro = d.ultimoErro; }
          else if (r.desligado) { d.estado = 'encerrado'; d.ultimoErro = r.erro; resumo.desligado = true; resumo.erro = r.erro; parar = true; }
          else if (r.jaLancada) { d.estado = 'jaLancado'; d.ultimoErro = r.erro; }
          /* O servidor não tem as fotos DESTE celular (ligado de novo depois de
             mandá-las, por exemplo): vão de novo, na mesma vez, uma vez só. */
          else if (r.faltaFoto) { d.arquivos = {}; d.ultimoErro = r.erro; if (!refeito[d.id]) { refeito[d.id] = 1; i--; } }
          else if (r.erros) { d.estado = 'recusado'; d.ultimoErro = r.erro; resumo.recusados++; }
          else { d.ultimoErro = r.erro || 'recusado'; resumo.erro = d.ultimoErro; }
          return guardarDiario(d).then(proximo);
        }, function (e) {
          d.ultimoErro = e && e.msg ? e.msg : String(e && e.message || e);
          /* A sessão de uma pessoa venceu: os diários dos outros seguem. */
          if (e && e.semSessao) { resumo.erro = d.ultimoErro; return guardarDiario(d).then(proximo); }
          resumo.erro = d.ultimoErro;
          if (e && e.desligado) { resumo.desligado = true; }
          else if (e && e.rede) { if (e.comSinal) resumo.servidorFora = true; else resumo.semRede = true; }
          parar = true;
          return guardarDiario(d);
        });
      }
      return proximo().then(function () {
        /* O desligado fica anotado aqui, e não só na tela: o segundo plano também recebe a resposta. */
        if (resumo.desligado) { cfg.desligado = true; cfg.motivoDesligado = resumo.erro; return gravarConfig('servidor', cfg); }
      }).then(function () {
        return listarDiarios().then(function (l) {
          resumo.pendentes = l.filter(function (d) { return d.estado === 'encerrado'; }).length;
          return resumo;
        });
      });
    });
  }).then(fim, function (e) { fim(); throw e; });
}

/* As fotos de um diário que ainda não têm o ID do servidor (5c: e as do book, só na produção). */
function enviarFotosDoDiario(cfg, d, sessao) {
  d.arquivos = d.arquivos || {};
  var tipos = [['PS_FRENTE', d.fotos && d.fotos.FRENTE], ['PS_VERSO', d.fotos && d.fotos.VERSO]];
  if (d.form.tipoDia === 'PRODUCAO') retratoDoBook(d).fotos.forEach(function (f) { tipos.push(['BOOK|' + f.lugar + '|' + f.etiqueta + '|' + f.item, f.id, f]); });
  /* 6d: as fotos trocadas sobem como histórico do book. Não entram no diário, e não seguram o envio: a que sumiu do
     celular, ou que o servidor recusou, fica de fora (o diário vale sem ela). */
  if (d.form.tipoDia === 'PRODUCAO') ((d.book || {}).trocadas || []).forEach(function (t) {
    var c = String(t.chave).split('|');
    tipos.push(['TROCADA|' + t.id, t.id, { lugar: c[0], etiqueta: c[1], item: c.slice(2).join('|'), historico: true }]);
  });
  tipos.push(['ROSTO', d.rosto]);
  var k = 0;
  function proxima() {
    if (k >= tipos.length) return Promise.resolve();
    var t = tipos[k++];
    if (d.arquivos[t[0]] || !t[1]) return proxima();
    return lerFoto(t[1]).then(function (f) {
      if ((!f || !f.blob) && t[2] && t[2].historico) return { ok: true, arquivoId: 'SUMIU' };
      if (!f || !f.blob) throw { msg: 'A foto ' + (t[2] ? t[2].lugar + ' · ' + t[2].etiqueta + ' · ' + t[2].item : t[0]) + ' sumiu do celular: abra o diário, tire de novo e encerre outra vez.' };
      return blobParaDataUrl(f.blob).then(function (dados) {
        var corpo = { acao: 'foto', token: cfg.token, sessao: sessao || '', id: f.id, tipo: t[2] ? 'BOOK' : t[0], dia: d.dia, prefixo: d.form.prefixo, obra: d.form.obra, dados: dados };
        if (t[2]) { var m = f.meta || {}; Object.assign(corpo, { lugar: t[2].lugar, etiqueta: t[2].etiqueta, item: t[2].item, idDiario: d.id, lat: m.lat, lon: m.lon, precisao: m.precisao, tiradaEm: m.tiradaEm }); }
        return postar(cfg.url, corpo);
      });
    }).then(function (r) {
      if (r.ok) { d.arquivos[t[0]] = r.arquivoId; return guardarDiario(d).then(proxima); }
      if (t[2] && t[2].historico && !r.desligado && !r.semSessao) { d.arquivos[t[0]] = 'RECUSADA'; return guardarDiario(d).then(proxima); }
      if (r.desligado) throw { desligado: true, msg: r.erro };
      if (r.semSessao) throw { semSessao: true, msg: 'A entrada de ' + (d.form.nomeEnc || 'quem encerrou') + ' venceu: ele precisa entrar neste celular de novo, com sinal.' };
      throw { msg: 'Foto ' + (t[2] ? t[2].lugar + ' · ' + t[2].etiqueta : t[0]) + ': ' + (r.erro || 'recusada') };
    });
  }
  return proxima();
}
