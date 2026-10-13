/* app.js — app do encarregado (Operação, etapa 5a, 13/10/2026). As quatro
   telas do celular: Hoje (OPE-14), Diário (OPE-15), Encerrar (OPE-16) e
   Envio (OPE-17), com o visual do protótipo 3.4.

   O QUE ESTE ARQUIVO NÃO TEM, DE PROPÓSITO (o repositório é público):
   - nenhuma regra do lançamento: elas chegam no pacote do dia, como texto das
     próprias funções do servidor, e rodam aqui sem sinal (27_AppCampo.gs,
     regrasDoApp). Uma cópia aqui seria a mesma regra em dois lugares, e só um
     aprende (02_LICOES, família 2);
   - nenhum dado da Compel nem endereço do servidor: o endereço chega no link
     do supervisor, e os dados no pacote, e ficam só no celular.

   SEM LOGIN (Dalton, 13/10/2026: "Podemos fazer o app sem login, para
   facilitar"): o celular é ligado UMA vez, com o código de 6 números que o
   supervisor gera na tela "Aparelhos do campo" (OPE-31). Depois disso, a chave
   fica guardada aqui. Quem assina o dia é a foto do rosto, tirada ao encerrar
   ("tirar apenas uma foto da facial para registrar que é o encarregado"). */

// ---------------------------------------------------------------- estado
var E = {
  cfg: null,            // { url, token, aparelho, mat, nome, base, ligadoEm, desligado }
  aba: 'hoje',
  dia: '',              // o dia que a aba Hoje mostra
  pacotes: {},          // dia -> pacote baixado
  diarios: [],          // a cópia da lista do banco, relida a cada desenho
  aberto: null,         // o diário aberto na aba Diário
  baixando: false, enviando: false, ultimoEnvio: null, aviso: null, versaoNova: false,
  ligar: null           // { codigo, url } vindos do link
};
var REGRAS = {};        // geradoEm do pacote -> { validarLancamentoPS, chaveDoLancamentoPS } | { erro }

/* Rótulos e textos de tela (não são regras: a regra é o que o servidor confere). */
var NOME_DO_ESTADO = { rascunho: 'Rascunho', encerrado: 'Encerrado, esperando envio', enviado: 'Enviado', recusado: 'Recusado pelo servidor', jaLancado: 'Já lançado por outro' };
var NOME_DO_TIPO_DIA = { PRODUCAO: 'Produção', PLANTAO: 'Plantão sem acionamento', HH: 'À disposição (homem-hora)' };
/* O texto do papel para o da lista (o mesmo da tela "Lançar PS em papel", Script.html). */
var STATUS_DO_PAPEL = { 'CONCLUÍDO': 'Executado', 'PARCIAL': 'Parcial', 'CANCELADO': 'Cancelado', 'RESSALVA': 'Ressalva' };
/* A atividade como a programação escreve, para a da lista: só a sugestão inicial. */
var ATIVIDADE_DO_PAPEL = { 'Obra': 'Obra', 'Manutenção': 'Manutenção Programada', 'Emergencial': 'Manutenção Emergencial', 'Poda': 'Poda' };
var CODIGO_DA_ABA = { hoje: 'OPE-14', diario: 'OPE-15', encerrar: 'OPE-16', envio: 'OPE-17' };

/* Foto do PS: legível para conferir o papel, e leve para subir com sinal fraco
   (conceito 22.3: 150 a 200 KB bastam). O rosto é só para reconhecer quem é. */
var LADOS_FOTO_PS = [1600, 1280], TETO_FOTO_PS = 200 * 1024;
var LADOS_FOTO_ROSTO = [640, 480], TETO_FOTO_ROSTO = 90 * 1024;
/* Enviado há mais de 7 dias sai do celular (o diário e as fotos): o servidor já tem. */
var DIAS_GUARDANDO_ENVIADOS = 7;
var ENDERECO_VALIDO = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

function $(id) { return document.getElementById(id); }
function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dois(n) { return (n < 10 ? '0' : '') + n; }
function isoDe(dt) { return dt.getFullYear() + '-' + dois(dt.getMonth() + 1) + '-' + dois(dt.getDate()); }
function hojeLocal() { return isoDe(new Date()); }
function isoMaisDias(iso, n) { var p = iso.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2] + n, 12); return isoDe(dt); }
function brDe(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
function horaAgora() { var d = new Date(); return dois(d.getHours()) + ':' + dois(d.getMinutes()); }
function horaDeIso(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes()); }
function novoId() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = crypto.getRandomValues(new Uint8Array(16)), h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function minutos(t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; }
function semZeros(m) { return String(m || '').replace(/\D/g, '').replace(/^0+/, ''); }

// ---------------------------------------------------------------- o pacote e as regras
function pacoteDe(dia) { return E.pacotes[dia] || null; }

/* As regras do servidor, do texto que veio no pacote. Compiladas uma vez por pacote. */
function regrasDe(pac) {
  if (!pac || !pac.regras) return null;
  var k = pac.geradoEm + '|' + pac.dia;
  if (!REGRAS[k]) {
    try { REGRAS[k] = new Function(pac.regras + '\nreturn { validarLancamentoPS: validarLancamentoPS, chaveDoLancamentoPS: chaveDoLancamentoPS };')(); }
    catch (e) { REGRAS[k] = { erro: 'As regras do pacote não abriram neste celular (' + e.message + '). Baixe o pacote de novo.' }; }
  }
  return REGRAS[k];
}

/* O contexto que o servidor monta (23_LancarPS.gs, gravarLancamentoPSComo), com o que o pacote traz. */
function contextoDe(pac) {
  var equipes = {}, codigos = {};
  (pac.equipes || []).forEach(function (e) { equipes[e.p] = { matricula: e.mat, encarregado: e.enc, tipologia: e.t, supervisor: e.s }; });
  /* A folha do encarregado em outra equipe (substituindo alguém) também vale: está na formação. */
  (pac.folhas || []).forEach(function (f) { if (f.p && !equipes[f.p]) equipes[f.p] = { matricula: f.mat, encarregado: f.enc }; });
  Object.keys(pac.codigos || {}).forEach(function (n) { codigos[n] = {}; pac.codigos[n].forEach(function (it) { codigos[n][it[0]] = 1; }); });
  var hoje = hojeLocal();
  return { hoje: pac.hoje > hoje ? pac.hoje : hoje, equipes: equipes, contratos: pac.contratos || [], codigos: codigos };
}

/* Descrição de um código: a do baremo do contrato; senão, a do verso. */
var MAPAS_DE_CODIGO = {};
function mapaDoContrato(pac, contrato) {
  var nome = String(contrato || '').split('_')[0], k = (pac.geradoEm || '') + '|' + nome;
  if (!MAPAS_DE_CODIGO[k]) { var m = null; if (pac.codigos && pac.codigos[nome]) { m = {}; pac.codigos[nome].forEach(function (it) { if (!m[it[0]]) m[it[0]] = it[1]; }); } MAPAS_DE_CODIGO[k] = m; }
  return MAPAS_DE_CODIGO[k];
}
function itensDoVerso(pac) {
  var out = [];
  Object.keys(pac.catalogo || {}).forEach(function (lado) { (pac.catalogo[lado].colunas || []).forEach(function (col) { col.forEach(function (it) { out.push({ lado: lado, grupo: it[0], cod: String(it[1]).toUpperCase(), desc: it[2], un: it[3] }); }); }); });
  return out;
}
function descricaoDoCodigo(pac, contrato, cod) {
  cod = String(cod || '').toUpperCase().trim();
  if (!cod) return { texto: '', fora: false };
  var m = mapaDoContrato(pac, contrato);
  if (m) return m[cod] ? { texto: m[cod], fora: false } : { texto: 'não está no baremo deste contrato', fora: true };
  var v = itensDoVerso(pac).filter(function (i) { return i.cod === cod; })[0];
  return { texto: v ? v.desc : '', fora: false };
}

function impedidoNoPacote(pac, mat) {
  var m = semZeros(mat);
  return m && pac ? (pac.impedidos || []).filter(function (p) { return semZeros(p.mat) === m; })[0] || null : null;
}

// ---------------------------------------------------------------- banco e servidor
function recarregarDiarios() { return listarDiarios().then(function (l) { E.diarios = l; if (E.aberto) E.aberto = l.filter(function (d) { return d.id === E.aberto.id; })[0] || null; return l; }); }

function carregarPacotesGuardados() {
  var dias = [hojeLocal(), isoMaisDias(hojeLocal(), -1)];
  E.diarios.forEach(function (d) { if (dias.indexOf(d.dia) < 0) dias.push(d.dia); });
  return Promise.all(dias.map(function (dia) { return lerConfig('pacote:' + dia).then(function (p) { if (p) E.pacotes[dia] = p; }); }));
}

function marcarDesligado(msg) {
  if (!E.cfg) return Promise.resolve();
  E.cfg.desligado = true; E.cfg.motivoDesligado = msg || '';
  return gravarConfig('servidor', E.cfg);
}

