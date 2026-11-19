// Laudo em PDF: gerado no aparelho (jsPDF), com dados fictícios e as fotos de teste.
// Se a variável LAUDO_AMOSTRA tiver um caminho (…/x.pdf), grava ali os PDFs gerados, para olhar:
// x.pdf (assinado), x-rascunho.pdf e x-recusa.pdf.
import fs from 'node:fs';

export default async function ({ page, base, ok }) {
  await page.goto(base + 'manifest.json');
  const r = await page.evaluate(async (querAmostras) => {
    const db = await import('/js/db.js');
    const { processarFoto, textoCarimbo } = await import('/js/foto.js');
    const { textoTermoCiencia, textoTermoRecusa } = await import('/js/dominio.js');
    const { gerarLaudo } = await import('/js/laudo.js');
    const out = { amostras: {} };
    // versão comprimida (a do app), em base64, só quando pedida
    const amostra = async (nome, id, opcoes) => {
      if (!querAmostras) return;
      const arq = await gerarLaudo(id, opcoes);
      out.amostras[nome] = await new Promise((res) => {
        const leitor = new FileReader();
        leitor.onload = () => res(String(leitor.result).split(',')[1]);
        leitor.readAsDataURL(arq);
      });
    };

    const fixture = async (nome) => (await fetch(`/tests/fixtures/${nome}`)).blob();
    const foto = async (imovel, nome, extra = '') => processarFoto(await fixture(nome), textoCarimbo(imovel) + extra);
    // traço de assinatura fictício, PNG de verdade (o jsPDF precisa decodificar)
    const assinatura = (n) => {
      const tela = document.createElement('canvas');
      tela.width = 600; tela.height = 200;
      const ctx = tela.getContext('2d');
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(20, 150);
      for (let x = 20; x < 580; x += 20) ctx.lineTo(x, 100 + Math.sin(x / (30 + n * 10)) * 60);
      ctx.stroke();
      return new Promise((res) => tela.toBlob(res, 'image/png'));
    };
    const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
    const texto = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return s; };
    const contem = (grande, pequeno) => texto(grande).includes(texto(pequeno));
    const paginas = (s) => (s.match(/\/Type \/Page(?!s)/g) ?? []).length;
    const responsavel = { nome: 'Vistoriador Teste', crea: 'CREA-PA 0000', art: '0000000000' };

    async function imovelComFotos(endereco) {
      const im = await db.criarImovel();
      await db.atualizarImovel(im.id, {
        endereco, referencia: 'Perto da praça (fictício)', estaca: '30+10', lado: 'LE', distanciaObra: 8.5,
        gps: { lat: -1.4436, lon: -48.4732, precisao: 6 }, ocupanteNome: 'Pessoa Fictícia', ocupanteCondicao: 'proprietario',
        uso: 'residencial', pavimentos: 2, estrutura: 'concreto-armado', cobertura: 'telha-ceramica',
        fundacao: 'nao-visivel', idadeAparente: '5-15', conservacao: 'regular', observacoes: 'Observação de teste.',
      });
      const imovel = await db.obterImovel(im.id);
      await db.definirFachada(im.id, await foto(imovel, 'fachada.jpg'));
      const sala = await db.criarAmbiente(im.id, 'Sala');
      const f1 = await db.adicionarFoto(im.id, sala.id, await foto(imovel, 'sala.jpg'));
      await db.atualizarFoto(f1.id, { patologias: ['trinca', 'umidade'], local: 'parede', abertura: 1.2, descricao: 'Trinca inclinada acima da porta.' });
      const f2 = await db.adicionarFoto(im.id, sala.id, await foto(imovel, 'retrato.jpg'));
      await db.atualizarFoto(f2.id, { patologias: ['sem-patologia'], local: 'piso' });
      return { id: im.id, sala, imovel };
    }
    const ids = async (id) => (await db.listarFotosDoImovel(id)).map((f) => f.id);

    // ---------- 1) termo de ciência assinado + uma foto depois da assinatura ----------
    const a = await imovelComFotos('Passagem Teste, 115');
    const total = (await ids(a.id)).length;
    await db.gravarAssinatura(a.id, {
      tipo: 'ciencia', texto: textoTermoCiencia({ id: a.id, data: new Date(), totalFotos: total }),
      inicio: new Date(Date.now() - 30 * 60000).toISOString(), idsFotosConferidas: await ids(a.id),
      ocupante: { nome: 'Pessoa Fictícia', documento: '0000000', assinatura: await assinatura(1) },
      vistoriador: { nome: 'Vistoriador Teste', assinatura: await assinatura(2) },
    });
    const depois = await db.adicionarFoto(a.id, a.sala.id, await foto(a.imovel, 'sala.jpg', ' · depois'));

    let arquivo;
    try {
      arquivo = await gerarLaudo(a.id, { responsavel, comprimir: false });
    } catch (e) {
      out.erro = e.stack || e.message;
      return out;
    }
    const pdf = await bytes(arquivo);
    const s = texto(pdf);
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.a = {
      ehFile: arquivo instanceof File,
      tipo: arquivo.type,
      nome: arquivo.name,
      nomeEsperado: `${a.id}_Passagem-Teste-115_${hoje}.pdf`,
      inicio: s.startsWith('%PDF'),
      paginas: paginas(s),
      id: s.includes(a.id),
      obra: s.includes('Bernardo Say'),
      rascunho: s.includes('RASCUNHO'),
      termo: s.includes('Termo de ci'),
      responsavel: s.includes('CREA-PA 0000') && s.includes('0000000000'),
      depois: s.includes('depois da assinatura'),
      semPatologia: s.includes('Sem patologia aparente'),
    };
    // fotos carimbadas entram byte a byte (sem recompressão) e o código completo aparece no termo
    const fotos = await db.listarFotosDoImovel(a.id);
    out.a.fotosIntactas = (await Promise.all(fotos.map(async (f) => contem(pdf, await bytes(f.blob))))).every(Boolean);
    const [ass] = await db.listarAssinaturas(a.id);
    out.a.codigos = ass.fotos.every((f) => s.includes(f.hash)) && s.includes(ass.codigo.slice(0, 4));
    out.a.depoisForaDoTermo = !s.includes(depois.hash);
    await amostra('', a.id, { responsavel });

    // ---------- 2) sem assinatura: rascunho; sem CREA/ART só o nome ----------
    const b = await imovelComFotos('Rua Sem Assinatura, 7');
    const sb = texto(await bytes(await gerarLaudo(b.id, { responsavel: { nome: 'Só Nome' }, comprimir: false })));
    await amostra('-rascunho', b.id, { responsavel: { nome: 'Só Nome' } });
    out.b = { rascunho: sb.includes('RASCUNHO'), paginas: paginas(sb), semCrea: !sb.includes('CREA') };

    // ---------- 3) recusa, só com a fachada, sem endereço ----------
    const c = await db.criarImovel();
    const imC = await db.obterImovel(c.id);
    await db.definirFachada(c.id, await foto(imC, 'retrato.jpg'));
    await db.gravarAssinatura(c.id, {
      tipo: 'recusa', texto: textoTermoRecusa({ id: c.id, data: new Date(), motivo: 'motivo fictício' }),
      motivoRecusa: 'motivo fictício', idsFotosConferidas: await ids(c.id),
      testemunha: { nome: 'Testemunha Fictícia', documento: '111', assinatura: await assinatura(3) },
      vistoriador: { nome: 'Vistoriador Teste', assinatura: await assinatura(4) },
    });
    const arqC = await gerarLaudo(c.id, { responsavel });
    const sc = texto(await bytes(await gerarLaudo(c.id, { responsavel, comprimir: false })));
    await amostra('-recusa', c.id, { responsavel });

    // ---------- amostra grande (só quando pedida): 30 fotos, textos longos e caracteres estranhos ----------
    if (querAmostras) {
      const g = await imovelComFotos('Travessa de Teste Com Um Nome Bem Comprido Mesmo, 1234 — fundos 😀');
      for (let i = 0; i < 27; i += 1) {
        const amb = i % 9 === 0 ? await db.criarAmbiente(g.id, `Cômodo ${i / 9 + 1}`) : null;
        g.atual = amb ?? g.atual;
        const f = await db.adicionarFoto(g.id, g.atual.id, await foto(g.imovel, ['sala.jpg', 'retrato.jpg', 'fachada.jpg'][i % 3], ` · ${i}`));
        await db.atualizarFoto(f.id, i % 2
          ? { patologias: ['fissura', 'mofo', 'outra'], local: 'teto', abertura: 0.3, descricao: 'Descrição longa de teste ≥ 2 mm → com seta e emoji 🏠, '.repeat(3) }
          : { patologias: ['sem-patologia'], local: 'parede' });
      }
      await amostra('-grande', g.id, { responsavel });
    }
    out.c = {
      recusa: sc.includes('Termo de Recusa'), rascunho: sc.includes('RASCUNHO'), paginas: paginas(sc),
      testemunha: sc.includes('Testemunha Fict'), nome: arqC.name, nomeEsperado: `${c.id}_${hoje}.pdf`,
    };
    return out;
  }, !!process.env.LAUDO_AMOSTRA);

  if (r.erro) { ok(false, `gerarLaudo lançou: ${r.erro}`); return; }
  for (const [sufixo, base64] of Object.entries(r.amostras)) {
    fs.writeFileSync(process.env.LAUDO_AMOSTRA.replace(/\.pdf$/i, `${sufixo}.pdf`), Buffer.from(base64, 'base64'));
  }
  const { a, b, c } = r;
  ok(a.ehFile && a.tipo === 'application/pdf' && a.inicio, 'laudo: File application/pdf começando com %PDF');
  ok(a.nome === a.nomeEsperado, `laudo: nome do arquivo ${a.nome}`);
  ok(a.paginas >= 4, `laudo: ${a.paginas} páginas (≥ 4)`);
  ok(a.id && a.obra, 'laudo: tem o nº do imóvel e o nome da obra');
  ok(a.termo && !a.rascunho, 'laudo assinado: termo de ciência, sem faixa de rascunho');
  ok(a.responsavel, 'laudo: responsável com CREA e ART');
  ok(a.semPatologia, 'laudo: "Sem patologia aparente" na legenda');
  ok(a.fotosIntactas, 'laudo: fotos carimbadas embutidas byte a byte (sem recompressão)');
  ok(a.codigos, 'laudo: termo com os códigos completos das fotos assinadas e o da assinatura');
  ok(a.depois && a.depoisForaDoTermo, 'laudo: foto tirada depois da assinatura marcada e fora da lista do termo');
  ok(b.rascunho && b.paginas >= 4, 'laudo sem assinatura: faixa RASCUNHO');
  ok(b.semCrea, 'laudo sem CREA/ART: mostra só o nome');
  ok(c.recusa && !c.rascunho && c.testemunha, 'laudo de recusa: Termo de Recusa com a testemunha');
  ok(c.nome === c.nomeEsperado, `laudo sem endereço: nome ${c.nome}`);
}
