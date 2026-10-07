/* app.js — app de teste da Operação: a tela.

   O QUE ESTE APP EXISTE PARA MEDIR (plano, etapa 0; conceito 5.3, 22.3, 24.1):
   abre sem sinal? guarda foto e registro sem sinal? quanto pesa a foto
   reduzida? o GPS acha posição sem dados móveis, e com que precisão? a bússola
   do aparelho dá o rumo? o envio acontece sozinho quando o sinal volta, com o
   app aberto e com o app fechado? Cada registro leva essas medições junto, e
   elas chegam na aba APP_TESTE: o número sai do celular de verdade, e não de
   simulação no computador (28/09).

   NADA AQUI É DADO REAL. O código de teste só grava na aba APP_TESTE. */

var $ = function (id) { return document.getElementById(id); };
var estado = { cfg: null, foto: null, fotoMed: null, gps: null, gpsInicio: 0, msGps: null, rumo: null, msAbrir: 0, fotoPosicao: null };

var LADO_MAXIMO = [1600, 1280];          // conceito 22.3: 150 a 200 KB bastam para o book
var TETO_FOTO = 200 * 1024;

function mostra(id, sim) { $(id).classList.toggle('oculto', !sim); }
function aviso(id, texto, tipo) { var a = $(id); a.textContent = texto; a.className = 'aviso' + (tipo ? ' ' + tipo : ''); mostra(id, !!texto); }
function hora(iso) { var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR').slice(0, 5); }
function novoId() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 12);
}
function aparelho() {
  var ua = navigator.userAgent;
  var m = /Android\s([\d.]+)/.exec(ua);
  if (m) return 'Android ' + m[1];
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone';
  return 'outro (' + (navigator.platform || '?') + ')';
}
function instalado() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function seg(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
function pontoCardeal(g) { return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8]; }

// ---------------------------------------------------------------- rede
function desenharRede() {
  var on = navigator.onLine;
  $('chipRede').textContent = on ? 'com sinal' : 'sem sinal';
  $('chipRede').className = 'chip ' + (on ? 'com' : 'sem');
  $('chipInstalado').textContent = instalado() ? 'instalado' : 'no navegador';
}
window.addEventListener('online', function () { desenharRede(); enviar('voltou o sinal'); });
window.addEventListener('offline', desenharRede);

// ---------------------------------------------------------------- configuração
/* Uma linha só (URL#código), copiada do menu da planilha: digitar no celular
   uma URL de 100 caracteres é onde o teste morreria antes de começar. */
function lerLinhaDeConfig(linha) {
  linha = String(linha || '').trim();
  /* SÓ O CÓDIGO (07/10): o menu da planilha deixou de mostrar a URL, porque
     a que o Google devolvia era de uma implantação arquivada. Celular já
     configurado guarda o endereço e troca só o código. */
  if (/^[a-f0-9]{12}$/i.test(linha)) {
    if (estado.cfg && estado.cfg.url) return { url: estado.cfg.url, codigo: linha };
    return { erro: 'Primeira vez neste celular: cole a URL do app da Web (termina em /exec), o sinal # e o código.' };
  }
  var p = linha.lastIndexOf('#');
  if (p < 0) return { erro: 'A linha precisa ter a URL, o sinal # e o código.' };
  var url = linha.slice(0, p).trim(), codigo = linha.slice(p + 1).trim();
  if (/\/dev$/.test(url)) return { erro: 'Essa URL termina em /dev (é a de teste do editor). Use a que termina em /exec, do "Gerenciar implantações".' };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/\s]+\/exec$/.test(url)) return { erro: 'A URL não parece a do app da Web (https://script.google.com/macros/s/…/exec).' };
  if (!/^[a-f0-9]{12}$/i.test(codigo)) return { erro: 'O código depois do # precisa ter 12 letras e números.' };
  return { url: url, codigo: codigo };
}
$('btConfig').addEventListener('click', function () {
  var c = lerLinhaDeConfig($('linhaConfig').value);
  if (c.erro) { aviso('avisoConfig', c.erro, 'erro'); return; }
  gravarConfig('servidor', c).then(function () {
    estado.cfg = c; mostra('painelConfig', false); aviso('avisoConfig', '');
    desenharFila(); enviar('app aberto');
  });
});
$('lnkConfig').addEventListener('click', function (e) { e.preventDefault(); mostra('painelConfig', true); $('linhaConfig').focus(); });