function baixarPacote(dia, quieto) {
  if (!E.cfg || E.cfg.desligado || E.baixando) return Promise.resolve();
  E.baixando = true; if (!quieto) desenhar();
  return postar(E.cfg.url, { acao: 'pacote', token: E.cfg.token, dia: dia }, 60000).then(function (r) {
    E.baixando = false;
    if (r.ok) { E.pacotes[dia] = r; E.aviso = null; return gravarConfig('pacote:' + dia, r); }
    if (r.desligado) return marcarDesligado(r.erro);
    if (!quieto) E.aviso = { tipo: 'erro', texto: r.erro || 'O servidor não mandou o pacote.' };
  }, function (e) {
    E.baixando = false;
    if (!quieto) E.aviso = { tipo: 'atencao', texto: 'Não consegui baixar o pacote: ' + (e && e.msg || 'sem sinal') };
  }).then(desenhar);
}

function pedirEnvioEmSegundoPlano() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(function (reg) { if (reg.sync) return reg.sync.register('enviar-diarios'); }).catch(function () { });
}

function enviar(motivo) {
  if (!E.cfg || E.cfg.desligado || E.enviando) return Promise.resolve();
  E.enviando = true; desenhar();
  return enviarFila(motivo).then(function (r) {
    E.enviando = false; E.ultimoEnvio = { quando: new Date().toISOString(), r: r || {} };
    if (r && r.pendentes) pedirEnvioEmSegundoPlano();
    return lerConfig('servidor').then(function (c) { if (c) E.cfg = c; });
  }, function (e) {
    E.enviando = false; E.ultimoEnvio = { quando: new Date().toISOString(), r: { erro: e && (e.msg || e.message) || String(e) } };
  }).then(recarregarDiarios).then(desenhar);
}

// ---------------------------------------------------------------- fotos
function carregarImagem(arquivo) {
  if (self.createImageBitmap) return createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(arquivo); });
  return new Promise(function (ok, falha) { var img = new Image(); img.onload = function () { ok(img); }; img.onerror = falha; img.src = URL.createObjectURL(arquivo); });
}
function paraBlob(canvas, q) { return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', q); }); }

/* A marca d'água vai GRAVADA na imagem (conceito 21.2): o book é impresso, e
   texto ao lado da foto se perde. */
function marcaDagua(ctx, w, h, linhas) {
  var fonte = Math.max(13, Math.round(w / 42)), alto = Math.round(fonte * 1.35 * linhas.length + fonte * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, h - alto, w, alto);
  ctx.fillStyle = '#fff'; ctx.font = '600 ' + fonte + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
  linhas.forEach(function (t, i) { ctx.fillText(t, Math.round(fonte * 0.6), h - alto + Math.round(fonte * 0.4) + i * Math.round(fonte * 1.35)); });
}

/* Reduz até caber no teto, tentando lado e qualidade (a mesma escada do app de teste). */
function processarFoto(arquivo, lados, teto, linhas) {
  return carregarImagem(arquivo).then(function (img) {
    var w0 = img.width, h0 = img.height, tentativas = [];
    lados.forEach(function (lado) { [0.72, 0.6, 0.5, 0.4].forEach(function (q) { tentativas.push([lado, q]); }); });
    var i = 0;
    function tenta() {
      var lado = tentativas[i][0], q = tentativas[i][1], f = Math.min(1, lado / Math.max(w0, h0));
      var c = document.createElement('canvas');
      c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      marcaDagua(ctx, c.width, c.height, linhas);
      return paraBlob(c, q).then(function (b) {
        i++;
        if (b.size <= teto || i >= tentativas.length) return { blob: b, largura: c.width, altura: c.height };
        return tenta();
      });
    }
    return tenta().then(function (r) { if (img.close) img.close(); return r; });
  });
}

var URLS_DE_FOTO = {};
function urlDaFoto(id) {
  if (!id) return Promise.resolve('');
  if (URLS_DE_FOTO[id]) return Promise.resolve(URLS_DE_FOTO[id]);
  return lerFoto(id).then(function (f) { if (!f || !f.blob) return ''; URLS_DE_FOTO[id] = URL.createObjectURL(f.blob); return URLS_DE_FOTO[id]; });
}
/* Depois de desenhar: as <img data-foto-id> recebem a imagem do banco. */
function mostrarFotos() {
  Array.prototype.forEach.call(document.querySelectorAll('img[data-foto-id]'), function (img) {
    urlDaFoto(img.getAttribute('data-foto-id')).then(function (u) { if (u) img.src = u; });
  });
}

// ---------------------------------------------------------------- o diário
function folhaDoPacote(pac, codigo) { return pac && codigo ? (pac.folhas || []).filter(function (f) { return f.codigo === codigo; })[0] || null : null; }
function diarioDaFolha(dia, codigo) {
  return E.diarios.filter(function (d) { return d.dia === dia && d.codigo === codigo && d.estado !== 'jaLancado'; })
    .sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; })[0] || null;
}
function processoPadrao(atividade, verso) {
  if (verso === 'LV') return 'LINHA VIVA';
  if (atividade === 'Poda') return 'PODA';
  if (/^Manutenção/.test(atividade)) return 'MANUTENÇÃO';
  return 'OBRA';
}

/*
 * Um diário novo para uma folha (ou em branco, para a emergência). O que é do
 * dia da equipe, e não da obra (placa, expediente, almoço, DDS, km e quem foi),
 * vem do outro diário da mesma equipe no mesmo dia: a equipe que faz duas
 * obras não preenche o cabeçalho duas vezes.
 */
function novoDiario(pac, f) {
  var prefixo = f ? f.p : ((pac.equipes || [])[0] || {}).p || '';
  var atividade = f ? (ATIVIDADE_DO_PAPEL[f.atividade] || 'Obra') : 'Obra';
  var x = {
    prefixo: prefixo, matEnc: E.cfg.mat, nomeEnc: E.cfg.nome, tipoDia: 'PRODUCAO', placa: f ? f.placa || '' : '',
    expIni: '', expFim: '', almIni: '', almFim: '', kmSaida: '', kmChegada: '',
    pessoas: f ? (f.pessoas || []).filter(function (p) { return semZeros(p.mat) !== semZeros(E.cfg.mat); }).map(function (p) { return { mat: p.mat, nome: p.nome, estado: '', sugerido: true }; }) : [],
    dds: '', ddsHora: '', ddsQuem: '', contrato: (f && f.contrato) || pac.contratoPadrao || '',
    obra: f ? f.obra || '' : '', municipio: f ? f.municipio || '' : '', alim: f ? f.alm || '' : '', ponto: f ? f.ponto || '' : '',
    atividade: atividade, processo: processoPadrao(atividade, f && f.verso), processoMudado: false, status: '', ini: '', fim: '',
    codigos: [{ cod: '', qtd: '', adc: '' }], hhExtra: '', hhAdc: '0,3', observacoes: ''
  };
  var irmao = E.diarios.filter(function (d) { return d.dia === pac.dia && d.form && d.form.prefixo === prefixo; })
    .sort(function (a, b) { return a.mudadoEm < b.mudadoEm ? 1 : -1; })[0];
  if (irmao) {
    var y = irmao.form;
    ['placa', 'expIni', 'expFim', 'almIni', 'almFim', 'kmSaida', 'kmChegada', 'dds', 'ddsHora', 'ddsQuem'].forEach(function (k) { if (y[k]) x[k] = y[k]; });
    var porMat = {};
    y.pessoas.forEach(function (p) { porMat[semZeros(p.mat)] = p; });
    x.pessoas.forEach(function (p) { var q = porMat[semZeros(p.mat)]; if (q) { p.estado = q.estado; delete porMat[semZeros(p.mat)]; } });
    Object.keys(porMat).forEach(function (m) { var q = porMat[m]; if (q.estado === 'foi') x.pessoas.push({ mat: q.mat, nome: q.nome, estado: 'foi', sugerido: false }); });
  }
  return {
    id: novoId(), dia: pac.dia, codigo: f ? f.codigo : '', extra: !f, estado: 'rascunho', criadoEm: new Date().toISOString(),
    folha: f ? { codigo: f.codigo, p: f.p, obra: f.obra, municipio: f.municipio, verso: f.verso, hi: f.hi, hf: f.hf, servico: f.servico } : null,
    form: x, fotos: { FRENTE: null, VERSO: null }, rosto: null, arquivos: {}, tentativas: 0
  };
}

var relogioSalvar = null;
function salvarDepois() {
  clearTimeout(relogioSalvar);
  relogioSalvar = setTimeout(salvarAgora, 400);
}
function salvarAgora() {
  clearTimeout(relogioSalvar); relogioSalvar = null;
  var d = E.aberto;
  /* Só o rascunho se grava daqui: o encerrado é do envio (que pode estar no segundo plano). */
  if (!d || d.estado !== 'rascunho') return Promise.resolve();
  return guardarDiario(d);
}

/*
 * As pendências que impedem encerrar: as regras do servidor (do pacote) e o
 * que só o celular sabe (quem ficou sem marcar, as fotos do papel, a folha já
 * lançada). avisos: o que não impede (impedido marcado "Foi": o papel manda, e
 * o DP confere, como no PS em papel).
 */
