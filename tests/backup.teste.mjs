// ZIP (criar/ler) e compartilhar arquivos.
export default async function ({ page, base, ok }) {
  await page.goto(base + 'manifest.json');
  const r = await page.evaluate(async () => {
    const { criarZip, lerZip } = await import('/js/zip.js');
    const { compartilharArquivos } = await import('/js/compartilhar.js');
    const out = {};

    const bytes = new Uint8Array(256).map((_, i) => i);
    const grande = new Uint8Array(300 * 1024).map((_, i) => (i * 7 + (i >> 8)) & 255);
    const zip = await criarZip([
      { nome: 'observações/ação.txt', dados: 'Olá, vistoria é útil' },
      { nome: 'fotos/bytes.bin', dados: bytes },
      { nome: 'fotos/grande.jpg', dados: new Blob([grande]) },
    ]);
    out.tipo = zip.type;
    const buf = new Uint8Array(await zip.arrayBuffer());
    out.temCentral = [...buf].some((_, i) => buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 1 && buf[i + 3] === 2);
    out.fim = buf[buf.length - 22] === 0x50 && buf[buf.length - 21] === 0x4b && buf[buf.length - 20] === 5 && buf[buf.length - 19] === 6;
    out.assin = buf[2] === 3 && buf[3] === 4;

    const mapa = await lerZip(zip);
    out.nomes = [...mapa.keys()];
    out.texto = new TextDecoder().decode(mapa.get('observações/ação.txt'));
    const igual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    out.bytes = igual(mapa.get('fotos/bytes.bin'), bytes);
    out.grande = igual(mapa.get('fotos/grande.jpg'), grande);

    const ruim = buf.slice();
    ruim[Math.floor(buf.length / 2)] ^= 0xff;
    try { await lerZip(new Blob([ruim])); out.erro = 'nao lancou'; } catch (e) { out.erro = e.message; }
    try { await lerZip(new Blob(['lixo'])); out.erroLixo = 'nao lancou'; } catch (e) { out.erroLixo = e.message; }

    let cliques = 0;
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { cliques++; out.download = this.download; };
    out.compart = await compartilharArquivos(
      [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')], 'Teste');
    HTMLAnchorElement.prototype.click = original;
    out.cliques = cliques;
    return out;
  });
  ok(r.tipo === 'application/zip', 'zip: tipo application/zip');
  ok(r.assin && r.temCentral && r.fim, 'zip: assinaturas PK local, central e fim');
  ok(r.nomes.length === 3 && r.nomes[0] === 'observações/ação.txt', 'zip: nomes com acento preservados');
  ok(r.texto === 'Olá, vistoria é útil', 'zip: texto com acento volta igual');
  ok(r.bytes && r.grande, 'zip: bytes 0-255 e blob de 300 KB voltam iguais');
  ok(r.erro === 'Arquivo de backup danificado.', 'zip: byte trocado → danificado');
  ok(r.erroLixo === 'Arquivo de backup danificado.', 'zip: arquivo que não é zip → danificado');
  ok(r.compart === 'baixado' && r.cliques === 2 && r.download === 'b.txt', 'compartilhar: sem suporte baixa cada arquivo');

  // ---------- backup de um imóvel ----------
  const b = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const { montarBackup, imoveisSemBackup, registrarBackup } = await import('/js/backup.js');
    const { lerZip } = await import('/js/zip.js');
    const { impressaoDigital } = await import('/js/foto.js');
    const out = {};
    const pausa = () => new Promise((res) => setTimeout(res, 5));
    const igual = (a, b2) => a.length === b2.length && a.every((v, i) => v === b2[i]);
    const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());
    // bytes "de imagem" com todos os valores 0-255 (dados de teste, não são fotos reais)
    const jpg = (n) => new Blob([new Uint8Array(1000 + n).map((_, i) => (i * 31 + n) & 255)], { type: 'image/jpeg' });
    const png = (n) => new Blob([new Uint8Array(500 + n).map((_, i) => (i * 17 + n) & 255)], { type: 'image/png' });
    const processada = async (n) => { const foto = jpg(n); return { foto, miniatura: jpg(n + 50), hash: await impressaoDigital(foto) }; };

    const im = await db.criarImovel();
    const id = im.id;
    await db.atualizarImovel(id, { endereco: 'Rua de Teste, 1', estaca: '40', lado: 'LE' });
    const comFachada = await db.definirFachada(id, await processada(1));
    const sala = await db.criarAmbiente(id, 'Sala');
    const foto = await db.adicionarFoto(id, sala.id, await processada(2));
    await db.atualizarFoto(foto.id, { patologias: ['trinca'], local: 'parede' });
    const ids = (await db.listarFotosDoImovel(id)).map((f) => f.id);
    const ass = await db.gravarAssinatura(id, {
      tipo: 'ciencia', texto: 'termo de teste', inicio: new Date().toISOString(), idsFotosConferidas: ids,
      ocupante: { nome: 'Pessoa Teste', documento: '000', assinatura: png(1) },
      vistoriador: { nome: 'Vistoriador Teste', assinatura: png(2) },
    });

    // ---- montarBackup ----
    const arquivo = await montarBackup(id);
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.nome = arquivo.name;
    out.nomeEsperado = `${id}_${hoje}.zip`;
    out.tipo = arquivo.type;
    out.ehFile = arquivo instanceof File;
    const mapa = await lerZip(arquivo);
    out.arquivos = [...mapa.keys()].sort();
    const json = JSON.parse(new TextDecoder().decode(mapa.get('imovel.json')));
    out.formato = json.formato;
    out.geradoEm = typeof json.geradoEm === 'string' && !Number.isNaN(Date.parse(json.geradoEm));
    out.imovel = json.imovel.id === id && json.imovel.endereco === 'Rua de Teste, 1';
    out.fachada = JSON.stringify(json.imovel.fachada) === JSON.stringify({ fotoId: comFachada.fachada.fotoId, tiradaEm: comFachada.fachada.tiradaEm });
    out.ambientes = json.ambientes.map((a) => a.nome).sort().join();

    const banco = await db.listarFotosDoImovel(id);
    out.fotosConferem = json.fotos.length === 2 && (await Promise.all(banco.map(async (f) => {
      const j = json.fotos.find((x) => x.id === f.id);
      const zipFoto = mapa.get(`fotos/${f.id}.jpg`);
      return j && !('blob' in j) && !('miniatura' in j)
        && j.hash === f.hash && j.tiradaEm === f.tiradaEm && j.ambienteId === f.ambienteId
        && JSON.stringify(j.patologias) === JSON.stringify(f.patologias)
        && igual(zipFoto, await bytesDe(f.blob))
        && igual(mapa.get(`miniaturas/${f.id}.jpg`), await bytesDe(f.miniatura))
        && (await impressaoDigital(new Blob([zipFoto]))) === f.hash;
    }))).every(Boolean);

    const [jAss] = json.assinaturas;
    const [bAss] = await db.listarAssinaturas(id);
    out.assinatura = {
      codigo: jAss.codigo === ass.codigo && jAss.codigo === bAss.codigo,
      caminhos: [jAss.ocupante.assinatura, jAss.vistoriador.assinatura].join(),
      caminhosEsperados: [`assinaturas/${ass.id}-ocupante.png`, `assinaturas/${ass.id}-vistoriador.png`].join(),
      testemunha: jAss.testemunha,
      nomes: jAss.ocupante.nome === 'Pessoa Teste' && jAss.ocupante.documento === '000',
      fotos: JSON.stringify(jAss.fotos) === JSON.stringify(bAss.fotos),
      png: igual(mapa.get(`assinaturas/${ass.id}-ocupante.png`), await bytesDe(bAss.ocupante.assinatura))
        && igual(mapa.get(`assinaturas/${ass.id}-vistoriador.png`), await bytesDe(bAss.vistoriador.assinatura)),
    };
    // o código recalculado a partir do que está no zip bate com o gravado
    const comImagens = { ...jAss };
    for (const p of ['ocupante', 'testemunha', 'vistoriador']) {
      if (jAss[p]) comImagens[p] = { ...jAss[p], assinatura: new Blob([mapa.get(jAss[p].assinatura)]) };
    }
    out.codigoRecalculado = (await db.codigoDaAssinatura(comImagens)) === jAss.codigo;
    // o banco continua igual depois do backup
    out.bancoIntacto = (await db.obterImovel(id)).fachada.miniatura instanceof Blob
      && (await db.obterFoto(foto.id)).blob instanceof Blob;

    // ---- sem backup / registrar ----
    const pendentes = async () => (await imoveisSemBackup()).map((p) => p.id);
    const semBackup = await imoveisSemBackup();
    out.antes = semBackup.some((p) => p.id === id);
    out.desdeIgual = semBackup.find((p) => p.id === id)?.desde === (await db.obterImovel(id)).criadoEm;
    await pausa();
    await registrarBackup([id]);
    out.depoisRegistrar = (await pendentes()).includes(id);
    const backups = await db.obterConfig('backups');
    out.configBackups = typeof backups?.[id] === 'string';
    // com backup anterior: "desde" = hora desse backup (não a da última mudança)
    await pausa();
    await db.atualizarImovel(id, { observacoes: 'mudou depois do backup' });
    out.desdeBackup = (await imoveisSemBackup()).find((p) => p.id === id)?.desde === backups[id];

    // cada mudança no imóvel ou em algo dele põe o imóvel de volta em "sem backup"
    out.volta = {};
    const volta = async (rotulo, acao, alvo = id) => {
      await pausa();
      await registrarBackup([alvo]);
      await pausa();
      const r = await acao();
      out.volta[rotulo] = (await pendentes()).includes(alvo);
      return r;
    };
    await volta('atualizarFoto', () => db.atualizarFoto(foto.id, { patologias: ['trinca', 'umidade'] }));
    await volta('atualizarImovel', () => db.atualizarImovel(id, { referencia: 'perto da praça' }));
    const quarto = await volta('criarAmbiente', () => db.criarAmbiente(id, 'Quarto'));
    const fotoQuarto = await volta('adicionarFoto', async () => db.adicionarFoto(id, quarto.id, await processada(3)));
    await volta('excluirFoto', () => db.excluirFoto(fotoQuarto.id));
    await volta('excluirAmbiente', () => db.excluirAmbiente(quarto.id));
    const outro = await db.criarImovel();
    await volta('definirFachada', async () => db.definirFachada(outro.id, await processada(4)), outro.id);
    const idsAgora = (await db.listarFotosDoImovel(id)).map((f) => f.id);
    await volta('gravarAssinatura', () => db.gravarAssinatura(id, {
      tipo: 'ciencia', texto: 'termo 2', idsFotosConferidas: idsAgora,
      ocupante: { nome: 'Pessoa Teste', assinatura: png(3) }, vistoriador: { nome: 'Vistoriador Teste', assinatura: png(4) },
    }));
    // um imóvel com backup não volta por mudança em outro imóvel
    await pausa();
    await registrarBackup([id, outro.id]);
    await pausa();
    await db.atualizarImovel(outro.id, { endereco: 'Outra rua' });
    const p = await pendentes();
    out.soOOutro = p.includes(outro.id) && !p.includes(id);
    return out;
  });
  ok(b.ehFile && b.tipo === 'application/zip' && b.nome === b.nomeEsperado, `backup: arquivo ${b.nome} (application/zip)`);
  ok(b.arquivos.length === 7 && b.arquivos.includes('imovel.json'), `backup: 7 arquivos no zip, com imovel.json (${b.arquivos.length})`);
  ok(b.formato === 1 && b.geradoEm && b.imovel, 'backup: imovel.json com formato 1, geradoEm e o imóvel');
  ok(b.fachada, 'backup: fachada só com fotoId e tiradaEm (sem miniatura)');
  ok(b.ambientes === 'Fachada,Sala', `backup: ambientes (${b.ambientes})`);
  ok(b.fotosConferem, 'backup: fotos e miniaturas com os mesmos bytes do banco, hash igual, sem blob no JSON');
  ok(b.assinatura.codigo && b.assinatura.nomes && b.assinatura.fotos && b.assinatura.testemunha === null,
    'backup: assinatura com o mesmo código, nomes e fotos');
  ok(b.assinatura.caminhos === b.assinatura.caminhosEsperados && b.assinatura.png,
    'backup: assinaturas em assinaturas/<id>-<pessoa>.png com os mesmos bytes');
  ok(b.codigoRecalculado, 'backup: código da assinatura recalculado a partir do zip confere');
  ok(b.bancoIntacto, 'backup: o banco continua com as imagens');
  ok(b.antes && b.desdeIgual, 'sem backup: imóvel nunca copiado aparece, "desde" = criadoEm');
  ok(b.desdeBackup, 'sem backup: mudou depois do backup, "desde" = hora do último backup');
  ok(!b.depoisRegistrar && b.configBackups, 'registrarBackup tira o imóvel da lista e grava em config "backups"');
  ok(Object.keys(b.volta).length === 8 && Object.values(b.volta).every(Boolean), `cada mudança volta para "sem backup" (${JSON.stringify(b.volta)})`);
  ok(b.soOOutro, 'mudança num imóvel não afeta o backup de outro');
}