// ---------------------------------------------------------------- GPS
/* Liga ao abrir, e não ao tirar a foto: o primeiro "fix" sem dados móveis
   pode levar dezenas de segundos, e é um dos números que o teste mede. */
function ligarGps() {
  if (!('geolocation' in navigator)) { $('estadoGps').textContent = 'este aparelho não tem GPS para o navegador.'; return; }
  estado.gpsInicio = performance.now();
  navigator.geolocation.watchPosition(function (p) {
    if (estado.msGps === null) estado.msGps = Math.round(performance.now() - estado.gpsInicio);
    var g = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy) };
    if (!estado.gps || g.precisao <= estado.gps.precisao || Date.now() - estado.gps.quando > 30000) { g.quando = Date.now(); estado.gps = g; }
    var u = utmDe(estado.gps.lat, estado.gps.lon);
    $('estadoGps').textContent = 'posição achada' + (estado.gps.precisao > 30 ? ' (precisão fraca: vá para céu aberto)' : '');
    $('medidaGps').innerHTML = '<dt>UTM</dt><dd>' + u.texto + '</dd><dt>lat, long</dt><dd>' + estado.gps.lat.toFixed(6) + ', ' + estado.gps.lon.toFixed(6) +
      '</dd><dt>precisão</dt><dd>± ' + estado.gps.precisao + ' m</dd><dt>1ª posição em</dt><dd>' + seg(estado.msGps) + '</dd>';
    mostra('medidaGps', true);
  }, function (e) {
    $('estadoGps').textContent = e.code === 1 ? 'o GPS foi negado: libere a localização para este app nas configurações do celular.' : 'ainda sem posição (' + e.message + ')';
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
}

// ---------------------------------------------------------------- bússola
/* Android/Chrome entrega "deviceorientationabsolute", em que alpha é o giro em
   relação ao norte; o rumo é 360 - alpha. iPhone entrega webkitCompassHeading,
   e só depois de a pessoa tocar num botão (pedido de permissão). Com o app
   travado em retrato (manifest), não há giro de tela a descontar. */
var bussolaRecebeu = false;
function aoGirar(rumo) {
  bussolaRecebeu = true;
  estado.rumo = Math.round((rumo % 360 + 360) % 360);
  $('rumo').textContent = estado.rumo + '° ' + pontoCardeal(estado.rumo);
  $('estadoBussola').textContent = '';
}
function ligarBussola() {
  window.addEventListener('deviceorientationabsolute', function (e) { if (e.alpha !== null && e.alpha !== undefined) aoGirar(360 - e.alpha); });
  window.addEventListener('deviceorientation', function (e) { if (typeof e.webkitCompassHeading === 'number') aoGirar(e.webkitCompassHeading); });
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') mostra('btBussola', true);
  setTimeout(function () { if (!bussolaRecebeu) $('estadoBussola').textContent = 'o sensor não respondeu neste aparelho.'; }, 4000);
}
$('btBussola').addEventListener('click', function () {
  DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') mostra('btBussola', false); });
});