function conferirDiario(d) {
  var out = { erros: [], avisos: [], v: null };
  var pac = pacoteDe(d.dia);
  if (!pac) { out.erros.push({ campo: '', msg: 'O pacote de ' + brDe(d.dia) + ' não está no celular: conecte no Wi-Fi e baixe (aba Hoje).' }); return out; }
  var R = regrasDe(pac);
  if (!R || R.erro) { out.erros.push({ campo: '', msg: R ? R.erro : 'O pacote não trouxe as regras: baixe de novo.' }); return out; }
  var val = R.validarLancamentoPS(pacoteDoDiario(d), contextoDe(pac));
  out.v = val.v;
  out.erros = val.erros.slice();
  var x = d.form;
  var semMarcar = x.pessoas.filter(function (p) { return p.estado !== 'foi' && p.estado !== 'faltou'; });
  if (semMarcar.length) out.erros.push({ campo: 'pessoas', msg: 'Componentes: marque Foi ou Faltou em ' + semMarcar.map(function (p) { return p.nome || p.mat; }).join(', ') + '.' });
  if (!d.fotos || !d.fotos.FRENTE || !d.fotos.VERSO) out.erros.push({ campo: 'fotos', msg: 'Fotos do PS: a frente e o verso do papel.' });
  if (val.v && val.v.prefixo) {
    var chave = R.chaveDoLancamentoPS(val.v.dia, val.v.prefixo, val.v.obra);
    var ja = (pac.lancados || []).filter(function (l) { return l.chave === chave && l.situacao !== 'DESFEITO'; })[0];
    if (ja && !(d.resposta && d.resposta.chave === chave)) out.erros.push({ campo: 'obra', msg: 'Esta folha já foi lançada no sistema em ' + ja.quando + ' por ' + (ja.por || '?') + '. Se precisa corrigir, fale com o supervisor.' });
    var gemeo = E.diarios.filter(function (o) {
      if (o.id === d.id || ['encerrado', 'enviado'].indexOf(o.estado) < 0 || o.dia !== d.dia) return false;
      return R.chaveDoLancamentoPS(o.dia, String(o.form.prefixo || '').toUpperCase(), o.form.tipoDia === 'PLANTAO' ? '' : String(o.form.obra || '').toUpperCase().replace(/\s+/g, '')) === chave;
    })[0];
    if (gemeo) out.erros.push({ campo: 'obra', msg: 'Já há outro diário encerrado neste celular para a mesma equipe e obra no dia.' });
  }
  x.pessoas.forEach(function (p) {
    var imp = p.estado === 'foi' ? impedidoNoPacote(pac, p.mat) : null;
    if (imp) out.avisos.push((p.nome || p.mat) + ' está impedido de ir a campo neste dia (' + imp.motivo + '). Se foi mesmo, encerre: o DP confere.');
  });
  var impEnc = impedidoNoPacote(pac, x.matEnc);
  if (impEnc) out.avisos.push('Você aparece como impedido de ir a campo neste dia (' + impEnc.motivo + '). Se trabalhou, encerre e avise o supervisor.');
  return out;
}

// ---------------------------------------------------------------- desenho
function desenhar() {
  var corpo = $('corpo'), rolagem = corpo.scrollTop;
  $('abas').classList.toggle('oculto', !E.cfg || !!E.ligar);
  Array.prototype.forEach.call(document.querySelectorAll('#abas button'), function (b) { b.classList.toggle('ativo', b.getAttribute('data-aba') === E.aba); });
  var pend = E.diarios.filter(function (d) { return d.estado === 'encerrado'; }).length;
  $('rotEnvio').textContent = pend ? 'Envio (' + pend + ')' : 'Envio';
  var h;
  if (!E.cfg || E.ligar) { $('codTela').textContent = 'LIGAR'; h = telaLigar(); }
  else {
    $('codTela').textContent = CODIGO_DA_ABA[E.aba];
    h = (E.versaoNova ? '<div class="aviso ok">Versão nova do app instalada. <button type="button" class="btn medio" data-acao="recarregar">Abrir a versão nova</button></div>' : '') +
        (E.cfg.desligado ? '<div class="aviso erro"><b>Este celular foi desligado do sistema</b> (cortado na tela do supervisor, ou trocado por outro). Os diários continuam guardados aqui. Peça um código novo ao supervisor e toque em "Ligar de novo".<button type="button" class="btn medio" data-acao="religar">Ligar de novo</button></div>' : '') +
        (E.aviso ? '<div class="aviso ' + E.aviso.tipo + '">' + esc(E.aviso.texto) + '</div>' : '') +
        ({ hoje: telaHoje, diario: telaDiario, encerrar: telaEncerrar, envio: telaEnvio }[E.aba])();
  }
  corpo.innerHTML = h;
  corpo.scrollTop = rolagem;
  mostrarFotos();
}

function irPara(aba, campo) {
  E.aba = aba; E.aviso = null;
  /* Primeiro grava o que foi digitado, depois relê: a releitura não pode trazer a versão de antes. */
  return salvarAgora().then(recarregarDiarios).then(function () {
    desenhar();
    var alvo = campo ? $('f-' + campo) : null;
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: 'center' });
    else $('corpo').scrollTop = 0;
  });
}

// ---- Ligar
function telaLigar() {
  var l = E.ligar || { codigo: '', url: E.cfg ? E.cfg.url : '' };
  var h = '<div class="cartao"><div class="etiqueta">Ligar este celular</div>' +
    '<p>O supervisor gera um código de 6 números na tela <b>Aparelhos do campo</b> e manda o link pelo WhatsApp. Abra o link <b>no Chrome</b> deste celular e toque em Ligar. Só uma vez: depois, o app abre direto, com ou sem sinal.</p>' +
    (E.cfg && !E.cfg.desligado ? '<div class="aviso atencao">Este celular já está ligado para ' + esc(E.cfg.nome) + '. Ligar com outro código troca o dono do celular.</div>' : '') +
    '<label for="ligCodigo">Código (6 números)</label><input id="ligCodigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" value="' + esc(l.codigo) + '">' +
    (l.url && ENDERECO_VALIDO.test(l.url) ? '' : '<label for="ligUrl">Endereço do servidor</label><input id="ligUrl" inputmode="url" autocomplete="off" value="' + esc(l.url || '') + '" placeholder="https://script.google.com/macros/s/…/exec"><div class="ajuda">Vem no link do supervisor. Se o link abriu sem ele, peça o link de novo.</div>') +
    '<div id="ligErro"></div>' +
    '<button type="button" class="btn" data-acao="ligar">Ligar este celular</button>' +
    (E.cfg ? '<button type="button" class="btn fantasma" data-acao="cancelarLigar">Voltar</button>' : '') + '</div>' +
    '<div class="cartao"><div class="etiqueta">Instalar na tela inicial</div><p class="media">No menu do Chrome (os três pontinhos), toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>. O app passa a abrir sem a barra de endereço e sem sinal.</p></div>' +
    '<footer>Compel · Campo · versão ' + esc(VERSAO_APP) + '</footer>';
  return h;
}

function resumoDoAparelho() {
  var ua = navigator.userAgent || '', m = ua.match(/\(([^)]+)\)/);
  return (m ? m[1] : ua).slice(0, 80);
}

function ligar() {
  var codigo = String(($('ligCodigo') || {}).value || '').replace(/\D/g, '');
  var url = (E.ligar && E.ligar.url) || (E.cfg && E.cfg.url) || '';
  if ($('ligUrl')) url = $('ligUrl').value.trim();
  var erro = function (t) { $('ligErro').innerHTML = '<div class="aviso erro">' + esc(t) + '</div>'; };
  if (!/^\d{6}$/.test(codigo)) return erro('O código tem 6 números.');
  if (!ENDERECO_VALIDO.test(url)) return erro('O endereço do servidor não está certo: tem de terminar em /exec. Peça o link de novo ao supervisor.');
  $('ligErro').innerHTML = '<div class="aviso">Ligando…</div>';
  postar(url, { acao: 'ligar', codigo: codigo, aparelho: resumoDoAparelho() }, 45000).then(function (r) {
    if (!r.ok) return erro(r.erro || 'O servidor recusou o código.');
    E.cfg = { url: url, token: r.token, aparelho: r.aparelho, mat: r.mat, nome: r.nome, base: r.base, ligadoEm: new Date().toISOString(), desligado: false };
    return gravarConfig('servidor', E.cfg).then(function () {
      E.ligar = null; E.aba = 'hoje'; E.dia = hojeLocal();
      /* O código já foi usado: tirá-lo do endereço evita que um "voltar" ou um favorito tente de novo. */
      try { history.replaceState(null, '', location.pathname); } catch (e) { }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
      desenhar();
      return baixarPacote(E.dia).then(function () { return enviar('celular ligado'); });
    });
  }, function (e) { erro((e && e.msg) || 'Não consegui falar com o servidor.'); });
}

