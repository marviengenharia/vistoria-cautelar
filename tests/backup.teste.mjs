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
}