// ---------------------------------------------------------------- foto
function carregarImagem(arquivo) {
  if (self.createImageBitmap) {
    return createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(arquivo); });
  }
  return new Promise(function (ok, falha) {
    var img = new Image(); img.onload = function () { ok(img); }; img.onerror = falha; img.src = URL.createObjectURL(arquivo);
  });
}
function paraBlob(canvas, q) { return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', q); }); }

/* A marca d'água vai GRAVADA na imagem (conceito 21.2): o book é impresso, e
   texto ao lado da foto se perde. */
function marcaDagua(ctx, w, h) {
  var g = estado.gps, linhas = [new Date().toLocaleString('pt-BR') + (estado.rumo !== null ? '   rumo ' + estado.rumo + '° ' + pontoCardeal(estado.rumo) : '')];
  linhas.push(g ? utmDe(g.lat, g.lon).texto + '   ± ' + g.precisao + ' m' : 'sem posição do GPS');
  linhas.push([$('obra').value.trim(), $('etapa').value, $('prefixo').value.trim(), ($('ponto').value.trim().toUpperCase() || 'GERAL') + ' ' + $('campo').value].filter(Boolean).join('   ·   '));
  var fonte = Math.max(14, Math.round(w / 42)), alto = Math.round(fonte * 1.35 * linhas.length + fonte * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, h - alto, w, alto);
  ctx.fillStyle = '#fff'; ctx.font = '600 ' + fonte + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
  linhas.forEach(function (t, i) { ctx.fillText(t, Math.round(fonte * 0.6), h - alto + Math.round(fonte * 0.4) + i * Math.round(fonte * 1.35)); });
}

function processarFoto(arquivo) {
  var t0 = performance.now();
  return carregarImagem(arquivo).then(function (img) {
    var w0 = img.width, h0 = img.height, tentativas = [];
    LADO_MAXIMO.forEach(function (lado) { [0.72, 0.6, 0.5, 0.4].forEach(function (q) { tentativas.push([lado, q]); }); });
    var i = 0, ultimo = null;
    function tenta() {
      var lado = tentativas[i][0], q = tentativas[i][1];
      var esc = Math.min(1, lado / Math.max(w0, h0));
      var c = document.createElement('canvas');
      c.width = Math.round(w0 * esc); c.height = Math.round(h0 * esc);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      marcaDagua(ctx, c.width, c.height);
      return paraBlob(c, q).then(function (b) {
        ultimo = { blob: b, largura: c.width, altura: c.height, qualidade: q };
        i++;
        if (b.size <= TETO_FOTO || i >= tentativas.length) return ultimo;
        return tenta();
      });
    }
    return tenta().then(function (r) {
      if (img.close) img.close();
      r.ms = Math.round(performance.now() - t0); r.kbOriginal = Math.round(arquivo.size / 1024);
      return r;
    });
  });
}

$('arquivoFoto').addEventListener('change', function () {
  var arq = this.files && this.files[0];
  if (!arq) return;
  aviso('avisoGuardar', 'preparando a foto…');
  processarFoto(arq).then(function (r) {
    estado.foto = r.blob; estado.fotoMed = r;
    estado.fotoPosicao = estado.gps ? { lat: estado.gps.lat, lon: estado.gps.lon, precisao: estado.gps.precisao } : null;
    $('previa').src = URL.createObjectURL(r.blob); mostra('previa', true);
    $('medidaFoto').innerHTML = '<dt>original</dt><dd>' + r.kbOriginal + ' KB</dd><dt>guardada</dt><dd>' + Math.round(r.blob.size / 1024) + ' KB · ' +
      r.largura + '×' + r.altura + ' px</dd><dt>preparo</dt><dd>' + seg(r.ms) + '</dd>';
    mostra('medidaFoto', true); aviso('avisoGuardar', '');
  }).catch(function (e) { aviso('avisoGuardar', 'Não consegui preparar a foto: ' + e.message, 'erro'); });
  this.value = '';
});

// ---------------------------------------------------------------- guardar
$('btGuardar').addEventListener('click', function () {
  var prefixo = $('prefixo').value.trim(), obra = $('obra').value.trim(), etapa = $('etapa').value;
  /* O prefixo só é exigido na execução: é a equipe que fotografa. Na
     viabilidade e no fechamento quem fotografa não é uma equipe de obra. */
  if (!obra) { aviso('avisoGuardar', 'O número da obra é obrigatório.', 'erro'); return; }
  if (etapa === 'EXEC' && !prefixo) { aviso('avisoGuardar', 'Na execução, o prefixo da equipe é obrigatório.', 'erro'); return; }
  var pos = estado.fotoPosicao || estado.gps;
  espacoLivreMb().then(function (livre) {
    var r = {
      id: novoId(), criadoEm: new Date().toISOString(), estado: 'pendente', tentativas: 0,
      base: $('base').value, etapa: etapa, ponto: $('ponto').value.trim().toUpperCase() || 'GERAL', campo: $('campo').value,
      prefixo: prefixo, obra: obra, quantidade: $('quantidade').value.trim(), nota: $('nota').value.trim(),
      latitude: pos ? pos.lat.toFixed(6) : '', longitude: pos ? pos.lon.toFixed(6) : '',
      utm: pos ? utmDe(pos.lat, pos.lon).texto : '', precisao: pos ? pos.precisao : '', rumo: estado.rumo === null ? '' : estado.rumo,
      foto: estado.foto || null,
      medicoes: { msGps: estado.msGps, fotoLargura: estado.fotoMed ? estado.fotoMed.largura : '', msFoto: estado.fotoMed ? estado.fotoMed.ms : '',
                  aparelho: aparelho(), instalado: instalado() ? 'sim' : 'não', msAbrir: estado.msAbrir, espacoLivreMb: livre }
    };
    gravarConfig('ultimos', { base: r.base, etapa: r.etapa }).catch(function () { });
    return guardarRegistro(r).then(function () {
      aviso('avisoGuardar', 'Guardado no celular' + (navigator.onLine ? '. Enviando…' : '. Vai sozinho quando houver sinal.'), 'ok');
      estado.foto = null; estado.fotoMed = null; estado.fotoPosicao = null;
      $('quantidade').value = ''; $('nota').value = ''; mostra('previa', false); mostra('medidaFoto', false);
      pedirEnvioEmSegundoPlano();
      return desenharFila().then(function () { if (navigator.onLine) enviar('app aberto'); });
    });
  }).catch(function (e) { aviso('avisoGuardar', 'NÃO GUARDOU: ' + e.message, 'erro'); });
});

function pedirEnvioEmSegundoPlano() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(function (reg) { if (reg.sync) return reg.sync.register('enviar-fila'); }).catch(function () { });
}

