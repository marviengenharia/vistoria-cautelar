// Banco: atualização da versão 1 (celular que já tem dados) e funções de fotos/fachada.
export default async function ({ page, base, ok }) {
  // 1) cria um banco "versão 1" como o que já está no celular, antes de o app abrir
  await page.goto(base + 'manifest.json');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('vistoria-cautelar', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('imoveis', { keyPath: 'id' }).createIndex('status', 'status');
      db.createObjectStore('config');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['imoveis', 'config'], 'readwrite');
      tx.objectStore('imoveis').put({ id: 'IM-001', status: 'pendente', endereco: 'Rua A', estaca: '', lado: '' });
      tx.objectStore('config').put(2, 'proximoNumero');
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    req.onerror = () => reject(req.error);
  }));

  // 2) abre o app: a lista tem que mostrar o imóvel antigo
  await page.goto(base);
  await page.waitForSelector('.cartao-foto');
  ok(await page.$eval('.cartao-foto', (a) => a.getAttribute('aria-label').includes('Rua A')),
    'migração: imóvel da versão 1 continua na lista');

  const r = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const out = {};
    const conexao = await new Promise((res) => { const q = indexedDB.open('vistoria-cautelar'); q.onsuccess = () => res(q.result); });
    out.versao = conexao.version;
    out.depositos = [...conexao.objectStoreNames];
    conexao.close();
    out.novoId = (await db.criarImovel()).id;

    const blob = (t) => new Blob([t], { type: 'image/jpeg' });
    const contarFotos = async (imovelId) => {
      const todas = [];
      for (const a of await db.listarAmbientes(imovelId)) todas.push(...await db.listarFotos(a.id));
      return todas;
    };

    let im = await db.definirFachada('IM-001', { foto: blob('primeira'), miniatura: blob('m1'), hash: 'h1' });
    const primeira = im.fachada.fotoId;
    out.ambientesAposFachada = (await db.listarAmbientes('IM-001')).map((a) => a.nome);
    out.tamanhoFoto = (await db.obterFoto(primeira)).blob.size;

    im = await db.definirFachada('IM-001', { foto: blob('segunda!'), miniatura: blob('m2'), hash: 'h2' });
    const fotos = await contarFotos('IM-001');
    out.trocar = { qtd: fotos.length, ehNova: fotos[0]?.id === im.fachada.fotoId, antigaSumiu: !(await db.obterFoto(primeira)) };
    out.ambientesAposTroca = (await db.listarAmbientes('IM-001')).length;

    // classificação: não deixa trocar a imagem
    const f = await db.atualizarFoto(im.fachada.fotoId, { patologias: ['trinca'], abertura: 0.8, blob: blob('x') });
    out.classificada = { patologias: f.patologias, abertura: f.abertura, blobIntacto: f.blob.size === 'segunda!'.length };
    // só a classificação muda: hora, imóvel e ambiente ficam
    const antes = await db.obterFoto(im.fachada.fotoId);
    const g = await db.atualizarFoto(im.fachada.fotoId, {
      tiradaEm: '2000-01-01T00:00:00.000Z', imovelId: 'IM-999', ambienteId: 'AMB-x', entrouEm: 'x', origemHora: 'exif', id: 'FOTO-x', descricao: 'ok',
    });
    const relida = await db.obterFoto(im.fachada.fotoId);
    out.listaBranca = ['tiradaEm', 'imovelId', 'ambienteId', 'entrouEm', 'origemHora', 'id', 'hash']
      .every((k) => relida[k] === antes[k] && g[k] === antes[k]) && relida.descricao === 'ok';

    // excluir a foto da capa limpa a fachada do imóvel
    await db.excluirFoto(im.fachada.fotoId);
    out.fachadaAposExcluirFoto = (await db.obterImovel('IM-001')).fachada;

    // excluir imóvel apaga ambientes e fotos
    await db.definirFachada('IM-001', { foto: blob('3'), miniatura: blob('m3'), hash: 'h3' });
    const sala = await db.criarAmbiente('IM-001', 'Sala');
    await db.adicionarFoto('IM-001', sala.id, { foto: blob('4'), miniatura: blob('m4'), hash: 'h4' });
    await db.excluirImovel('IM-001');
    const restos = await new Promise((res) => {
      const q = indexedDB.open('vistoria-cautelar');
      q.onsuccess = () => {
        const tx = q.result.transaction(['fotos', 'ambientes']);
        const a = tx.objectStore('fotos').count();
        const b = tx.objectStore('ambientes').count();
        tx.oncomplete = () => { res([a.result, b.result]); q.result.close(); };
      };
    });
    out.restos = restos;
    return out;
  });

  ok(r.versao === 3, `banco atualizado para a versão 3 (${r.versao})`);
  ok(['ambientes', 'fotos', 'imoveis', 'config'].every((d) => r.depositos.includes(d)), `depósitos: ${r.depositos}`);
  ok(r.novoId === 'IM-002', `numeração continua depois da migração (${r.novoId})`);
  ok(r.ambientesAposFachada.join() === 'Fachada', 'foto da fachada cria o ambiente "Fachada"');
  ok(r.tamanhoFoto === 'primeira'.length, 'foto gravada inteira');
  ok(r.trocar.qtd === 1 && r.trocar.ehNova && r.trocar.antigaSumiu, `trocar a fachada apaga a antiga (${JSON.stringify(r.trocar)})`);
  ok(r.ambientesAposTroca === 1, 'trocar a fachada não duplica o ambiente');
  ok(r.classificada.patologias.join() === 'trinca' && r.classificada.abertura === 0.8 && r.classificada.blobIntacto,
    'classificação gravada e a imagem não pode ser trocada');
  ok(r.listaBranca, 'atualizarFoto não muda tiradaEm, imovelId e demais campos fora da classificação');
  ok(r.fachadaAposExcluirFoto === null, 'excluir a foto da capa deixa o imóvel sem fachada');
  ok(r.restos.join() === '0,0', `excluir imóvel apaga fotos e ambientes (${r.restos})`);
}
