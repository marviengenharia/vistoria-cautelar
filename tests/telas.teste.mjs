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
  ok(await page.evaluate(async () => (await caches.keys()).includes('vistoria-0.2.0')), 'cache vistoria-0.2.0 criado');
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

  // ---------- sem internet ----------
  await pararServidor();
  await page.goto(base + '#/');
  await page.waitForSelector('.segmentos', { timeout: 10000 });
  ok(await contarCartoes() === 3, 'SEM SERVIDOR: lista abre do aparelho');
  await page.goto(base + '#/imovel/IM-001/ambientes');
  await page.waitForSelector('[data-ambiente]', { timeout: 10000 });
  ok((await page.$$('.miniatura-foto')).length === 2, 'SEM SERVIDOR: fotos da sala continuam lá');
}