// ---------------------------------------------------------------- fila
function desenharFila() {
  return listarRegistros().then(function (l) {
    var pend = l.filter(function (r) { return r.estado === 'pendente'; }).length;
    var env = l.filter(function (r) { return r.estado === 'enviado'; }).length;
    $('chipFila').textContent = 'fila: ' + pend;
    $('resumoFila').textContent = l.length ? pend + ' aguardando · ' + env + ' enviado(s)' + (l.length - pend - env ? ' · ' + (l.length - pend - env) + ' recusado(s)' : '') : 'nenhum registro ainda.';
    $('listaFila').innerHTML = l.slice(0, 50).map(function (r) {
      var kb = r.foto ? Math.round(r.foto.size / 1024) + ' KB' : 'sem foto';
      var est = r.estado === 'enviado'
        ? '<span class="estado enviado">enviado ' + hora(r.enviadoEm) + ' · ' + r.enviadoPor + ' · ' + seg(r.msEnvio) + (r.duplicado ? ' · já estava lá' : '') + '</span>'
        : r.estado === 'recusado' ? '<span class="estado recusado">recusado</span>'
        : '<span class="estado pendente">guardado, aguardando sinal' + (r.tentativas ? ' · ' + r.tentativas + ' tentativa(s)' : '') + '</span>';
      var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      return '<li data-id="' + esc(r.id) + '"><b>' + esc(r.obra) + '</b>' + (r.etapa ? ' · ' + esc(r.etapa) + ' · ' + esc(r.ponto) + ' ' + esc(r.campo) : '') + (r.prefixo ? ' · ' + esc(r.prefixo) : '') + (r.quantidade ? ' · qtd ' + esc(r.quantidade) : '') +
        '<div class="suave">' + hora(r.criadoEm) + ' · ' + kb + (r.utm ? ' · ' + esc(r.utm) : '') + '</div>' + est +
        (r.ultimoErro && r.estado !== 'enviado' ? '<div class="suave">' + esc(r.ultimoErro) + '</div>' : '') + '</li>';
    }).join('');
  });
}