// ---- Hoje (OPE-14)
function telaHoje() {
  var dia = E.dia, pac = pacoteDe(dia), hoje = hojeLocal();
  var h = '<div class="cartao"><div class="etiqueta">Encarregado</div><b>' + esc(E.cfg.nome) + '</b> <span class="fraco">· ' + esc(E.cfg.mat) + ' · ' + esc(pac && pac.base ? pac.base.nome : E.cfg.base) + '</span>' +
    '<div class="dias" style="margin-top:10px">' + [[hoje, 'Hoje'], [isoMaisDias(hoje, -1), 'Ontem']].map(function (x) {
      return '<button type="button" class="btn medio ' + (dia === x[0] ? '' : 'fantasma') + '" data-dia="' + x[0] + '">' + x[1] + ' · ' + brDe(x[0]).slice(0, 5) + '</button>'; }).join('') + '</div>' +
    '<div class="ajuda">' + (pac ? 'Pacote do dia baixado em ' + esc(pac.geradoEm) + '.' : 'O pacote deste dia ainda não está no celular.') + '</div>' +
    '<button type="button" class="btn secundario medio" data-acao="baixar"' + (E.baixando || E.cfg.desligado ? ' disabled' : '') + '>' + (E.baixando ? 'Baixando…' : pac ? 'Baixar de novo' : 'Baixar o pacote do dia') + '</button></div>';
  if (!pac) return h + '<div class="aviso atencao">Sem o pacote, o app não sabe as folhas, a equipe nem os códigos do dia. Conecte no Wi-Fi da base (ou com sinal) e toque em "Baixar o pacote do dia". Depois, funciona sem sinal.</div>';
  (pac.avisos || []).forEach(function (a) { h += '<div class="aviso atencao">' + esc(a) + '</div>'; });
  var R = regrasDe(pac), chaves = {};
  (pac.lancados || []).forEach(function (l) { chaves[l.chave] = l; });
  h += '<div class="etiqueta" style="margin:6px 2px 0">Folhas de ' + esc(brDe(dia)) + '</div>';
  if (!(pac.folhas || []).length) h += '<div class="cartao media">Nenhuma folha da programação para você neste dia. Se a equipe trabalhou numa emergência, use a folha sem programação.</div>';
  (pac.folhas || []).forEach(function (f) {
    var d = diarioDaFolha(dia, f.codigo), ja = R && !R.erro ? chaves[R.chaveDoLancamentoPS(dia, f.p, f.obra)] : null;
    var chip = d ? '<span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>' : ja ? '<span class="chip jaLancado">Já lançada no sistema</span>' : '';
    h += '<div class="cartao folha"><div class="linha1"><b>' + esc(f.p) + '</b> · obra <b>' + esc(f.obra || '—') + '</b> ' + chip + '</div>' +
      '<div class="media">' + esc(f.municipio || '') + (f.hi ? ' · programado ' + esc(f.hi) + (f.hf ? ' às ' + esc(f.hf) : '') : '') + '</div>' +
      (f.servico ? '<div class="fraco">' + esc(String(f.servico).slice(0, 140)) + '</div>' : '') +
      '<div class="fraco">Folha ' + esc(f.codigo) + '</div>' +
      (ja && !d ? '<div class="ajuda">Lançada em ' + esc(ja.quando) + ' por ' + esc(ja.por || '?') + '.</div>' :
        '<button type="button" class="btn medio' + (d ? ' secundario' : '') + '" data-abrir-folha="' + esc(f.codigo) + '">' + (d ? (d.estado === 'rascunho' ? 'Continuar o diário' : 'Ver o diário') : 'Começar o diário') + '</button>') + '</div>';
  });
  var extras = E.diarios.filter(function (d) { return d.dia === dia && d.extra; });
  extras.forEach(function (d) {
    h += '<div class="cartao folha"><div class="linha1"><b>' + esc(d.form.prefixo || 'Sem equipe') + '</b> · ' + (d.form.obra ? 'obra <b>' + esc(d.form.obra) + '</b>' : 'sem obra') +
      ' <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span></div><div class="fraco">Folha sem programação</div>' +
      '<button type="button" class="btn medio secundario" data-abrir-diario="' + esc(d.id) + '">' + (d.estado === 'rascunho' ? 'Continuar o diário' : 'Ver o diário') + '</button></div>';
  });
  h += '<button type="button" class="btn fantasma" data-acao="extra">+ Folha sem programação (emergência)</button>';
  return h;
}

function abrirFolha(codigo) {
  var pac = pacoteDe(E.dia), f = folhaDoPacote(pac, codigo);
  if (!f) return;
  var d = diarioDaFolha(E.dia, codigo);
  if (d) { E.aberto = d; return gravarConfig('aberto', d.id).then(function () { irPara(d.estado === 'rascunho' ? 'diario' : 'encerrar'); }); }
  d = novoDiario(pac, f);
  E.aberto = d;
  return guardarDiario(d).then(function () { return gravarConfig('aberto', d.id); }).then(function () { irPara('diario'); });
}
function abrirDiario(id) {
  return lerDiario(id).then(function (d) {
    if (!d) return;
    E.aberto = d;
    return gravarConfig('aberto', d.id).then(function () { irPara(d.estado === 'rascunho' ? 'diario' : 'encerrar'); });
  });
}
function novaFolhaExtra() {
  var pac = pacoteDe(E.dia);
  if (!pac) return;
  var d = novoDiario(pac, null);
  E.aberto = d;
  return guardarDiario(d).then(function () { return gravarConfig('aberto', d.id); }).then(function () { irPara('diario'); });
}

