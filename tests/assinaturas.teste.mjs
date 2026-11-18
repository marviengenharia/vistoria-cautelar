// Banco v3: horas da foto, tabela de assinaturas e travas das fotos assinadas.
export default async function ({ page, base, ok }) {
  // 1) banco "versão 2" como o do celular, com uma foto sem entrouEm
  await page.goto(base + 'manifest.json');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('vistoria-cautelar', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('imoveis', { keyPath: 'id' }).createIndex('status', 'status');
      db.createObjectStore('config');
      db.createObjectStore('ambientes', { keyPath: 'id' }).createIndex('imovelId', 'imovelId');
      const fotos = db.createObjectStore('fotos', { keyPath: 'id' });
      fotos.createIndex('imovelId', 'imovelId');
      fotos.createIndex('ambienteId', 'ambienteId');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['imoveis', 'ambientes', 'fotos'], 'readwrite');
      tx.objectStore('imoveis').put({ id: 'IM-001', status: 'pendente', endereco: 'Rua A', estaca: '', lado: '' });
      tx.objectStore('ambientes').put({ id: 'AMB-antigo', imovelId: 'IM-001', nome: 'Sala', criadoEm: '2026-11-01T10:00:00.000Z' });
      tx.objectStore('fotos').put({
        id: 'FOTO-antiga', imovelId: 'IM-001', ambienteId: 'AMB-antigo',
        blob: new Blob(['a'], { type: 'image/jpeg' }), miniatura: new Blob(['m'], { type: 'image/jpeg' }),
        hash: 'h0', tiradaEm: '2026-11-01T10:05:00.000Z', patologias: [], local: '', abertura: null, descricao: '',
      });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    req.onerror = () => reject(req.error);
  }));

  await page.goto(base);
  await page.waitForSelector('.cartao-foto');

  const r = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const dom = await import('/js/dominio.js');
    const out = {};
    const conexao = await new Promise((res) => { const q = indexedDB.open('vistoria-cautelar'); q.onsuccess = () => res(q.result); });
    out.versao = conexao.version;
    out.depositos = [...conexao.objectStoreNames];
    conexao.close();

    const antiga = await db.obterFoto('FOTO-antiga');
    out.antiga = { igual: antiga.entrouEm === antiga.tiradaEm && !!antiga.entrouEm, origem: antiga.origemHora };

    const jpg = (t) => new Blob([t], { type: 'image/jpeg' });
    const png = (t) => new Blob([t], { type: 'image/png' });
    const pessoa = (nome) => ({ nome, assinatura: png('traço ' + nome) });
    const nova = (t, extra = {}) => ({ foto: jpg(t), miniatura: jpg('m' + t), hash: 'h-' + t, ...extra });
    const dadosCiencia = () => ({
      tipo: 'ciencia', texto: 'texto do termo', inicio: new Date().toISOString(),
      ocupante: { ...pessoa('Maria'), documento: '123' }, vistoriador: pessoa('Vistoriador'),
    });

    // hora da foto: vinda do arquivo, ou agora quando não vem
    const comHora = await db.adicionarFoto('IM-001', 'AMB-antigo', nova('com-hora', { tiradaEm: '2026-10-01T08:00:00.000Z', origemHora: 'exif' }));
    const semHora = await db.adicionarFoto('IM-001', 'AMB-antigo', nova('sem-hora'));
    out.horas = {
      comHora: [comHora.tiradaEm, comHora.origemHora, !!comHora.entrouEm],
      semHora: [!!semHora.tiradaEm, semHora.origemHora, !!semHora.entrouEm],
    };
    const todas = await db.listarFotosDoImovel('IM-001');
    out.ordem = todas.map((f) => (f.id === comHora.id ? 'exif' : f.id === 'FOTO-antiga' ? 'antiga' : 'agora'));

    // configuração
    await db.gravarConfig('vistoriadorNome', 'Fulano');
    out.config = await db.obterConfig('vistoriadorNome');

    // assinatura de ciência (4 fotos no imóvel agora)
    const fachada = await db.definirFachada('IM-001', nova('fachada'));
    const a1 = await db.gravarAssinatura('IM-001', dadosCiencia());
    out.a1 = {
      fotos: a1.fotos.length, codigo: /^[0-9a-f]{64}$/.test(a1.codigo), status: (await db.obterImovel('IM-001')).status,
      guardouBlob: a1.ocupante.assinatura instanceof Blob, id: a1.id.startsWith('ASS-'),
    };

    const assinadas = await db.idsFotosAssinadas('IM-001');
    out.assinadasTamanho = assinadas.size;

    const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
    out.excluirAssinada = await tenta(() => db.excluirFoto('FOTO-antiga'));
    out.antigaAindaLa = !!(await db.obterFoto('FOTO-antiga'));
    out.excluirAmbiente = await tenta(() => db.excluirAmbiente('AMB-antigo'));
    out.ambienteAindaLa = (await db.listarAmbientes('IM-001')).some((a) => a.id === 'AMB-antigo');
    out.trocarFachada = await tenta(() => db.definirFachada('IM-001', nova('outra-fachada')));
    out.fachadaIntacta = (await db.obterImovel('IM-001')).fachada.fotoId === fachada.fachada.fotoId;
    out.mensagem = dom.FOTO_ASSINADA;

    // foto adicionada depois da assinatura continua apagável
    const depois = await db.adicionarFoto('IM-001', 'AMB-antigo', nova('depois'));
    out.depoisNaoAssinada = !(await db.idsFotosAssinadas('IM-001')).has(depois.id);
    out.excluirDepois = await tenta(() => db.excluirFoto(depois.id));
    out.depoisSumiu = !(await db.obterFoto(depois.id));

    // segunda assinatura (recusa): a primeira continua igual
    const antes = JSON.stringify(a1.fotos);
    const a2 = await db.gravarAssinatura('IM-001', {
      tipo: 'recusa', texto: 'recusa', inicio: new Date().toISOString(), motivoRecusa: 'sem tempo',
      testemunha: pessoa('Testemunha'), vistoriador: pessoa('Vistoriador'),
    });
    const lista = await db.listarAssinaturas('IM-001');
    out.lista = { qtd: lista.length, primeiraEhNova: lista[0].id === a2.id, antigaIgual: JSON.stringify(lista[1].fotos) === antes && lista[1].codigo === a1.codigo };
    out.codigosDiferentes = a1.codigo !== a2.codigo;

    // textos dos termos
    out.textoCiencia = dom.textoTermoCiencia({ id: 'IM-001', data: new Date(2026, 10, 18), totalFotos: 32 });
    out.textoUma = dom.textoTermoCiencia({ id: 'IM-001', data: new Date(2026, 0, 5), totalFotos: 1 });
    out.textoRecusa = dom.textoTermoRecusa({ id: 'IM-001', data: new Date(2026, 10, 18), motivo: 'sem tempo' });

    // excluir o imóvel leva as assinaturas
    await db.excluirImovel('IM-001');
    out.restantes = (await db.listarAssinaturas('IM-001')).length;
    return out;
  });

  ok(r.versao === 3, `banco na versão 3 (${r.versao})`);
  ok(r.depositos.includes('assinaturas'), 'depósito assinaturas criado');
  ok(r.antiga.igual && r.antiga.origem === 'app', 'foto antiga: entrouEm = tiradaEm e origemHora app');
  ok(r.horas.comHora[0] === '2026-10-01T08:00:00.000Z' && r.horas.comHora[1] === 'exif' && r.horas.comHora[2], 'foto guarda tiradaEm e origemHora vindos do arquivo');
  ok(r.horas.semHora[0] && r.horas.semHora[1] === 'app' && r.horas.semHora[2], 'foto sem hora usa agora e origem app');
  ok(r.ordem.join() === 'exif,antiga,agora', `listarFotosDoImovel ordena por tiradaEm (${r.ordem})`);
  ok(r.config === 'Fulano', 'config vistoriadorNome grava e lê');
  ok(r.a1.fotos === 4 && r.a1.codigo && r.a1.id, `assinatura lista as fotos do imóvel e tem código (${r.a1.fotos})`);
  ok(r.a1.status === 'vistoriado', `ciência muda o status para vistoriado (${r.a1.status})`);
  ok(r.a1.guardouBlob, 'imagem da assinatura guardada como Blob');
  ok(r.assinadasTamanho === 4, `idsFotosAssinadas tem as 4 fotos (${r.assinadasTamanho})`);
  ok(r.excluirAssinada === r.mensagem && r.antigaAindaLa, 'excluirFoto de foto assinada é recusado e a foto fica');
  ok(r.excluirAmbiente === r.mensagem && r.ambienteAindaLa, 'excluirAmbiente com foto assinada é recusado');
  ok(r.trocarFachada === r.mensagem && r.fachadaIntacta, 'definirFachada com fachada assinada é recusado');
  ok(r.depoisNaoAssinada && r.excluirDepois === null && r.depoisSumiu, 'foto posterior à assinatura pode ser apagada');
  ok(r.lista.qtd === 2 && r.lista.primeiraEhNova && r.lista.antigaIgual, 'segunda assinatura: 2 na lista, nova primeiro, antiga intacta');
  ok(r.codigosDiferentes, 'códigos das assinaturas são diferentes');
  ok(r.textoCiencia === 'Declaro que acompanhei a vistoria cautelar do meu imóvel (IM-001) em 18/11/2026 e que as 32 fotos registradas mostram o estado do imóvel nesta data.', 'texto do termo de ciência');
  ok(r.textoUma.includes('em 05/01/2026') && r.textoUma.includes('a 1 foto registrada mostra'), 'termo de ciência: data com zero e singular');
  ok(r.textoRecusa === 'Declaro que presenciei, em 18/11/2026, a recusa do ocupante do imóvel IM-001 em permitir a vistoria cautelar. Motivo informado: sem tempo.', 'texto do termo de recusa');
  ok(r.restantes === 0, 'excluirImovel apaga as assinaturas');
}