function enviar(quem) {
  if (!estado.cfg) return Promise.resolve();
  return enviarFila(quem).then(function (r) {
    if (r.ocupado) return;
    if (r.erro) aviso('avisoEnvio', r.erro + (r.pendentes ? ' Ficaram ' + r.pendentes + ' no celular.' : ''), r.semRede ? '' : 'erro');
    else if (r.enviados) aviso('avisoEnvio', r.enviados + ' enviado(s).', 'ok');
    else aviso('avisoEnvio', '');
    return desenharFila();
  }).catch(function (e) { aviso('avisoEnvio', 'Falha ao enviar: ' + e.message, 'erro'); });
}
$('btEnviar').addEventListener('click', function () {
  if (!estado.cfg) { mostra('painelConfig', true); return; }
  aviso('avisoEnvio', 'enviando…'); enviar('botão');
});
/* TESTAR O SERVIDOR SEM GRAVAR (07/10/2026). O primeiro teste de campo mostrou
   "sem conexão" com sinal, e a aba APP_TESTE vazia. Mandar um registro sem ID
   separa os casos sem escrever nada: o 06_AppTeste.gs confere o código ANTES
   do ID, então se a resposta reclama do ID, o servidor e o código estão
   certos. Se não há resposta legível, o endereço não chega ao doPost. */