// ---- Diário (OPE-15)
function opcoes(lista, atual, vazio) {
  return (vazio !== undefined ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(function (x) {
    var v = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x;
    return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');
}
function seg(nome, lista, atual, classe) {
  return '<div class="seg ' + (classe || '') + '">' + lista.map(function (t) { return '<button type="button" data-' + nome + '="' + t[0] + '" data-v="' + t[0] + '" class="' + (atual === t[0] ? 'ativo' : '') + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>';
}
/* AS HORAS UMA EMBAIXO DA OUTRA, na ordem do dia (saída, almoço, chegada): em duas
   colunas, o campo de hora com o botão "agora" não cabia na tela do celular
   (390 px, visto na bateria em 13/10/2026). */
function campoHora(campo, rotulo, x, dica) {
  return '<div id="f-' + campo + '"><label for="i-' + campo + '">' + esc(rotulo) + '</label><div class="hora"><input id="i-' + campo + '" type="time" data-f="' + campo + '" value="' + esc(x[campo]) + '">' +
    '<button type="button" class="btn fantasma" data-agora="' + campo + '">agora</button></div>' + (dica ? '<div class="ajuda">' + dica + '</div>' : '') + '</div>';
}
function campoTexto(campo, rotulo, x, extra, dica) {
  return '<div id="f-' + campo + '"><label for="i-' + campo + '">' + esc(rotulo) + '</label><input id="i-' + campo + '" data-f="' + campo + '" value="' + esc(x[campo]) + '" autocomplete="off"' + (extra || '') + '>' + (dica ? '<div class="ajuda">' + dica + '</div>' : '') + '</div>';
}
function horasHH(x) {
  var ini = minutos(x.expIni), fim = minutos(x.expFim), ai = minutos(x.almIni), af = minutos(x.almFim);
  if (ini === null || fim === null || fim <= ini) return '—';
  var m = fim - ini - (ai !== null && af !== null && af > ai ? af - ai : 0);
  return (Math.round(m / 60 * 100) / 100).toLocaleString('pt-BR') + ' h';
}

function telaDiario() {
  var d = E.aberto;
  if (!d) {
    var abertos = E.diarios.filter(function (o) { return o.estado === 'rascunho'; });
    return '<div class="cartao">Nenhum diário aberto. Escolha a folha na aba <b>Hoje</b>.</div>' + abertos.map(function (o) {
      return '<div class="cartao folha"><div class="linha1"><b>' + esc(o.form.prefixo) + '</b> · ' + esc(o.form.obra || 'sem obra') + ' · ' + esc(brDe(o.dia)) + ' <span class="chip rascunho">Rascunho</span></div>' +
        '<button type="button" class="btn medio secundario" data-abrir-diario="' + esc(o.id) + '">Continuar</button></div>'; }).join('');
  }
  if (d.estado !== 'rascunho') return '<div class="cartao">Este diário está <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>. Veja na aba <b>Encerrar</b>.<button type="button" class="btn medio secundario" data-aba-ir="encerrar">Ir para Encerrar</button></div>';
  var pac = pacoteDe(d.dia);
  if (!pac) return '<div class="aviso atencao">O pacote de ' + esc(brDe(d.dia)) + ' não está no celular. Baixe na aba Hoje.</div>';
  var x = d.form, L = pac.listas || {}, f = d.folha, prod = x.tipoDia === 'PRODUCAO', hh = x.tipoDia === 'HH', plantao = x.tipoDia === 'PLANTAO';
  var h = '';
  if (d.errosServidor && d.errosServidor.length) h += '<div class="aviso erro"><b>O servidor recusou este diário:</b><ul>' + d.errosServidor.map(function (e) { return '<li>' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>';

  /* 1. a folha e o dia */
  h += '<div class="cartao"><div class="etiqueta">' + (f ? 'Folha ' + esc(f.codigo) : 'Folha sem programação') + ' · ' + esc(brDe(d.dia)) + '</div>' +
    '<div><b>' + esc(E.cfg.nome) + '</b> <span class="fraco">· encarregado · ' + esc(E.cfg.mat) + '</span></div>' +
    '<div id="f-prefixo">' + (f ? '<div class="media">Equipe <b>' + esc(x.prefixo) + '</b></div>' :
      '<label for="i-prefixo">Equipe (prefixo)</label><select id="i-prefixo" data-f="prefixo" data-redesenha="1">' + opcoes((pac.equipes || []).map(function (e) { return [e.p, e.p + (e.t ? ' · ' + e.t : '')]; }), x.prefixo, 'Escolha a equipe') + '</select>') + '</div>' +
    campoTexto('placa', 'Placa da viatura', x, ' maxlength="8" style="text-transform:uppercase"') +
    '<div id="f-tipoDia"><label>Como foi o dia</label>' + seg('tipo', [['PRODUCAO', 'Produção'], ['PLANTAO', 'Plantão'], ['HH', 'Homem-hora']], x.tipoDia) +
    '<div class="ajuda">' + esc(plantao ? 'Plantão sem acionamento: a equipe ficou de prontidão e não foi acionada.' : hh ? 'À disposição do cliente: grava as horas do expediente, sem o almoço.' : 'Produção: os serviços do verso do PS.') + '</div></div></div>';

  /* 2. horários e km */
  h += '<div class="cartao"><div class="etiqueta">Expediente e km</div>' +
    campoHora('expIni', 'Saída (início do expediente)', x) + campoHora('almIni', 'Almoço, início', x) + campoHora('almFim', 'Almoço, término', x) + campoHora('expFim', 'Chegada (término do expediente)', x) +
    '<div class="duas"><div>' + campoTexto('kmSaida', 'KM saída da base', x, ' inputmode="numeric" maxlength="7"') + '</div><div>' + campoTexto('kmChegada', 'KM chegada no canteiro', x, ' inputmode="numeric" maxlength="7"') + '</div></div></div>';

  /* 3. componentes */
  var naLista = {}; x.pessoas.forEach(function (p) { naLista[semZeros(p.mat)] = 1; }); naLista[semZeros(E.cfg.mat)] = 1;
  var paraAdd = (pac.pessoasDaBase || []).filter(function (p) { return !naLista[semZeros(p.mat)]; });
  h += '<div class="cartao" id="f-pessoas"><div class="etiqueta">Componentes da equipe</div><div class="ajuda" style="margin:-2px 0 6px">Marque cada um: <b>Foi</b> ou <b>Faltou</b>.</div>' +
    (x.pessoas.length ? x.pessoas.map(function (p, i) {
      var imp = impedidoNoPacote(pac, p.mat);
      return '<div class="pessoa"><div><b>' + esc(p.nome || '?') + '</b><small>' + esc(p.mat) + (p.sugerido ? '' : ' · adicionado · <a href="#" data-tirar-p="' + i + '">tirar</a>') + '</small>' +
        (imp ? '<div class="erro-campo">Impedido neste dia: ' + esc(imp.motivo) + '</div>' : '') + '</div>' +
        seg('foi', [['foi', 'Foi'], ['faltou', 'Faltou']], p.estado, 'foi').replace(/data-foi="/g, 'data-i="' + i + '" data-foi="') + '</div>';
    }).join('') : '<p class="media">Nenhum sugerido. Adicione quem foi.</p>') +
    '<label for="addPessoa">Adicionar quem foi</label><select id="addPessoa">' + opcoes(paraAdd.map(function (p) { return [p.mat, p.nome + ' · ' + p.mat]; }), '', paraAdd.length ? 'Escolha na lista da base…' : 'Ninguém mais na lista da base') + '</select>' +
    '<div class="duas" style="margin-top:6px"><div><input id="addMat" inputmode="numeric" maxlength="8" placeholder="ou a matrícula" autocomplete="off"></div><div><button type="button" class="btn medio secundario" style="margin-top:0" data-acao="addPessoa">Adicionar</button></div></div></div>';

  /* 4. DDS */
  h += '<div class="cartao" id="f-dds"><div class="etiqueta">DDS de hoje</div>' + seg('dds', [['NA_BASE', 'Na base'], ['EM_CAMPO', 'Em campo'], ['NAO_HOUVE', 'Não houve']], x.dds) +
    (x.dds === 'EM_CAMPO' ? campoHora('ddsHora', 'Hora do DDS', x) + campoTexto('ddsQuem', 'Quem conduziu', x) : '') + '</div>';

  /* 5. a obra */
  if (!plantao) {
    h += '<div class="cartao"><div class="etiqueta">A obra</div>' +
      (f ? '<div id="f-obra" class="media">Documento (projeto / NR): <b>' + esc(x.obra || '—') + '</b></div>' : campoTexto('obra', 'Documento (projeto / NR)' + (hh ? ' — opcional no homem-hora' : ''), x, ' style="text-transform:uppercase"')) +
      campoTexto('municipio', 'Município', x, ' style="text-transform:uppercase"') +
      '<div class="duas"><div>' + campoTexto('alim', 'Alimentador', x, ' maxlength="8" style="text-transform:uppercase"') + '</div><div>' + campoTexto('ponto', 'Ponto elétrico', x, ' maxlength="16" style="text-transform:uppercase"') + '</div></div>' +
      '<div class="duas"><div id="f-atividade"><label for="i-atividade">Atividade</label><select id="i-atividade" data-f="atividade">' + opcoes(L.atividades || [], x.atividade) + '</select></div>' +
      '<div id="f-processo"><label for="i-processo">Processo</label><select id="i-processo" data-f="processo">' + opcoes(L.processos || [], x.processo) + '</select></div></div>';
    if (prod) h += '<div id="f-status"><label for="i-status">Status (como está no papel)</label><select id="i-status" data-f="status" data-redesenha="1">' +
        opcoes((L.status || []).map(function (s) { return [s, STATUS_DO_PAPEL[s] || s]; }), x.status, 'Escolha') + '</select></div>' +
      campoHora('ini', 'Início das atividades', x, f && f.hi ? 'Programado: ' + esc(f.hi) : '') + campoHora('fim', 'Término das atividades', x, f && f.hf ? 'Programado: ' + esc(f.hf) : '');
    h += '</div>';
  }

  /* 6. contrato e códigos */
  h += '<div class="cartao"><div class="etiqueta">' + (prod ? 'Os serviços do verso' : 'O código do dia') + '</div>' +
    '<div id="f-contrato"><label for="i-contrato">Contrato e reajuste</label><select id="i-contrato" data-f="contrato" data-redesenha="1">' + opcoes(pac.contratos || [], x.contrato, 'Escolha') + '</select></div>';
  if (prod) {
    var mapa = mapaDoContrato(pac, x.contrato);
    h += '<div id="f-codigos" style="margin-top:8px">' + x.codigos.map(function (c, i) {
      var dsc = descricaoDoCodigo(pac, x.contrato, c.cod);
      return '<div class="codigo"><div><label>Código</label><input data-c="' + i + '" data-cf="cod" list="listaCod" value="' + esc(c.cod) + '" autocomplete="off" style="text-transform:uppercase"></div>' +
        '<div><label>Qtd.</label><input data-c="' + i + '" data-cf="qtd" inputmode="decimal" value="' + esc(c.qtd) + '"></div>' +
        '<div><label>Adic.</label><select data-c="' + i + '" data-cf="adc">' + opcoes([['', '—'], ['0,3', '+30%']], c.adc) + '</select></div>' +
        '<button type="button" class="tirar" data-tirar-cod="' + i + '" aria-label="Tirar o código ' + (i + 1) + '">×</button>' +
        '<div class="desc' + (dsc.fora ? ' erro-campo' : '') + '" id="desc-' + i + '">' + esc(dsc.texto) + '</div></div>';
    }).join('') + '</div>' +
      (mapa ? '<datalist id="listaCod">' + Object.keys(mapa).slice(0, 2000).map(function (k) { return '<option value="' + esc(k) + '">' + esc(mapa[k]) + '</option>'; }).join('') + '</datalist>' : '') +
      '<div class="duas"><div><button type="button" class="btn medio secundario" data-acao="addCod">+ Código</button></div>' +
      (x.status === 'CANCELADO' ? '<div><button type="button" class="btn medio secundario" data-acao="codCancelado">Usar o ' + esc(L.cancelado) + '</button></div>' : '<div></div>') + '</div>' +
      '<details style="margin-top:10px"><summary>Procurar no verso do PS</summary><input id="buscaVerso" placeholder="parte do nome ou do código" autocomplete="off" style="margin-top:8px"><ul class="lista" id="listaVerso">' + itensDaBusca(pac, '', f && f.verso) + '</ul></details>';
  } else if (plantao) {
    h += '<p class="media">Grava o <b>' + esc(L.plantao) + '</b> (sem acionamento), quantidade 1.</p>';
  } else {
    h += '<p class="media">Grava o <b>' + esc(L.hh) + '</b> com as horas do expediente, sem o almoço: <b id="horasHH">' + esc(horasHH(x)) + '</b>.</p>' +
      '<div class="duas"><div>' + campoTexto('hhExtra', 'Destas, horas com adicional', x, ' inputmode="decimal"', 'Só se o papel separar.') + '</div><div>' + campoTexto('hhAdc', 'Adicional', x, ' inputmode="decimal"', '0,3 é 30%.') + '</div></div>';
  }
  h += '</div>';

  /* 7. observações e fotos do papel */
  h += '<div class="cartao"><div class="etiqueta">Observações e as fotos do PS</div><div id="f-observacoes"><textarea data-f="observacoes" maxlength="500" placeholder="Observações (opcional)">' + esc(x.observacoes) + '</textarea></div>' +
    '<div id="f-fotos" class="fotos" style="margin-top:10px">' + ['FRENTE', 'VERSO'].map(function (l) {
      var id = d.fotos && d.fotos[l];
      return '<label class="foto' + (id ? ' ok' : '') + '">' + (id ? '<img alt="" data-foto-id="' + esc(id) + '"><span>' + (l === 'FRENTE' ? 'Frente' : 'Verso') + ' ✓ · tocar para trocar</span>' : '<b>📷 ' + (l === 'FRENTE' ? 'Frente' : 'Verso') + ' do PS</b><span>tocar para fotografar</span>') +
        '<input type="file" accept="image/*" capture="environment" data-foto="' + l + '"></label>';
    }).join('') + '</div><div id="estadoFoto" class="ajuda"></div></div>';
  h += '<button type="button" class="btn" data-aba-ir="encerrar">Conferir e encerrar</button>';
  return h;
}

function itensDaBusca(pac, termo, verso) {
  termo = String(termo || '').trim().toUpperCase();
  var itens = itensDoVerso(pac).filter(function (i) { return !verso || i.lado === verso; });
  if (termo) itens = itens.filter(function (i) { return i.cod.indexOf(termo) >= 0 || i.desc.toUpperCase().indexOf(termo) >= 0 || i.grupo.toUpperCase().indexOf(termo) >= 0; });
  var mostra = itens.slice(0, 40);
  return mostra.map(function (i) { return '<li><a href="#" data-verso-cod="' + esc(i.cod) + '"><b>' + esc(i.cod) + '</b> · ' + esc(i.desc) + (i.un ? ' (' + esc(i.un) + ')' : '') + '</a> <span class="fraco">' + esc(i.grupo) + '</span></li>'; }).join('') +
    (itens.length > mostra.length ? '<li class="fraco">… e mais ' + (itens.length - mostra.length) + '. Digite para filtrar.</li>' : '') + (itens.length ? '' : '<li class="fraco">Nada encontrado.</li>');
}

// ---- Encerrar (OPE-16)
function telaEncerrar() {
  var d = E.aberto;
  if (!d) return '<div class="cartao">Nenhum diário aberto. Escolha a folha na aba <b>Hoje</b>.</div>';
  var x = d.form, h = '<div class="cartao"><div class="etiqueta">' + (d.folha ? 'Folha ' + esc(d.folha.codigo) : 'Folha sem programação') + ' · ' + esc(brDe(d.dia)) + '</div>' +
    '<div class="linha1"><b>' + esc(x.prefixo || '—') + '</b> · ' + esc(x.tipoDia === 'PLANTAO' ? 'plantão' : 'obra ' + (x.obra || '—')) + ' <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span></div></div>';

  if (d.estado === 'rascunho') {
    var c = conferirDiario(d);
    if (c.erros.length) {
      h += '<div class="aviso erro"><b>' + c.erros.length + ' pendência(s) antes de encerrar.</b> Toque numa para ir até ela.<ul>' +
        c.erros.map(function (e) { return '<li><a href="#" data-ir="' + esc(e.campo) + '">' + esc(e.msg) + '</a></li>'; }).join('') + '</ul></div>';
    }
    c.avisos.forEach(function (a) { h += '<div class="aviso atencao">' + esc(a) + '</div>'; });
    if (!c.erros.length) {
      var foram = x.pessoas.filter(function (p) { return p.estado === 'foi'; }), faltaram = x.pessoas.filter(function (p) { return p.estado === 'faltou'; });
      var v = c.v || {};
      h += '<div class="cartao"><div class="etiqueta">Confira antes de assinar</div><dl class="resumo">' +
        '<dt>Dia</dt><dd>' + esc(NOME_DO_TIPO_DIA[x.tipoDia]) + '</dd><dt>Placa</dt><dd>' + esc(v.placa) + '</dd>' +
        '<dt>Expediente</dt><dd>' + esc(v.expIni + ' às ' + v.expFim) + (v.almIni ? ' · almoço ' + esc(v.almIni + '–' + v.almFim) : '') + '</dd>' +
        '<dt>Foram</dt><dd>' + (foram.length + 1) + ' (com você)</dd>' + (faltaram.length ? '<dt>Faltaram</dt><dd>' + esc(faltaram.map(function (p) { return p.nome || p.mat; }).join(', ')) + '</dd>' : '') +
        (x.tipoDia !== 'PLANTAO' ? '<dt>Atividades</dt><dd>' + esc(v.ini ? v.ini + ' às ' + v.fim : '—') + '</dd>' : '') +
        '<dt>Códigos</dt><dd>' + esc((v.codigos || []).map(function (k) { return k.cod + ' × ' + String(k.qtd).replace('.', ',') + (k.adc ? ' (+' + Math.round(k.adc * 100) + '%)' : ''); }).join('; ')) + '</dd></dl></div>' +
        '<div class="cartao"><div class="etiqueta">Assinar com a foto do rosto</div><p class="media">A foto do seu rosto é a assinatura do dia: mostra que foi você quem encerrou. Ela vai para uma pasta separada e não aparece no book.</p>' +
        '<label class="btn" style="position:relative">Encerrar e assinar com a foto do rosto<input type="file" accept="image/*" capture="user" data-rosto="1" style="position:absolute;inset:0;opacity:0"></label><div id="estadoRosto" class="ajuda"></div></div>';
    }
    h += '<button type="button" class="btn fantasma" data-aba-ir="diario">Voltar ao diário</button>';
    return h;
  }

  if (d.rosto) h += '<div class="cartao"><div class="etiqueta">Assinado</div><div class="fotos"><div class="foto ok"><img alt="" data-foto-id="' + esc(d.rosto) + '"></div><div class="media">Encerrado em ' + esc(horaDeIso(d.encerradoEm)) + '.' + (d.enviadoEm ? '<br>Enviado em ' + esc(horaDeIso(d.enviadoEm)) + '.' : '') + '</div></div></div>';
  if (d.estado === 'encerrado') {
    h += '<div class="aviso">Na fila para enviar. ' + (navigator.onLine ? 'Com sinal: o envio sai sozinho.' : 'Sem sinal agora: o app envia sozinho quando o sinal voltar, mesmo fechado (no Android).') + '</div>' +
      (d.ultimoErro ? '<div class="aviso atencao">Última tentativa: ' + esc(d.ultimoErro) + '</div>' : '') +
      '<button type="button" class="btn" data-acao="enviar"' + (E.enviando ? ' disabled' : '') + '>' + (E.enviando ? 'Enviando…' : 'Enviar agora') + '</button>' +
      '<button type="button" class="btn fantasma" data-acao="corrigir">Corrigir antes de enviar</button>';
  } else if (d.estado === 'enviado') {
    var r = d.resposta || {};
    h += '<div class="aviso ok"><b>Recebido pelo sistema.</b>' + (r.duplicado ? ' (Já tinha chegado antes; nada foi gravado duas vezes.)' : '') + (r.situacao ? ' Situação: ' + esc(r.situacao) + '.' : '') + '</div>' +
      (r.avisos && r.avisos.length ? '<div class="aviso atencao"><ul>' + r.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' : '');
  } else if (d.estado === 'recusado') {
    h += '<div class="aviso erro"><b>O servidor recusou.</b><ul>' + ((d.resposta && d.resposta.erros) || []).map(function (e) { return '<li>' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>' +
      '<button type="button" class="btn" data-acao="corrigir">Corrigir e encerrar de novo</button>';
  } else if (d.estado === 'jaLancado') {
    h += '<div class="aviso erro">' + esc(d.ultimoErro || 'Esta folha já tinha sido lançada.') + '</div>' +
      '<button type="button" class="btn fantasma" data-acao="apagar">Tirar este diário do celular</button>';
  }
  h += '<button type="button" class="btn fantasma" data-aba-ir="hoje">Voltar às folhas</button>';
  return h;
}

function encerrarComRosto(arquivo) {
  var d = E.aberto;
  if (!d || d.estado !== 'rascunho' || !arquivo) return;
  var c = conferirDiario(d);
  if (c.erros.length) { desenhar(); return; }
  $('estadoRosto').textContent = 'preparando a foto…';
  var linhas = [new Date().toLocaleString('pt-BR'), E.cfg.nome + ' · ' + E.cfg.mat, 'encerrou ' + d.form.prefixo + ' · ' + brDe(d.dia)];
  processarFoto(arquivo, LADOS_FOTO_ROSTO, TETO_FOTO_ROSTO, linhas).then(function (r) {
    var id = novoId();
    return guardarFoto({ id: id, blob: r.blob, tipo: 'ROSTO', diario: d.id, criadoEm: new Date().toISOString() }).then(function () {
      d.rosto = id; d.estado = 'encerrado'; d.encerradoEm = new Date().toISOString(); d.tentativas = 0; d.ultimoErro = ''; d.errosServidor = [];
      if (d.arquivos) delete d.arquivos.ROSTO;
      return guardarDiario(d);
    });
  }).then(function () {
    pedirEnvioEmSegundoPlano();
    return recarregarDiarios().then(desenhar).then(function () { if (navigator.onLine) return enviar('encerrou'); });
  }).catch(function (e) { $('estadoRosto').textContent = 'Não consegui preparar a foto: ' + (e && e.message || e); });
}

/*
 * Volta o diário a rascunho. DENTRO DA TRAVA DO ENVIO: se o segundo plano
 * estiver mandando este diário agora, corrigir no meio faria o servidor gravar
 * uma versão e o celular mostrar outra.
 */
function corrigir() {
  var id = E.aberto && E.aberto.id;
  if (!id) return;
  var faz = function () {
    return lerDiario(id).then(function (d) {
      if (!d || ['encerrado', 'recusado'].indexOf(d.estado) < 0) return false;
      var rosto = d.rosto;
      d.errosServidor = d.estado === 'recusado' && d.resposta ? d.resposta.erros || [] : [];
      d.estado = 'rascunho'; d.rosto = null; d.encerradoEm = null; d.ultimoErro = '';
      if (d.arquivos) delete d.arquivos.ROSTO;
      return guardarDiario(d).then(function () { return apagarFoto(rosto); }).then(function () { return true; });
    });
  };
  var p = navigator.locks && navigator.locks.request
    ? navigator.locks.request('operacao-campo-enviar', { ifAvailable: true }, function (trava) { return trava && !enviandoAgora ? faz() : 'ocupado'; })
    : (enviandoAgora ? Promise.resolve('ocupado') : faz());
  return p.then(function (r) {
    if (r === 'ocupado') { E.aviso = { tipo: 'atencao', texto: 'O app está enviando agora. Espere terminar e tente de novo.' }; return recarregarDiarios().then(desenhar); }
    E.aviso = null;
    irPara(r ? 'diario' : 'encerrar');
  });
}

function apagarDiarioDoCelular() {
  var d = E.aberto;
  if (!d || !confirm('Tirar este diário do celular? As fotos dele também saem.')) return;
  Promise.all([apagarFoto(d.fotos && d.fotos.FRENTE), apagarFoto(d.fotos && d.fotos.VERSO), apagarFoto(d.rosto)]).then(function () { return apagarDiario(d.id); })
    .then(function () { E.aberto = null; return gravarConfig('aberto', null); }).then(function () { irPara('hoje'); });
}

// ---- Envio (OPE-17)
function telaEnvio() {
  var todos = E.diarios.slice().sort(function (a, b) { return (a.encerradoEm || a.criadoEm) < (b.encerradoEm || b.criadoEm) ? 1 : -1; });
  var pend = todos.filter(function (d) { return d.estado === 'encerrado'; });
  var u = E.ultimoEnvio, ur = u ? u.r : null;
  var h = '<div class="cartao"><div class="etiqueta">Fila de envio</div>' +
    '<div class="grande">' + pend.length + '</div><div class="ajuda" style="text-align:center">diário(s) esperando envio</div>' +
    (ur ? '<div class="aviso ' + (ur.erro || ur.recusados ? 'atencao' : 'ok') + '" style="margin-top:8px">Às ' + esc(horaDeIso(u.quando).slice(6)) + ': ' +
      esc(ur.ocupado ? 'o envio já estava em andamento.' : ur.erro ? ur.erro : (ur.enviados || 0) + ' enviado(s)' + (ur.recusados ? ', ' + ur.recusados + ' recusado(s)' : '') + '.') + '</div>' : '') +
    '<button type="button" class="btn" data-acao="enviar"' + (E.enviando || E.cfg.desligado ? ' disabled' : '') + '>' + (E.enviando ? 'Enviando…' : 'Enviar agora') + '</button></div>';
  h += '<div class="cartao"><div class="etiqueta">Diários neste celular</div>' + (todos.length ? '<ul class="lista">' + todos.map(function (d) {
    return '<li><a href="#" data-abrir-diario="' + esc(d.id) + '"><b>' + esc(d.form.prefixo || '—') + '</b> · ' + esc(d.form.tipoDia === 'PLANTAO' ? 'plantão' : d.form.obra || 'sem obra') + ' · ' + esc(brDe(d.dia)) + '</a> <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>' +
      (d.estado === 'encerrado' && d.ultimoErro ? '<div class="ajuda">' + esc(d.ultimoErro) + (d.tentativas ? ' (' + d.tentativas + ' tentativa(s))' : '') + '</div>' : '') + '</li>';
  }).join('') + '</ul>' : '<p class="media">Nenhum ainda.</p>') + '<div class="ajuda">Os enviados saem do celular depois de ' + DIAS_GUARDANDO_ENVIADOS + ' dias.</div></div>';
  h += '<div class="cartao"><div class="etiqueta">Este celular</div><dl class="resumo">' +
    '<dt>Encarregado</dt><dd>' + esc(E.cfg.nome) + ' · ' + esc(E.cfg.mat) + '</dd><dt>Base</dt><dd>' + esc(E.cfg.base) + '</dd>' +
    '<dt>Celular</dt><dd>' + esc(E.cfg.aparelho) + (E.cfg.desligado ? ' · <b>desligado</b>' : '') + '</dd><dt>Ligado em</dt><dd>' + esc(horaDeIso(E.cfg.ligadoEm)) + '</dd>' +
    '<dt>Versão</dt><dd>' + esc(VERSAO_APP) + '</dd><dt>Sem sinal</dt><dd>' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'funciona (cópia guardada)' : 'ainda não: abra uma vez com sinal') + '</dd>' +
    '<dt>Segundo plano</dt><dd>' + (('serviceWorker' in navigator) && ('SyncManager' in window) ? 'envia sozinho quando o sinal volta' : 'este navegador não envia fechado: abra o app com sinal') + '</dd>' +
    '<dt>Guardado</dt><dd id="estadoGuardado">…</dd></dl>' +
    '<div id="testeServidor"></div><button type="button" class="btn medio secundario" data-acao="testar">Testar o servidor</button>' +
    '<button type="button" class="btn medio fantasma" data-acao="religar">Ligar com outro código</button></div>' +
    '<div class="cartao"><div class="etiqueta">Quando o Android acordou o app</div><ul class="lista" id="segundoPlano"><li class="fraco">…</li></ul></div>';
  setTimeout(preencherEnvio, 0);
  return h;
}
function preencherEnvio() {
  lerConfig('segundoPlano').then(function (l) {
    var el = $('segundoPlano'); if (!el) return;
    el.innerHTML = (l && l.length) ? l.slice().reverse().map(function (x) { return '<li><b>' + esc(horaDeIso(x.quando)) + '</b> · ' + esc(x.resultado) + '</li>'; }).join('') : '<li class="fraco">Ainda não.</li>';
  }).catch(function () { });
  var el = $('estadoGuardado');
  if (!el) return;
  if (!navigator.storage || !navigator.storage.persisted) { el.textContent = 'o navegador não informa'; return; }
  navigator.storage.persisted().then(function (p) {
    el.innerHTML = p ? 'protegido (o Android não apaga para liberar espaço)' : 'pode ser apagado se faltar espaço · <a href="#" data-acao="proteger">proteger</a>';
  });
}
function testarServidor() {
  var el = $('testeServidor');
  el.innerHTML = '<div class="aviso">Testando…</div>';
  var t0 = Date.now();
  postar(E.cfg.url, { acao: 'testar', token: E.cfg.token }, 30000).then(function (r) {
    var s = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' s';
    if (r.ok) { el.innerHTML = '<div class="aviso ok">O servidor respondeu em ' + s + ': celular ' + esc(r.aparelho) + ', de ' + esc(r.nome) + '.</div>'; if (E.cfg.desligado) { E.cfg.desligado = false; gravarConfig('servidor', E.cfg).then(desenhar); } }
    else if (r.desligado) marcarDesligado(r.erro).then(desenhar);
    else el.innerHTML = '<div class="aviso erro">' + esc(r.erro) + '</div>';
  }, function (e) { el.innerHTML = '<div class="aviso atencao">' + esc(e && e.msg || 'Sem resposta.') + '</div>'; });
}

// ---------------------------------------------------------------- eventos
var corpo = $('corpo');

corpo.addEventListener('input', function (ev) {
  var t = ev.target, d = E.aberto;
  if (t.id === 'buscaVerso') { var pac = pacoteDe(d.dia); $('listaVerso').innerHTML = itensDaBusca(pac, t.value, d.folha && d.folha.verso); return; }
  if (!d || d.estado !== 'rascunho') return;
  var f = t.getAttribute('data-f'), c = t.getAttribute('data-c');
  if (f) {
    d.form[f] = t.value;
    if (f === 'processo') d.form.processoMudado = true;
    if (f === 'atividade' && !d.form.processoMudado) { d.form.processo = processoPadrao(t.value, d.folha && d.folha.verso); var sp = $('i-processo'); if (sp) sp.value = d.form.processo; }
    if ($('horasHH')) $('horasHH').textContent = horasHH(d.form);
    salvarDepois();
  } else if (c !== null) {
    d.form.codigos[+c][t.getAttribute('data-cf')] = t.value;
    if (t.getAttribute('data-cf') === 'cod') { var ds = descricaoDoCodigo(pacoteDe(d.dia), d.form.contrato, t.value), el = $('desc-' + c); if (el) { el.textContent = ds.texto; el.className = 'desc' + (ds.fora ? ' erro-campo' : ''); } }
    salvarDepois();
  }
});

corpo.addEventListener('change', function (ev) {
  var t = ev.target, d = E.aberto;
  if (t.getAttribute('data-rosto')) { encerrarComRosto(t.files && t.files[0]); return; }
  if (t.getAttribute('data-foto') && d && d.estado === 'rascunho') { trocarFotoDoPS(d, t.getAttribute('data-foto'), t.files && t.files[0]); return; }
  if (t.getAttribute('data-redesenha') && d && d.estado === 'rascunho') {
    d.form[t.getAttribute('data-f')] = t.value;
    if (t.getAttribute('data-f') === 'prefixo') { d.form.prefixo = t.value; }
    salvarAgora().then(desenhar);
  }
});

function trocarFotoDoPS(d, lado, arquivo) {
  if (!arquivo) return;
  $('estadoFoto').textContent = 'preparando a foto…';
  var x = d.form, linhas = [new Date().toLocaleString('pt-BR'), 'PS ' + (lado === 'FRENTE' ? 'FRENTE' : 'VERSO') + ' · ' + brDe(d.dia), [x.prefixo, x.obra, E.cfg.nome].filter(Boolean).join('   ·   ')];
  processarFoto(arquivo, LADOS_FOTO_PS, TETO_FOTO_PS, linhas).then(function (r) {
    var id = novoId(), antiga = d.fotos[lado];
    return guardarFoto({ id: id, blob: r.blob, tipo: 'PS_' + lado, diario: d.id, criadoEm: new Date().toISOString() }).then(function () {
      d.fotos[lado] = id;
      /* Foto nova é arquivo novo no servidor: a que já tinha subido não vale mais. */
      if (d.arquivos) delete d.arquivos['PS_' + lado];
      return guardarDiario(d).then(function () { return apagarFoto(antiga); });
    });
  }).then(desenhar).catch(function (e) { $('estadoFoto').textContent = 'Não consegui preparar a foto: ' + (e && e.message || e); });
}

corpo.addEventListener('click', function (ev) {
  var t = ev.target.closest ? ev.target.closest('button, a') : null;
  if (!t) return;
  var a = function (n) { return t.getAttribute(n); }, d = E.aberto;
  if (t.tagName === 'A') ev.preventDefault();
  if (a('data-dia')) { E.dia = a('data-dia'); E.aviso = null; desenhar(); if (!pacoteDe(E.dia) && navigator.onLine) baixarPacote(E.dia); return; }
  if (a('data-abrir-folha')) return abrirFolha(a('data-abrir-folha'));
  if (a('data-abrir-diario')) return abrirDiario(a('data-abrir-diario'));
  if (a('data-aba-ir')) return irPara(a('data-aba-ir'));
  if (t.hasAttribute('data-ir')) return irPara('diario', a('data-ir'));
  if (a('data-agora') && d && d.estado === 'rascunho') { d.form[a('data-agora')] = horaAgora(); var i = $('i-' + a('data-agora')); if (i) i.value = d.form[a('data-agora')]; if ($('horasHH')) $('horasHH').textContent = horasHH(d.form); salvarDepois(); return; }
  if (d && d.estado === 'rascunho') {
    var x = d.form;
    if (a('data-tipo')) { x.tipoDia = a('data-tipo'); return salvarAgora().then(desenhar); }
    if (a('data-dds')) { x.dds = a('data-dds'); return salvarAgora().then(desenhar); }
    if (a('data-foi')) { x.pessoas[+a('data-i')].estado = a('data-foi'); return salvarAgora().then(desenhar); }
    if (a('data-tirar-p')) { x.pessoas.splice(+a('data-tirar-p'), 1); return salvarAgora().then(desenhar); }
    if (a('data-tirar-cod')) { x.codigos.splice(+a('data-tirar-cod'), 1); if (!x.codigos.length) x.codigos.push({ cod: '', qtd: '', adc: '' }); return salvarAgora().then(desenhar); }
    if (a('data-verso-cod')) {
      var vazio = x.codigos.filter(function (c) { return !c.cod && !c.qtd; })[0];
      if (vazio) vazio.cod = a('data-verso-cod'); else x.codigos.push({ cod: a('data-verso-cod'), qtd: '', adc: '' });
      return salvarAgora().then(desenhar);
    }
  }
  var acao = a('data-acao');
  if (!acao) return;
  if (acao === 'ligar') return ligar();
  if (acao === 'cancelarLigar') { E.ligar = null; try { history.replaceState(null, '', location.pathname); } catch (e) { } return desenhar(); }
  if (acao === 'religar') { E.ligar = { codigo: '', url: E.cfg.url }; return desenhar(); }
  if (acao === 'recarregar') return location.reload();
  if (acao === 'baixar') return baixarPacote(E.dia);
  if (acao === 'extra') return novaFolhaExtra();
  if (acao === 'enviar') return enviar('botão');
  if (acao === 'testar') return testarServidor();
  if (acao === 'corrigir') return corrigir();
  if (acao === 'apagar') return apagarDiarioDoCelular();
  if (acao === 'proteger') { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(preencherEnvio); return; }
  if (d && d.estado === 'rascunho') {
    var y = d.form;
    if (acao === 'addCod') { y.codigos.push({ cod: '', qtd: '', adc: '' }); return salvarAgora().then(desenhar); }
    if (acao === 'codCancelado') { var L = pacoteDe(d.dia).listas; y.codigos = [{ cod: L.cancelado, qtd: '1', adc: '' }]; return salvarAgora().then(desenhar); }
    if (acao === 'addPessoa') {
      var pac = pacoteDe(d.dia), mat = semZeros($('addPessoa').value || $('addMat').value);
      if (!mat) return;
      if (mat === semZeros(E.cfg.mat) || y.pessoas.some(function (p) { return semZeros(p.mat) === mat; })) { $('addMat').value = ''; return; }
      var p = (pac.pessoasDaBase || []).filter(function (q) { return semZeros(q.mat) === mat; })[0];
      y.pessoas.push({ mat: p ? p.mat : mat, nome: p ? p.nome : '', estado: 'foi', sugerido: false });
      return salvarAgora().then(desenhar);
    }
  }
});

$('abas').addEventListener('click', function (ev) {
  var b = ev.target.closest('button');
  if (b) irPara(b.getAttribute('data-aba'));
});

function desenharSinal() {
  var on = navigator.onLine, c = $('chipSinal');
  c.textContent = on ? 'Com sinal' : 'Sem sinal';
  c.className = 'sinal ' + (on ? 'on' : 'off');
}
window.addEventListener('online', function () { desenharSinal(); enviar('o sinal voltou'); if (E.cfg && !pacoteDe(E.dia)) baixarPacote(E.dia, true); });
window.addEventListener('offline', function () { desenharSinal(); if (E.aba === 'encerrar' || E.aba === 'envio') desenhar(); });
/* Ao sair do app, o que foi digitado não pode esperar os 400 ms. */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') salvarAgora();
  else if (E.cfg && E.aba !== 'diario') recarregarDiarios().then(desenhar);
});

// ---------------------------------------------------------------- início
/* O link do supervisor: …/campo/#c=123456&s=<endereço do servidor>. */
function lerLink() {
  var h = (location.hash || '').replace(/^#/, ''), p = {};
  h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { } } });
  return p.c ? { codigo: String(p.c).replace(/\D/g, '').slice(0, 6), url: p.s || '' } : null;
}

/* Enviados há mais de 7 dias e pacotes velhos saem: o celular do campo tem pouco espaço. */
function limparVelhos() {
  var limite = new Date(Date.now() - DIAS_GUARDANDO_ENVIADOS * 86400000).toISOString();
  var velhos = E.diarios.filter(function (d) { return (d.estado === 'enviado' || d.estado === 'jaLancado') && (d.enviadoEm || d.mudadoEm) < limite; });
  return Promise.all(velhos.map(function (d) {
    return Promise.all([apagarFoto(d.fotos && d.fotos.FRENTE), apagarFoto(d.fotos && d.fotos.VERSO), apagarFoto(d.rosto)]).then(function () { return apagarDiario(d.id); });
  })).then(function () {
    var diaLimite = isoMaisDias(hojeLocal(), -3);
    return noBanco('config', 'readonly', function (s) { return s.getAllKeys(); }).then(function (chaves) {
      var usados = {}; E.diarios.forEach(function (d) { if (d.estado === 'rascunho' || d.estado === 'encerrado') usados[d.dia] = 1; });
      return Promise.all((chaves || []).filter(function (k) { return /^pacote:\d{4}-\d{2}-\d{2}$/.test(k) && k.slice(7) < diaLimite && !usados[k.slice(7)]; })
        .map(function (k) { return noBanco('config', 'readwrite', function (s) { return s.delete(k); }); }));
    });
  }).then(recarregarDiarios).catch(function () { });
}

if ('serviceWorker' in navigator) {
  var tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(function () { });
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (tinhaControle) { E.versaoNova = true; desenhar(); } });
  /* O segundo plano avisa quando mexeu na fila: a tela aberta relê. */
  navigator.serviceWorker.addEventListener('message', function (ev) { if (ev.data && ev.data.fila) recarregarDiarios().then(function () { if (E.aba !== 'diario') desenhar(); }); });
}

/* O link novo aberto com o app já aberto muda só o "#": a página não recarrega. */
window.addEventListener('hashchange', function () { var l = lerLink(); if (l) { E.ligar = l; desenhar(); } });

desenharSinal();
E.dia = hojeLocal();
E.ligar = lerLink();
lerConfig('servidor').then(function (c) {
  E.cfg = c;
  return recarregarDiarios();
}).then(function () {
  return Promise.all([carregarPacotesGuardados(), lerConfig('aberto').then(function (id) { E.aberto = id ? E.diarios.filter(function (d) { return d.id === id; })[0] || null : null; })]);
}).then(limparVelhos).then(function () {
  desenhar();
  if (!E.cfg || E.ligar) return;
  /* Ao abrir: o pedido de envio em segundo plano é refeito (o Android pode ter
     descartado o anterior), e com sinal o pacote de hoje vem atualizado. */
  if (E.diarios.some(function (d) { return d.estado === 'encerrado'; })) pedirEnvioEmSegundoPlano();
  if (navigator.onLine) return baixarPacote(E.dia, !!pacoteDe(E.dia)).then(function () { return enviar('app aberto'); });
}).catch(function (e) {
  $('corpo').innerHTML = '<div class="aviso erro">O app não conseguiu abrir o banco do celular: ' + esc(e && e.message || e) + '. Feche e abra de novo; se continuar, fale com o supervisor.</div>';
});
