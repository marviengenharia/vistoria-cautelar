// Tratamento da foto: redução, rotação, carimbo, miniatura e impressão digital.
export default async function ({ page, base, ok }) {
  await page.goto(base + 'manifest.json'); // página da mesma origem, sem o app rodando

  const r = await page.evaluate(async () => {
    const { processarFoto, textoCarimbo } = await import('/js/foto.js');
    const tela = (w, h, cor = '#ffffff') => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = cor; g.fillRect(0, 0, w, h);
      return new Promise((res) => c.toBlob(res, 'image/png'));
    };
    const medidas = async (blob) => { const b = await createImageBitmap(blob); return [b.width, b.height]; };
    const out = {};

    const p = await processarFoto(await tela(3000, 2000), 'IM-001 · teste');
    out.paisagem = await medidas(p.foto);
    out.tipo = p.foto.type;
    out.miniatura = await medidas(p.miniatura);
    out.hash = p.hash;
    // pixel no rodapé deve ser escuro (faixa do carimbo) mesmo com imagem branca
    const b = await createImageBitmap(p.foto);
    const c = new OffscreenCanvas(b.width, b.height); c.getContext('2d').drawImage(b, 0, 0);
    out.faixa = [...c.getContext('2d').getImageData(4, b.height - 3, 1, 1).data].slice(0, 3);

    out.pequena = await medidas((await processarFoto(await tela(1200, 1600), 'x')).foto);
    out.retrato = await medidas((await processarFoto(await tela(2000, 3000), 'x')).foto);

    out.carimbo = textoCarimbo({ id: 'IM-001', gps: { lat: -1.4436, lon: -48.4732, precisao: 6 } }, new Date(2026, 10, 18, 14, 5));
    out.semGps = textoCarimbo({ id: 'IM-002', gps: null }, new Date(2026, 10, 18, 9, 0));
    try {
      await processarFoto(new Blob(['texto'], { type: 'text/plain' }), 'x');
      out.invalido = 'não rejeitou';
    } catch (e) { out.invalido = e.message; }
    return out;
  });

  ok(r.tipo === 'image/jpeg', `foto gravada em JPEG (${r.tipo})`);
  ok(r.paisagem.join('x') === '1600x1067', `paisagem 3000x2000 -> 1600x1067 (${r.paisagem.join('x')})`);
  ok(r.pequena.join('x') === '1200x1600', `foto já pequena não é ampliada (${r.pequena.join('x')})`);
  ok(r.retrato.join('x') === '1067x1600', `retrato 2000x3000 -> 1067x1600 (${r.retrato.join('x')})`);
  ok(r.miniatura.join('x') === '240x240', `miniatura 240x240 (${r.miniatura.join('x')})`);
  ok(/^[0-9a-f]{64}$/.test(r.hash), 'impressão digital SHA-256 com 64 caracteres');
  ok(r.faixa.every((v) => v < 80), `faixa escura do carimbo no rodapé (${r.faixa})`);
  ok(r.carimbo === 'IM-001 · 18/11/2026 14:05 · -1,443600, -48,473200 ±6 m', `carimbo: ${r.carimbo}`);
  ok(r.semGps === 'IM-002 · 18/11/2026 09:00 · sem GPS', `carimbo sem GPS: ${r.semGps}`);
  ok(r.invalido === 'Não foi possível ler essa imagem.', `arquivo que não é imagem: ${r.invalido}`);
}
