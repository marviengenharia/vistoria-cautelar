import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fluxo completo pelas telas: fachada, lista com filtros, ambientes, patologias e uso sem internet.
export default async function ({ page, base, ok, fixture, esperar, pararServidor }) {
  const contarCartoes = () => page.$$eval('.cartao-foto', (l) => l.length);
  const voltarParaLista = async () => {
    await page.goto(base + '#/');
    await page.waitForSelector('.segmentos');
  };

  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle0' });
  ok(await page.evaluate(async () => (await caches.keys()).includes('vistoria-0.4.0')), 'cache vistoria-0.4.0 criado');
  ok(await page.$eval('body', (b) => getComputedStyle(b).fontFamily.includes('Barlow')), 'fonte Barlow em uso');

  // ---------- IM-001: fachada ----------
  await page.click('#novo-imovel');
  await page.waitForSelector('#botao-fachada');
  ok(await page.$eval('#botao-fachada', (b) => b.textContent.trim()) === 'Tirar foto da fachada', 'imóvel novo pede a foto da fachada');

  const entrada = await page.$('#entrada-fachada');
  await entrada.uploadFile(fixture('fachada.jpg'));
  await page.waitForSelector('#ver-fachada img', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#ver-fachada img').naturalWidth > 0);
  ok(await page.$eval('#ver-fachada img', (i) => i.naturalWidth) === 1600, 'capa mostra a foto da fachada (1600 px)');

  // arquivo que não é imagem
  await (await page.$('#entrada-fachada')).uploadFile(fixture('../rodar.mjs'));
  await page.waitForFunction(() => /Não foi possível ler essa imagem/.test(document.querySelector('#mensagem').textContent), { timeout: 10000 });
  ok(Boolean(await page.$('#ver-fachada img')), 'arquivo inválido mostra aviso e mantém a foto anterior');

  // estaca e lado
  await page.click('details[data-bloco="localizacao"] > summary');
  await page.type('input[name="estaca"]', '30+10');
  await page.click('input[name="lado"][value="LE"] + span');
  await esperar(700);
  ok((await page.$eval('#capa-local', (p) => p.textContent)) === 'Estaca 30+10, lado esquerdo', 'capa mostra estaca e lado por extenso');
  ok(!(await page.$eval('details[data-bloco="localizacao"] .bloco-resumo', (s) => s.textContent)).includes('·'), 'resumo em frase, sem "·"');

  // ---------- IM-002 (LD, E31) e IM-003 (LE, E50) sem foto ----------
  for (const [lado, estaca] of [['LD', '31'], ['LE', '50']]) {
    await voltarParaLista();
    await page.click('#novo-imovel');
    await page.waitForSelector('#form-dados');
    await page.click('details[data-bloco="localizacao"] > summary');
    await page.type('input[name="estaca"]', estaca);
    await page.click(`input[name="lado"][value="${lado}"] + span`);
    await esperar(700);
  }
  // IM-004 sem estaca nem lado
  await voltarParaLista();
  await page.click('#novo-imovel');
  await page.waitForSelector('#form-dados');

  // ---------- lista ----------
  await voltarParaLista();
  ok(await page.$eval('.segmento[data-lado="LE"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'lado esquerdo vem marcado');
  const nomes = await page.$$eval('.cartao-foto .num', (l) => l.map((n) => n.textContent));
  ok(nomes.join() === 'IM-004,IM-001,IM-003', `LE: sem local primeiro, depois por estaca (${nomes})`);
  ok(await page.$eval('.cartao-foto[href$="IM-001"] img', (i) => i.naturalWidth) === 240, 'cartão do IM-001 mostra a miniatura');
  ok(Boolean(await page.$('.cartao-foto[href$="IM-003"] .foto-vazia')), 'imóvel sem foto mostra a casinha');

  await page.click('.segmento[data-lado="LD"]');
  ok((await page.$$eval('.cartao-foto .num', (l) => l.map((n) => n.textContent))).join() === 'IM-004,IM-002', 'filtro LD');
  await page.click('.segmento[data-lado="ambos"]');
  ok(await contarCartoes() === 4, 'filtro "os dois" mostra todos');

  await page.click('.perto [data-estaca="1"]'); // primeiro toque: primeira estaca com imóvel (30)
  ok((await page.$eval('#estaca-atual', (o) => o.textContent)) === 'E30', 'perto da estaca começa na primeira estaca com imóvel');
  const perto = await page.$$eval('.cartao-foto .num', (l) => l.map((n) => n.textContent));
  ok(perto.join() === 'IM-004,IM-001,IM-002', `perto da E30 (±5) esconde a E50 (${perto})`);
  await page.click('#todas-estacas');
  ok(await contarCartoes() === 4, 'botão "Todas" volta a mostrar todas as estacas');
  await page.click('.segmento[data-lado="LE"]');

  // ---------- ambientes e patologias no IM-001 ----------
  await page.goto(base + '#/imovel/IM-001/ambientes');
  await page.waitForSelector('[data-ambiente]');
  ok((await page.$$eval('[data-ambiente] .bloco-titulo', (l) => l.map((t) => t.textContent))).join() === 'Fachada',
    'ambiente Fachada criado automaticamente com a foto da capa');
  ok(await page.$$eval('[data-ambiente] details, details[data-ambiente]', (l) => l.every((d) => !d.open)), 'ambientes abrem fechados');

  await page.click('.novo-ambiente [data-nome="Sala"]');
  await page.waitForSelector('details[data-ambiente][open]');
  const sala = await page.$eval('details[data-ambiente][open]', (d) => d.dataset.ambiente);
  await page.evaluate((id) => { window.__alvo = id; }, sala);
  // "Da galeria" com duas fotos
  await page.click(`details[data-ambiente="${sala}"] [data-acao="galeria"]`);
  await (await page.$('#entrada-galeria')).uploadFile(fixture('sala.jpg'), fixture('retrato.jpg'));
  await page.waitForFunction((id) => document.querySelectorAll(`details[data-ambiente="${id}"] .miniatura-foto`).length === 2, { timeout: 20000 }, sala);
  ok(true, 'galeria: duas fotos entram de uma vez');
  ok((await page.$eval(`details[data-ambiente="${sala}"] .bloco-resumo`, (s) => s.textContent)) === '2 fotos, 2 sem classificar', 'resumo do ambiente conta as fotos sem classificar');

  // classificar a primeira foto
  await page.click(`details[data-ambiente="${sala}"] .miniatura-foto`);
  await page.waitForSelector('.editor-foto');
  ok(await page.$eval('[data-abertura]', (l) => l.hidden), 'abertura escondida antes de marcar fissura/trinca');
  await page.click('.editor-foto input[value="trinca"] + span');
  ok(!(await page.$eval('[data-abertura]', (l) => l.hidden)), 'abertura aparece ao marcar trinca');
  await page.click('.editor-foto input[value="umidade"] + span');
  await page.click('.editor-foto input[name="local"][value="parede"] + span');
  await page.type('.editor-foto input[name="abertura"]', '1.2');
  await page.type('.editor-foto textarea[name="descricao"]', 'Trinca inclinada acima da porta');
  await esperar(700);
  ok((await page.$eval('.editor-foto .salvamento', (s) => s.textContent)) === 'Salvo', 'editor grava sozinho');
  // "OK, próxima foto" vai para a segunda
  await page.click('.editor-foto [data-editor="proxima"]');
  await page.waitForFunction(() => document.querySelector('.editor-titulo')?.textContent.includes('foto 2 de 2'));
  // "Sem patologia" desmarca as outras
  await page.click('.editor-foto input[value="fissura"] + span');
  await page.click('.editor-foto input[value="sem-patologia"] + span');
  const marcadas = await page.$$eval('.editor-foto input[name="patologia"]:checked', (l) => l.map((c) => c.value));
  ok(marcadas.join() === 'sem-patologia', `"Sem patologia aparente" desmarca as demais (${marcadas})`);
  await page.click('.editor-foto [data-editor="proxima"]'); // última: OK fecha
  await page.waitForFunction(() => !document.querySelector('.editor-foto'));

  const marcas = await page.$$eval(`details[data-ambiente="${sala}"] .marca`, (l) => l.map((m) => m.textContent));
  ok(marcas.join('|') === '2 patologias|✓ Sem patologia', `marcas nas miniaturas (${marcas.join('|')})`);

  // recarrega e confere
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-ambiente]');
  const gravado = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const ambs = await db.listarAmbientes('IM-001');
    const salaAmb = ambs.find((a) => a.nome === 'Sala');
    const [f1] = await db.listarFotos(salaAmb.id);
    return { patologias: f1.patologias, local: f1.local, abertura: f1.abertura, descricao: f1.descricao, hash: f1.hash.length };
  });
  ok(gravado.patologias.join() === 'trinca,umidade' && gravado.local === 'parede' && gravado.abertura === 1.2
    && gravado.descricao === 'Trinca inclinada acima da porta' && gravado.hash === 64,
  `classificação gravada após recarregar (${JSON.stringify(gravado)})`);

  // excluir a foto da capa pelo ambiente Fachada: a capa volta a pedir foto
  await page.click('details[data-ambiente] > summary'); // primeiro ambiente = Fachada
  await page.click('details[data-ambiente] .miniatura-foto');
  await page.waitForSelector('.editor-foto');
  await page.click('.editor-foto [data-editor="excluir"]');
  await page.waitForFunction(() => document.querySelector('#botao-fachada')?.textContent.trim() === 'Tirar foto da fachada');
  ok(true, 'excluir a foto da capa volta a pedir a foto da fachada');

  // ---------- assinaturas ----------
  const mensagemTem = (texto) => page.waitForFunction(
    (t) => { const m = document.querySelector('#mensagem'); return !m.hidden && m.textContent.includes(t); },
    { timeout: 10000 }, texto
  );
  const limparMensagem = () => page.$eval('#mensagem', (m) => { m.hidden = true; m.textContent = ''; });
  const contarAssinaturas = (id) => page.evaluate(async (i) => (await (await import('/js/db.js')).listarAssinaturas(i)).length, id);
  const resumoBloco = (bloco) => page.$eval(`details[data-bloco="${bloco}"] .bloco-resumo`, (s) => s.textContent);
  const abrirBloco = async (bloco) => {
    const sel = `details[data-bloco="${bloco}"]`;
    if (!(await page.$eval(sel, (d) => d.open))) await page.click(`${sel} > summary`);
  };
  const assinar = async (bloco) => {
    await abrirBloco(bloco);
    const sel = `details[data-bloco="${bloco}"] .area-assinatura canvas`;
    await page.waitForSelector(sel);
    await page.$eval(sel, (c) => c.scrollIntoView({ block: 'center' }));
    const caixa = await (await page.$(sel)).boundingBox();
    const y = caixa.y + caixa.height / 2;
    await page.mouse.move(caixa.x + 20, y);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width - 20, y + 15, { steps: 15 });
    await page.mouse.up();
  };
  const concluir = async () => {
    await page.$eval('#concluir-assinaturas', (b) => b.scrollIntoView({ block: 'center' }));
    await page.click('#concluir-assinaturas');
  };

  // sem fotos: não grava
  await page.goto(base + '#/imovel/IM-002/assinaturas');
  await page.waitForSelector('#concluir-assinaturas');
  ok(await page.$$eval('details.bloco', (l) => l.length > 0 && l.every((d) => !d.open)), 'aba Assinaturas: blocos abrem fechados');
  await concluir();
  await mensagemTem('Não há fotos');
  ok(await contarAssinaturas('IM-002') === 0, 'sem fotos: "Concluir assinaturas" avisa e não grava');

  // IM-001: 2 fotos na sala
  await limparMensagem();
  await page.goto(base + '#/imovel/IM-001/assinaturas');
  await page.waitForSelector('details[data-bloco="fotos"]');
  ok(await resumoBloco('fotos') === '2 fotos em 1 ambiente', `resumo das fotos (${await resumoBloco('fotos')})`);
  ok(await resumoBloco('morador') === 'Falta assinar', 'morador começa "Falta assinar"');
  await abrirBloco('fotos');
  ok(await page.$$eval('details[data-bloco="fotos"] .miniatura-foto', (l) => l.length) === 2
    && !(await page.$('details[data-bloco="fotos"] .marca')), 'morador vê as 2 miniaturas, sem patologias');
  await abrirBloco('morador');
  await page.type('input[name="moradorNome"]', 'Maria Teste');
  await page.type('input[name="moradorDocumento"]', '123');
  ok((await page.$eval('details[data-bloco="morador"] .termo', (p) => p.textContent)).includes('as 2 fotos registradas'), 'termo de ciência na tela com o total de fotos');
  await concluir();
  await mensagemTem('assinatura do morador');
  ok(await contarAssinaturas('IM-001') === 0, 'sem o traço do morador: não conclui');
  await assinar('morador');
  ok(await resumoBloco('morador') === 'Pronto para concluir', 'morador: "Pronto para concluir" depois do traço');
  await page.click('details[data-bloco="morador"] > summary'); // fechar não perde o traço
  await abrirBloco('vistoriador');
  await page.type('input[name="vistoriadorNome"]', 'João Vistoriador');
  await assinar('vistoriador');
  await limparMensagem();
  await page.$eval('#concluir-assinaturas', (b) => b.scrollIntoView({ block: 'center' }));
  const travado = await page.evaluate(() => {
    document.querySelector('#concluir-assinaturas').click();
    return {
      fieldset: document.querySelector('#form-assinaturas fieldset')?.disabled === true,
      concluir: document.querySelector('#concluir-assinaturas').disabled,
    };
  });
  ok(travado.fieldset && travado.concluir, `formulário travado enquanto grava (${JSON.stringify(travado)})`);
  await page.waitForSelector('.assinatura-feita', { timeout: 10000 });
  const feita = await page.$eval('.assinatura-feita', (s) => s.textContent);
  ok(/Assinado em .* por Maria Teste/.test(feita) && feita.includes('2 fotos'), 'quadro "Assinado em … por Maria Teste · 2 fotos"');
  ok(await page.$$eval('.assinatura-feita img', (l) => l.length) === 2, 'quadro mostra as duas assinaturas');
  await page.waitForFunction(() => document.querySelector('.capa .selo')?.textContent === 'Vistoriado');
  ok(true, 'selo da capa vira "Vistoriado"');
  const gravada = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const [a] = await db.listarAssinaturas('IM-001');
    const fotos = await db.listarFotosDoImovel('IM-001');
    const larg = (await createImageBitmap(a.ocupante.assinatura)).width;
    return {
      tipo: a.tipo, nome: a.ocupante.nome, doc: a.ocupante.documento, larg,
      inicio: a.inicio === fotos[0].tiradaEm, texto: a.texto, vist: await db.obterConfig('vistoriadorNome'),
    };
  });
  ok(gravada.tipo === 'ciencia' && gravada.nome === 'Maria Teste' && gravada.doc === '123' && gravada.inicio
    && gravada.texto.includes('as 2 fotos') && gravada.vist === 'João Vistoriador',
  `assinatura de ciência gravada (${JSON.stringify(gravada)})`);
  ok(gravada.larg > 320, `assinatura com a largura da tela (${gravada.larg} px)`);

  // ambientes: cadeado, editor travado, foto nova "Depois da assinatura"
  await page.goto(base + '#/imovel/IM-001/ambientes');
  await page.waitForSelector('[data-ambiente]');
  await page.click(`details[data-ambiente="${sala}"] > summary`);
  ok(await page.$$eval(`details[data-ambiente="${sala}"] .marca-cadeado`, (l) => l.length) === 2, 'fotos assinadas com cadeado');
  await page.click(`details[data-ambiente="${sala}"] .miniatura-foto`);
  await page.waitForSelector('.editor-foto');
  ok(!(await page.$('.editor-foto [data-editor="excluir"]')), 'foto assinada: sem "Excluir esta foto"');
  const prova = await page.$eval('.editor-corpo', (p) => p.textContent);
  ok(prova.includes('Assinada pelo morador em') && prova.includes('Entrou no app em'), `editor mostra a assinatura e a hora de entrada (${prova.replace(/\s+/g, ' ')})`);
  await page.click('.editor-foto [data-editor="fechar"]');
  await page.waitForFunction(() => !document.querySelector('.editor-foto'));
  await limparMensagem();
  await page.click(`details[data-ambiente="${sala}"] [data-acao="excluir-ambiente"]`);
  await mensagemTem('consta numa assinatura');
  ok(Boolean(await page.$(`details[data-ambiente="${sala}"]`)), 'ambiente com foto assinada não é excluído (mostra o aviso)');

  await page.click(`details[data-ambiente="${sala}"] [data-acao="galeria"]`);
  await (await page.$('#entrada-galeria')).uploadFile(fixture('fachada.jpg'));
  await page.waitForFunction((id) => document.querySelectorAll(`details[data-ambiente="${id}"] .miniatura-foto`).length === 3, { timeout: 20000 }, sala);
  const depois = await page.$$eval(`details[data-ambiente="${sala}"] .marca-depois`, (l) => l.map((m) => m.textContent));
  ok(depois.join() === 'Depois da assinatura', `foto nova marcada "Depois da assinatura" (${depois})`);
  await page.click(`details[data-ambiente="${sala}"] .miniatura-foto:has(.marca-depois)`);
  await page.waitForSelector('.editor-foto [data-editor="excluir"]');
  const editorDepois = await page.$eval('.editor-corpo', (p) => p.textContent.replace(/\s+/g, ' '));
  ok(editorDepois.includes('Foto tirada depois da última assinatura; ainda não foi conferida pelo morador.'), 'editor: foto tirada depois da assinatura avisa que não foi conferida');
  ok(editorDepois.includes('Data do arquivo:') && !editorDepois.includes('Tirada em'), `editor: foto da galeria mostra "Data do arquivo" (${editorDepois})`);
  await page.click('.editor-foto [data-editor="excluir"]');
  await page.waitForFunction((id) => document.querySelectorAll(`details[data-ambiente="${id}"] .miniatura-foto`).length === 2, { timeout: 10000 }, sala);
  ok(true, 'foto nova (não assinada) pode ser excluída');

  // nova assinatura: a anterior vai para o histórico
  await page.goto(base + '#/imovel/IM-001/assinaturas');
  await page.waitForSelector('#nova-assinatura');
  await page.click('#nova-assinatura');
  await page.waitForSelector('#concluir-assinaturas');
  ok((await page.$eval('#conteudo-aba', (c) => c.textContent)).includes('fica guardada'), '"Colher nova assinatura" avisa que a anterior fica guardada');
  ok(await page.$eval('input[name="vistoriadorNome"]', (i) => i.value) === 'João Vistoriador', 'nome do vistoriador lembrado');
  await abrirBloco('morador');
  await page.type('input[name="moradorNome"]', 'Maria Teste');
  await assinar('morador');
  await assinar('vistoriador');
  // uma foto entra no banco com a tela aberta: a gravação é recusada e a tela recarrega
  const fotoIntrusa = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const [fotoSala] = await db.listarFotosDoImovel('IM-001').then((l) => l.filter((f) => f.local !== 'fachada'));
    const jpg = (t) => new Blob([t], { type: 'image/jpeg' });
    return (await db.adicionarFoto('IM-001', fotoSala.ambienteId, { foto: jpg('x'), miniatura: fotoSala.miniatura, hash: 'h-x' })).id;
  });
  await limparMensagem();
  await concluir();
  await mensagemTem('As fotos mudaram enquanto a tela estava aberta. Confira as fotos e colha a assinatura de novo.');
  ok(await contarAssinaturas('IM-001') === 1, 'fotos mudaram com a tela aberta: nada gravado');
  await page.waitForFunction(() => document.querySelectorAll('details[data-bloco="fotos"] .miniatura-foto').length === 3);
  ok(await resumoBloco('morador') === 'Falta assinar', 'tela recarregada com as fotos novas e o morador precisa assinar de novo');
  ok(await page.$eval('#form-assinaturas fieldset', (f) => !f.disabled) && await page.$eval('#concluir-assinaturas', (b) => !b.disabled),
    'formulário liberado depois do erro');
  await page.evaluate(async (id) => (await import('/js/db.js')).excluirFoto(id), fotoIntrusa);
  await page.goto(base + '#/imovel/IM-001/dados');
  await page.waitForSelector('#form-dados');
  await page.goto(base + '#/imovel/IM-001/assinaturas');
  await page.waitForSelector('#nova-assinatura');
  await page.click('#nova-assinatura');
  await page.waitForSelector('#concluir-assinaturas');
  await abrirBloco('morador');
  await page.type('input[name="moradorNome"]', 'Maria Teste');
  await assinar('morador');
  await assinar('vistoriador');
  await concluir();
  await page.waitForSelector('.assinatura-feita');
  ok(await contarAssinaturas('IM-001') === 2 && await page.$$eval('.historico-item', (l) => l.length) === 1,
    'nova assinatura gravada; a anterior aparece no histórico');

  // IM-003 recusado: fachada, motivo e testemunha
  await page.goto(base + '#/imovel/IM-003/dados');
  await page.waitForSelector('#form-dados');
  await (await page.$('#entrada-fachada')).uploadFile(fixture('fachada.jpg'));
  await page.waitForSelector('#ver-fachada img', { timeout: 15000 });
  await page.click('details[data-bloco="situacao"] > summary');
  await page.click('input[name="status"][value="recusado"] + span');
  await page.waitForSelector('textarea[name="recusaMotivo"]', { visible: true });
  await page.type('textarea[name="recusaMotivo"]', 'Não quis receber');
  await page.type('input[name="recusaTestemunha"]', 'José Vizinho');
  ok((await page.$eval('[data-so-se-recusado]', (d) => d.textContent)).includes('O Termo de Recusa é assinado na aba Assinaturas.'), 'ajuda da recusa aponta a aba Assinaturas');
  await esperar(700);
  await page.goto(base + '#/imovel/IM-003/assinaturas');
  await page.waitForSelector('details[data-bloco="recusa"]');
  ok((await page.$$eval('details.bloco', (l) => l.map((d) => d.dataset.bloco))).join() === 'recusa,testemunha,vistoriador', 'recusa: blocos recusa, testemunha e vistoriador');
  ok(await resumoBloco('recusa') === 'Não quis receber', `bloco Recusa mostra o motivo (${await resumoBloco('recusa')})`);
  await abrirBloco('testemunha');
  ok(await page.$eval('input[name="testemunhaNome"]', (i) => i.value) === 'José Vizinho', 'nome da testemunha vem dos Dados');
  ok(await page.$eval('input[name="testemunhaNome"]', (i) => i.readOnly), 'nome da testemunha é somente leitura na aba Assinaturas');
  await assinar('vistoriador');
  await limparMensagem();
  await concluir();
  await mensagemTem('assinatura da testemunha');
  ok(await contarAssinaturas('IM-003') === 0, 'recusa sem o traço da testemunha: não conclui');
  await assinar('testemunha');
  await concluir();
  await page.waitForSelector('.assinatura-feita', { timeout: 10000 });
  const recusa = await page.evaluate(async () => {
    const [a] = await (await import('/js/db.js')).listarAssinaturas('IM-003');
    return { tipo: a.tipo, motivo: a.motivoRecusa, testemunha: a.testemunha.nome, fotos: a.fotos.length, ocupante: a.ocupante ?? null };
  });
  ok(recusa.tipo === 'recusa' && recusa.motivo === 'Não quis receber' && recusa.testemunha === 'José Vizinho'
    && recusa.fotos === 1 && recusa.ocupante === null, `termo de recusa gravado (${JSON.stringify(recusa)})`);
  ok(await page.$eval('.capa .selo', (s) => s.textContent) === 'Recusado', 'recusa mantém a situação "Recusado"');
  await limparMensagem();
  await page.click('#botao-fachada');
  await mensagemTem('consta numa assinatura');
  ok(true, 'fachada assinada: "Trocar foto" mostra o aviso');

  // ---------- backup ----------
  // no Edge de teste não há folha de compartilhamento: o arquivo é "baixado" (o clique é só contado)
  const espiarDownloads = () => page.evaluate(() => {
    window.__baixados = [];
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__baixados.push(this.download); };
  });
  const hoje = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.goto(base + '#/');
  await page.waitForSelector('.segmentos');
  await espiarDownloads();
  await page.waitForSelector('.aviso-backup');
  ok(await page.$eval('.aviso-backup-texto', (p) => p.textContent.trim()) === '4 imóveis sem backup', 'tela inicial: "4 imóveis sem backup"');
  ok(await page.$eval('.aviso-backup', (s) => s.dataset.alerta) === 'false', 'aviso sem cor de alerta (imóveis criados hoje, nunca copiados)');
  ok(await page.$eval('.aviso-backup button', (b) => b.textContent.trim()) === 'Fazer backup dos 4', 'botão "Fazer backup dos 4"');
  ok(await page.$eval('.aviso-backup', (s) => s.closest('.pagina-lista') && !s.closest('.topo')), 'aviso fica abaixo do placar, no início da lista');
  await page.click('.aviso-backup button');
  await page.waitForFunction(() => document.querySelector('.aviso-backup button')?.textContent.trim() === 'Compartilhar 4 arquivos', { timeout: 20000 });
  ok(true, 'arquivos preparados: botão "Compartilhar 4 arquivos"');
  await page.click('.aviso-backup button');
  await page.waitForFunction(() => !document.querySelector('.aviso-backup'), { timeout: 10000 });
  const baixados = await page.evaluate(() => window.__baixados.slice().sort());
  ok(baixados.join() === ['IM-001', 'IM-002', 'IM-003', 'IM-004'].map((i) => `${i}_${hoje}.zip`).join(),
    `os 4 arquivos "baixados" e o aviso some (${baixados})`);
  ok((await page.evaluate(async () => (await import('/js/backup.js')).imoveisSemBackup())).length === 0, 'backup registrado para os 4');

  // mudança só de patologia: o imóvel volta a ficar sem backup
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const [f] = (await db.listarFotosDoImovel('IM-001')).filter((x) => x.local !== 'fachada');
    await db.atualizarFoto(f.id, { descricao: 'mudou depois do backup' });
  });
  await page.goto(base + '#/imovel/IM-001/dados');
  await page.waitForSelector('#form-dados');
  await page.goto(base + '#/');
  await page.waitForSelector('.aviso-backup');
  ok(await page.$eval('.aviso-backup-texto', (p) => p.textContent.trim()) === '1 imóvel sem backup'
    && await page.$eval('.aviso-backup button', (b) => b.textContent.trim()) === 'Fazer backup do IM-001',
  'mudança numa foto: "1 imóvel sem backup" e "Fazer backup do IM-001"');

  // botão na tela do imóvel (aba Dados, acima de "Excluir")
  await page.goto(base + '#/imovel/IM-001/dados');
  await page.waitForSelector('#fazer-backup');
  ok(await page.$eval('#fazer-backup', (b) => b.nextElementSibling?.id === 'excluir' && b.textContent.trim() === 'Fazer backup deste imóvel'),
    'aba Dados: "Fazer backup deste imóvel" logo acima de "Excluir"');
  await limparMensagem();
  await page.$eval('#fazer-backup', (b) => b.scrollIntoView({ block: 'center' }));
  await page.click('#fazer-backup');
  await page.waitForFunction((n) => document.querySelector('#fazer-backup').textContent.trim() === `Compartilhar ${n}`, { timeout: 20000 }, `IM-001_${hoje}.zip`);
  ok(true, `imóvel: botão vira "Compartilhar IM-001_${hoje}.zip"`);
  // desistiu na folha de compartilhamento: nada registrado, o botão continua para tentar de novo
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(new DOMException('desistiu', 'AbortError'));
  });
  await page.click('#fazer-backup');
  await page.waitForFunction(() => !document.querySelector('#fazer-backup').disabled);
  const aposCancelar = await page.evaluate(async () => ({
    botao: document.querySelector('#fazer-backup').textContent.trim(),
    pendentes: (await (await import('/js/backup.js')).imoveisSemBackup()).map((p) => p.id).join(),
  }));
  ok(aposCancelar.botao === `Compartilhar IM-001_${hoje}.zip` && aposCancelar.pendentes === 'IM-001',
    `cancelado: backup não registrado e "Compartilhar" continua (${JSON.stringify(aposCancelar)})`);
  await page.evaluate(() => { delete navigator.canShare; delete navigator.share; window.__baixados = []; });
  await page.click('#fazer-backup');
  await mensagemTem('Backup de IM-001 feito.');
  ok((await page.evaluate(() => window.__baixados)).join() === `IM-001_${hoje}.zip`
    && await page.$eval('#fazer-backup', (b) => b.textContent.trim()) === 'Fazer backup deste imóvel',
  'imóvel: arquivo "baixado", mensagem "Backup de IM-001 feito." e o botão volta ao normal');
  await page.goto(base + '#/');
  await page.waitForSelector('.segmentos');
  ok(!(await page.$('.aviso-backup')), 'sem pendentes, o aviso some');

  // alerta = sem backup há mais de 2 dias, contados do último backup (ou da criação, se nunca teve)
  // backupEm null = o imóvel nunca teve backup
  const gravarDireto = (campos, backupEm) => page.evaluate((c, bk) => new Promise((res, rej) => {
    const q = indexedDB.open('vistoria-cautelar');
    q.onsuccess = () => {
      const tx = q.result.transaction(['imoveis', 'config'], 'readwrite');
      const imoveis = tx.objectStore('imoveis');
      const config = tx.objectStore('config');
      imoveis.get('IM-002').onsuccess = (e) => imoveis.put({ ...e.target.result, ...c });
      config.get('backups').onsuccess = (e) => {
        const backups = { ...e.target.result };
        if (bk) backups['IM-002'] = bk; else delete backups['IM-002'];
        config.put(backups, 'backups');
      };
      tx.oncomplete = () => { q.result.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  }), campos, backupEm);
  const diasAtras = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const alertaAgora = async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.aviso-backup');
    return page.$eval('.aviso-backup', (s) => s.dataset.alerta);
  };
  await gravarDireto({ atualizadoEm: new Date().toISOString() }, diasAtras(1));
  ok(await alertaAgora() === 'false', 'último backup há 1 dia e mudança hoje: sem alerta');
  await gravarDireto({ criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() }, null);
  ok(await alertaAgora() === 'false', 'nunca teve backup, criado hoje: sem alerta');
  await gravarDireto({ criadoEm: diasAtras(3), atualizadoEm: new Date().toISOString() }, null);
  ok(await alertaAgora() === 'true', 'nunca teve backup, criado há 3 dias: alerta');
  await gravarDireto({ atualizadoEm: new Date().toISOString() }, diasAtras(3));
  ok(await alertaAgora() === 'true', 'último backup há 3 dias e mudança hoje: alerta (mexer todo dia não esconde)');
  const alerta = await page.$eval('.aviso-backup', (s) => ({ attr: s.dataset.alerta, cor: getComputedStyle(s).borderLeftColor }));
  const corPerigo = await page.evaluate(() => {
    const t = document.createElement('i');
    t.style.color = 'var(--perigo)';
    document.body.append(t);
    const c = getComputedStyle(t).color;
    t.remove();
    return c;
  });
  ok(alerta.attr === 'true' && alerta.cor === corPerigo, `sem backup há mais de 2 dias: aviso em cor de alerta (${alerta.cor})`);

  // arquivo preparado e depois a fachada muda: o arquivo velho é descartado
  await page.goto(base + '#/imovel/IM-002/dados');
  await page.waitForSelector('#fazer-backup');
  await page.$eval('#fazer-backup', (b) => b.scrollIntoView({ block: 'center' }));
  await page.click('#fazer-backup');
  await page.waitForFunction(() => document.querySelector('#fazer-backup').textContent.trim().startsWith('Compartilhar '), { timeout: 20000 });
  await limparMensagem();
  await (await page.$('#entrada-fachada')).uploadFile(fixture('fachada.jpg'));
  await mensagemTem('Foto da fachada gravada.');
  ok(await page.$eval('#fazer-backup', (b) => b.textContent.trim()) === 'Fazer backup deste imóvel',
    'fachada trocada depois de preparar: o arquivo preparado é descartado');

  // ---------- meus dados ----------
  await voltarParaLista();
  ok(await page.$eval('#meus-dados', (l) => l.textContent.trim() === 'Meus dados'
    && l.parentElement === document.querySelector('#restaurar').parentElement && l.closest('.pagina-lista')),
  'tela inicial: link discreto "Meus dados" ao lado de "Restaurar backup"');
  await page.click('#meus-dados');
  await page.waitForSelector('#form-meus-dados');
  ok(await page.evaluate(() => location.hash) === '#/meus-dados', 'Meus dados abre em #/meus-dados');
  ok(await page.$eval('input[name="nome"]', (i) => i.value) === 'João Vistoriador', 'Meus dados: o nome usado nas assinaturas já vem preenchido');
  ok((await page.$eval('#form-meus-dados', (f) => f.textContent)).includes('Seu nome sai como responsável técnico no laudo'),
    'Meus dados explica para que serve o nome');
  await page.type('input[name="crea"]', '000000/D-TESTE');
  await page.type('input[name="art"]', 'ART-TESTE-1');
  await esperar(700);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#form-meus-dados');
  const meus = await page.evaluate(async () => ({
    tela: ['nome', 'crea', 'art'].map((n) => document.querySelector(`input[name="${n}"]`).value).join('|'),
    config: await (await import('/js/db.js')).obterConfig('meusDados'),
  }));
  ok(meus.tela === 'João Vistoriador|000000/D-TESTE|ART-TESTE-1'
    && JSON.stringify(meus.config) === JSON.stringify({ nome: 'João Vistoriador', crea: '000000/D-TESTE', art: 'ART-TESTE-1' }),
  `Meus dados grava sozinho e volta preenchido (${JSON.stringify(meus)})`);

  // ---------- aba Laudo ----------
  // o Edge de teste diz que compartilha PDF (zip não), mas a folha nunca abre sem janela: desliga o
  // Compartilhar e o PDF é "baixado" (guarda nome e endereço do arquivo)
  const espiarPdf = () => page.evaluate(() => {
    navigator.canShare = () => false;
    window.__baixados = [];
    window.__urls = [];
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { window.__baixados.push(this.download); window.__urls.push(this.href); }
    };
  });
  const comecoDoPdf = () => page.evaluate(async () => {
    const b = new Uint8Array(await (await fetch(window.__urls[0])).arrayBuffer());
    return String.fromCharCode(...b.subarray(0, 5));
  });
  // guarda cada estado do botão (o "Gerando…" pode durar pouco)
  const vigiarBotao = () => page.evaluate(() => {
    const b = document.querySelector('#gerar-laudo');
    window.__estados = [];
    new MutationObserver(() => window.__estados.push({ desativado: b.disabled, texto: b.textContent.trim() }))
      .observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  await page.goto(base + '#/imovel/IM-001/laudo');
  await page.waitForSelector('#gerar-laudo');
  const assinadoEm = await page.evaluate(async () => {
    const lista = await (await import('/js/db.js')).listarAssinaturas('IM-001');
    const ultima = lista.map((a) => a.assinadoEm).sort().pop();
    return (await import('/js/util.js')).dataHora(ultima);
  });
  const resumoLaudo = await page.$eval('#conteudo-aba', (c) => c.innerText);
  ok(!resumoLaudo.includes('etapa 5'), 'aba Laudo: sem o aviso "chega na etapa 5"');
  ok(resumoLaudo.includes('2 fotos, 1 com patologia'), `aba Laudo: "2 fotos, 1 com patologia" (${resumoLaudo})`);
  ok(resumoLaudo.includes(`Termo assinado em ${assinadoEm}`), `aba Laudo: "Termo assinado em ${assinadoEm}"`);
  ok(resumoLaudo.includes('Responsável: João Vistoriador (CREA 000000/D-TESTE · ART ART-TESTE-1)'), 'aba Laudo: responsável com CREA e ART');
  await espiarPdf();
  await vigiarBotao();
  await page.click('#gerar-laudo');
  const pdfIm001 = `IM-001_${hoje}.pdf`;
  await page.waitForFunction((n) => document.querySelector('#gerar-laudo').textContent.trim() === `Compartilhar ${n}`
    && !document.querySelector('#gerar-laudo').disabled, { timeout: 30000 }, pdfIm001);
  ok((await page.evaluate(() => window.__estados)).some((e) => e.desativado && e.texto === 'Gerando…'),
    'botão "Gerando…" desativado enquanto gera');
  ok(true, `laudo pronto: botão vira "Compartilhar ${pdfIm001}"`);
  await limparMensagem();
  await page.click('#gerar-laudo');
  await mensagemTem('Laudo de IM-001 baixado.');
  ok((await page.evaluate(() => window.__baixados)).join() === pdfIm001 && await comecoDoPdf() === '%PDF-',
    'segundo toque: o PDF é "baixado" (sem Compartilhar no Edge de teste)');
  ok(await page.$eval('#gerar-laudo', (b) => b.textContent.trim()) === 'Gerar laudo', 'depois de baixar, o botão volta a "Gerar laudo"');

  // sem nome em "Meus dados": pede o nome ali mesmo e só gera depois
  await page.evaluate(async () => (await import('/js/db.js')).gravarConfig('meusDados', { nome: '', crea: '', art: '' }));
  await page.goto(base + '#/imovel/IM-002/laudo');
  await page.waitForSelector('#gerar-laudo');
  const rascunho = await page.$eval('#conteudo-aba', (c) => c.innerText);
  ok(rascunho.includes('Termo ainda não assinado — o laudo sai como RASCUNHO'), 'sem assinatura: avisa que sai como RASCUNHO');
  ok(await page.$eval('#gerar-laudo', (b) => b.disabled) && Boolean(await page.$('input[name="laudo-nome"]')),
    'sem nome: campo do nome na própria aba e "Gerar laudo" desativado');
  await page.type('input[name="laudo-nome"]', 'Ana Responsável');
  ok(await page.$eval('#gerar-laudo', (b) => !b.disabled), 'nome digitado: "Gerar laudo" liberado');
  await esperar(700);
  const nomeGravado = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    return [(await db.obterConfig('meusDados')).nome, await db.obterConfig('vistoriadorNome')].join('|');
  });
  ok(nomeGravado === 'Ana Responsável|Ana Responsável', `nome digitado na aba Laudo vai para "Meus dados" (${nomeGravado})`);
  // laudo pronto e a fachada muda: o PDF velho é descartado
  await espiarPdf();
  await page.click('#gerar-laudo');
  await page.waitForFunction(() => document.querySelector('#gerar-laudo').textContent.trim().startsWith('Compartilhar '), { timeout: 30000 });
  await limparMensagem();
  await (await page.$('#entrada-fachada')).uploadFile(fixture('fachada.jpg'));
  await mensagemTem('Foto da fachada gravada.');
  ok(await page.$eval('#gerar-laudo', (b) => b.textContent.trim()) === 'Gerar laudo',
    'fachada trocada depois de gerar: o laudo pronto é descartado');

  // backups do IM-001 (com assinaturas) e do IM-002 (com fachada) guardados para restaurar no fim,
  // depois de eles serem excluídos
  const zips = await page.evaluate(async () => {
    const { montarBackup } = await import('/js/backup.js');
    const { criarZip, lerZip } = await import('/js/zip.js');
    const base64 = async (blob) => {
      const b = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const arquivo = await montarBackup('IM-001');
    const outro = await montarBackup('IM-002');
    // cópia com um byte trocado na primeira foto (e CRC refeito): só a conferência do hash pega
    const mapa = await lerZip(arquivo);
    const json = JSON.parse(new TextDecoder().decode(mapa.get('imovel.json')));
    mapa.get(`fotos/${json.fotos[0].id}.jpg`)[200] ^= 0xff;
    const adulterado = await criarZip([...mapa].map(([nome, dados]) => ({ nome, dados })));
    return {
      nome: arquivo.name, bom: await base64(arquivo), adulterado: await base64(adulterado), atualizadoEm: json.imovel.atualizadoEm,
      nome2: outro.name, bom2: await base64(outro),
    };
  });
  // ---------- sem internet ----------
  await pararServidor();
  await page.goto(base + '#/');
  await page.waitForSelector('.segmentos', { timeout: 10000 });
  ok(await contarCartoes() === 3, 'SEM SERVIDOR: lista abre do aparelho');
  await page.goto(base + '#/imovel/IM-001/ambientes');
  await page.waitForSelector('[data-ambiente]', { timeout: 10000 });
  ok((await page.$$('.miniatura-foto')).length === 2, 'SEM SERVIDOR: fotos da sala continuam lá');
  await page.goto(base + '#/imovel/IM-001/assinaturas');
  await page.waitForSelector('.assinatura-feita', { timeout: 10000 });
  ok(true, 'SEM SERVIDOR: aba Assinaturas abre');
  // recarrega sem servidor: tudo (inclusive o gerador do PDF e o logo) vem do aparelho
  await page.reload({ waitUntil: 'networkidle0' });
  await page.goto(base + '#/imovel/IM-001/laudo');
  await page.waitForSelector('#gerar-laudo', { timeout: 10000 });
  await espiarPdf();
  await page.click('#gerar-laudo');
  await page.waitForFunction((n) => document.querySelector('#gerar-laudo').textContent.trim() === `Compartilhar ${n}`
    && !document.querySelector('#gerar-laudo').disabled, { timeout: 30000 }, pdfIm001);
  await page.click('#gerar-laudo');
  await page.waitForFunction(() => window.__baixados.length === 1, { timeout: 10000 });
  ok(await comecoDoPdf() === '%PDF-', 'SEM SERVIDOR: aba Laudo abre e gera o PDF');

  // ---------- excluir imóvel com assinaturas ----------
  const dialogos = [];
  page.on('dialog', (d) => dialogos.push(d.message()));
  await page.goto(base + '#/imovel/IM-001/dados');
  await page.waitForSelector('#excluir');
  await page.$eval('#excluir', (b) => b.scrollIntoView({ block: 'center' }));
  await page.click('#excluir');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', { timeout: 10000 });
  ok(dialogos[0] === 'Este imóvel tem 2 assinaturas (termo do morador ou de recusa). Excluir apaga também as assinaturas e as fotos assinadas, sem volta. Excluir mesmo?',
    `excluir imóvel com assinaturas pede confirmação própria (${dialogos[0]})`);
  await page.goto(base + '#/imovel/IM-003/dados');
  await page.waitForSelector('#excluir');
  await page.$eval('#excluir', (b) => b.scrollIntoView({ block: 'center' }));
  await page.click('#excluir');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', { timeout: 10000 });
  ok(dialogos[1]?.startsWith('Este imóvel tem 1 assinatura (termo'), `singular com 1 assinatura (${dialogos[1]})`);
  await page.goto(base + '#/imovel/IM-002/dados');
  await page.waitForSelector('#excluir');
  await page.$eval('#excluir', (b) => b.scrollIntoView({ block: 'center' }));
  await page.click('#excluir');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', { timeout: 10000 });
  ok(dialogos[2]?.startsWith('Excluir IM-002?'), `imóvel sem assinatura mantém a confirmação de sempre (${dialogos[2]})`);

  // ---------- restaurar backup (IM-001 e IM-002 foram excluídos acima) ----------
  // os arquivos vão para uma pasta temporária, apagada no fim mesmo se o teste falhar
  const pastaBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'vistoria-restaurar-'));
  try {
    const zipBom = path.join(pastaBackup, zips.nome);
    const zipAdulterado = path.join(pastaBackup, 'adulterado.zip');
    const zipBom2 = path.join(pastaBackup, zips.nome2);
    fs.writeFileSync(zipBom, Buffer.from(zips.bom, 'base64'));
    fs.writeFileSync(zipBom2, Buffer.from(zips.bom2, 'base64'));
    fs.writeFileSync(zipAdulterado, Buffer.from(zips.adulterado, 'base64'));

    await voltarParaLista();
    ok(await page.$eval('#restaurar', (l) => l.textContent.trim() === 'Restaurar backup'
      && l.closest('.pagina-lista') && !l.closest('.aviso-backup')), 'tela inicial: link discreto "Restaurar backup"');
    ok(await page.$eval('#entrada-restaurar', (e) => e.multiple && e.accept === '.zip,application/zip'),
      'restaurar: escolhe um ou vários .zip');
    // depois de restaurar a lista é desenhada de novo (o link volta ao texto normal)
    const listaRedesenhada = () => page.waitForFunction(
      () => document.querySelector('#restaurar span')?.textContent === 'Restaurar backup', { timeout: 10000 });
    const antes = dialogos.length;
    await limparMensagem();
    await (await page.$('#entrada-restaurar')).uploadFile(zipBom, zipAdulterado, zipBom2);
    await mensagemTem('2 imóveis restaurados, 1 com problema');
    await listaRedesenhada();
    ok(true, 'restaurar: resumo "2 imóveis restaurados, 1 com problema"');
    ok(dialogos.length === antes + 1 && dialogos[antes] === 'adulterado.zip: a foto 1 não confere com o código de verificação.',
      `restaurar: arquivo adulterado avisa o motivo e segue (${dialogos.slice(antes).join(' | ')})`);
    await page.click('.segmento[data-lado="ambos"]');
    ok(await page.$('a[href="#/imovel/IM-001"]') && await page.$('a[href="#/imovel/IM-002"] img'),
      'restaurar: IM-001 e IM-002 voltam à lista, IM-002 com a miniatura da fachada');
    ok((await page.evaluate(async () => (await import('/js/db.js')).listarAssinaturas('IM-001'))).length === 2,
      'restaurar: as 2 assinaturas do IM-001 voltam');
    ok(!(await page.evaluate(async () => (await import('/js/backup.js')).imoveisSemBackup())).some((p) => p.id === 'IM-001'),
      'restaurar: IM-001 não aparece como sem backup');

    // de novo: o imóvel já existe → pergunta antes de substituir
    const esperado = await page.evaluate(async (bk) => {
      const { dataHora } = await import('/js/util.js');
      const atual = await (await import('/js/db.js')).obterImovel('IM-001');
      return `IM-001 já existe neste celular (alterado em ${dataHora(atual.atualizadoEm)}). O backup é de ${dataHora(bk)}. Substituir pelo backup?`;
    }, zips.atualizadoEm);
    const antes2 = dialogos.length;
    await limparMensagem();
    await (await page.$('#entrada-restaurar')).uploadFile(zipBom);
    await mensagemTem('1 imóvel restaurado');
    await listaRedesenhada();
    ok(dialogos[antes2] === esperado && /\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/.test(dialogos[antes2]),
      `restaurar: imóvel que já existe pede confirmação, sem aviso de perda nem de backup antigo (${dialogos[antes2]})`);

    // no celular há uma assinatura que não está no backup, e o celular mudou depois do backup
    const esperado2 = await page.evaluate(async (bk) => {
      const db = await import('/js/db.js');
      const { dataHora } = await import('/js/util.js');
      const idsFotos = (await db.listarFotosDoImovel('IM-001')).map((f) => f.id);
      await new Promise((r) => setTimeout(r, 5)); // garante hora de mudança depois da do backup
      await db.gravarAssinatura('IM-001', {
        tipo: 'ciencia', texto: 'termo de teste', idsFotosConferidas: idsFotos,
        ocupante: { nome: 'Pessoa Teste', assinatura: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
        vistoriador: { nome: 'Vistoriador Teste', assinatura: new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' }) },
      });
      const atual = await db.obterImovel('IM-001');
      // a resposta "Cancelar" e o texto da pergunta ficam guardados
      window.__perguntas = [];
      window.confirm = (m) => { window.__perguntas.push(m); return false; };
      return 'Atenção: neste celular há 3 assinaturas; no backup, 2. As que não estão no backup serão apagadas.\n\n'
        + `IM-001 já existe neste celular (alterado em ${dataHora(atual.atualizadoEm)}). O backup é de ${dataHora(bk)}. `
        + 'O backup é mais antigo que o que está no celular. Substituir pelo backup?';
    }, zips.atualizadoEm);
    await limparMensagem();
    await (await page.$('#entrada-restaurar')).uploadFile(zipBom);
    await mensagemTem('0 imóveis restaurados, 1 mantido como estava');
    await listaRedesenhada();
    const pergunta = await page.evaluate(() => window.__perguntas[0]);
    ok(pergunta === esperado2, `restaurar: avisa que assinaturas serão apagadas e que o backup é mais antigo (${pergunta})`);
    ok((await page.evaluate(async () => (await import('/js/db.js')).listarAssinaturas('IM-001'))).length === 3,
      'restaurar: "Cancelar" mantém o imóvel como estava (3 assinaturas)');
  } finally {
    fs.rmSync(pastaBackup, { recursive: true, force: true });
  }
}