function testarServidor() {
  if (!estado.cfg) { mostra('painelConfig', true); return Promise.resolve(); }
  aviso('avisoEnvio', 'testando o servidor…');
  var t0 = Date.now();
  return fetch(estado.cfg.url, { method: 'POST', body: JSON.stringify({ codigo: estado.cfg.codigo, id: '' }), redirect: 'follow',
                                 headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
    .then(function (resp) { return resp.text(); })
    .then(function (texto) {
      var s = ' (' + seg(Date.now() - t0) + ')';
      var j; try { j = JSON.parse(texto); } catch (e) { j = null; }
      if (!j) aviso('avisoEnvio', 'Respondeu uma página, e não o servidor do teste: é a tela de login do Google. A implantação precisa estar como "Qualquer pessoa".' + s, 'erro');
      else if (j.codigoErrado) aviso('avisoEnvio', 'O servidor responde, mas o código é outro. Rode de novo o menu "Ligar o teste do app" e cole a linha nova.' + s, 'erro');
      else if (j.desligado) aviso('avisoEnvio', 'O servidor responde, mas o teste está desligado. Rode o menu "Ligar o teste do app".' + s, 'erro');
      else if (/identificador/.test(j.erro || '')) aviso('avisoEnvio', 'Servidor e código CERTOS. O envio deve funcionar: toque em "Enviar agora".' + s, 'ok');
      else aviso('avisoEnvio', 'O servidor respondeu: ' + (j.erro || JSON.stringify(j)) + s, 'erro');
    })
    .catch(function () {
      aviso('avisoEnvio', navigator.onLine
        ? 'O endereço não chega ao servidor do teste. Em "Gerenciar implantações": a URL de lá é a mesma da linha de configuração? A versão publicada é posterior ao 06_AppTeste.gs ("Nova versão" na MESMA implantação, e não uma implantação nova)?'
        : 'Sem sinal: teste de novo com sinal.', navigator.onLine ? 'erro' : '');
    });
}
$('btTestar').addEventListener('click', testarServidor);

$('btLimpar').addEventListener('click', function () {
  listarRegistros().then(function (l) {
    var enviados = l.filter(function (r) { return r.estado === 'enviado'; });
    return Promise.all(enviados.map(function (r) { return noBanco('registros', 'readwrite', function (s) { return s.delete(r.id); }); }))
      .then(function () { aviso('avisoEnvio', enviados.length + ' registro(s) enviado(s) apagado(s) do celular. Os que não foram enviados ficaram.', 'ok'); return desenharFila(); });
  }).then(medir);
});

// ---------------------------------------------------------------- medições
function espacoLivreMb() {
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve('');
  return navigator.storage.estimate().then(function (e) { return Math.round((e.quota - e.usage) / 1048576); }).catch(function () { return ''; });
}
function medir() {
  var linhas = [['abriu em', seg(estado.msAbrir)], ['aparelho', aparelho()], ['instalado', instalado() ? 'sim' : 'não, aberto no navegador'],
    ['envio em segundo plano', ('serviceWorker' in navigator && 'SyncManager' in window) ? 'disponível' : 'não disponível'],
    ['funciona sem sinal', navigator.serviceWorker && navigator.serviceWorker.controller ? 'sim (cópia guardada)' : 'ainda não: abra uma vez com sinal']];
  var p1 = espacoLivreMb(), p2 = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null);
  /* O Chrome não pergunta nada para o segundo plano: ele tem uma chave nas
     configurações do site ("Sincronização em segundo plano"), ligada de
     fábrica. Esta linha diz como ela está neste aparelho. */
  var p3 = navigator.permissions && navigator.permissions.query
    ? navigator.permissions.query({ name: 'background-sync' }).then(function (x) { return x.state; }, function () { return '?'; })
    : Promise.resolve('?');
  var p4 = lerConfig('segundoPlano').catch(function () { return null; });
  return Promise.all([p1, p2, p3, p4]).then(function (x) {
    linhas.push(['espaço livre para o app', x[0] === '' ? '?' : x[0] + ' MB']);
    linhas.push(['dados protegidos', x[1] === null ? '?' : (x[1] ? 'sim' : 'não (o celular pode apagar se faltar espaço)')]);
    linhas.push(['segundo plano liberado', x[2] === 'granted' ? 'sim' : x[2] === 'denied' ? 'NÃO (Chrome > Configurações do site > Sincronização em segundo plano)' : x[2]]);
    var sp = x[3] || [];
    linhas.push(['o Android acordou o app', sp.length ? sp.slice(-3).reverse().map(function (a) { return hora(a.quando) + ': ' + a.resultado; }).join('<br>') : 'nenhuma vez ainda']);
    $('medicoes').innerHTML = linhas.map(function (l) { return '<dt>' + l[0] + '</dt><dd>' + l[1] + '</dd>'; }).join('');
  });
}
$('btPersistir').addEventListener('click', function () {
  if (!navigator.storage || !navigator.storage.persist) return;
  navigator.storage.persist().then(medir);
});

// ---------------------------------------------------------------- início
if ('serviceWorker' in navigator) {
  var tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(medir).catch(function () { });
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (tinhaControle) mostra('avisoVersao', true); medir(); });
}
$('versao').textContent = VERSAO_APP;
desenharRede();
ligarGps();
ligarBussola();
lerConfig('ultimos').then(function (u) { if (u) { if (u.base) $('base').value = u.base; if (u.etapa) $('etapa').value = u.etapa; } }).catch(function () { });
lerConfig('servidor').then(function (c) {
  estado.cfg = c;
  mostra('painelConfig', !c);
  estado.msAbrir = Math.round(performance.now());
  /* Se ficou registro na fila, o pedido de envio em segundo plano é refeito
     ao abrir: o Android pode ter descartado o pedido anterior. */
  listarRegistros().then(function (l) { if (l.some(function (r) { return r.estado === 'pendente'; })) pedirEnvioEmSegundoPlano(); });
  return Promise.all([desenharFila(), medir()]);
}).then(function () { if (navigator.onLine) return enviar('app aberto'); });
