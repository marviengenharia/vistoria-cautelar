// Laudo em PDF: gerado no aparelho (jsPDF), com dados fictícios e as fotos de teste.
// Se a variável LAUDO_AMOSTRA tiver um caminho (…/x.pdf), grava ali os PDFs gerados, para olhar:
// x.pdf (assinado), x-rascunho.pdf, x-recusa.pdf, x-longo.pdf e x-grande.pdf.
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

    // Textos de cada página, com a altura (mm a partir do topo), lidos do PDF sem compressão.
    const textosPorPagina = (s) => s.split('endstream').filter((b) => b.includes('\nBT\n')).map((bloco) => {
      const itens = [];
      for (const bt of bloco.split('\nBT\n').slice(1)) {
        const td = /([-\d.]+) ([-\d.]+) Td/.exec(bt);
        if (!td) continue;
        const passo = Number(/([-\d.]+) TL/.exec(bt)?.[1] ?? 0);
        let altura = Number(td[2]);
        const re = /(T\* )?\(((?:\\.|[^\\)])*)\) Tj/g;
        for (let m = re.exec(bt); m; m = re.exec(bt)) {
          if (m[1]) altura -= passo;
          itens.push({ y: 297 - (altura * 25.4) / 72, texto: m[2] });
        }
      }
      return itens;
    });
    // o PDF guarda parênteses e barras invertidas com uma barra invertida na frente
    const comoNoPdf = (t) => t.replace(/[()\\]/g, '\\$&');
    const FIM = 278.5; // mm: abaixo disso só o rodapé e a faixa de rascunho
    const TITULO = /^(Objetivo|Método|Identificação e localização|Características e estado de conservação|Relatório fotográfico|Quadro-resumo das patologias|Conclusão|Termo de ciência|Termo de Recusa|Descrições completas)$/;
    const diagramacao = (s) => {
      const pags = textosPorPagina(s);
      return {
        paginasLidas: pags.length === paginas(s),
        semVazar: pags.every((itens) => itens.every((i) => i.y <= FIM || (/^(Vistoria cautelar|página|RASCUNHO)/.test(i.texto) && i.y < 295))),
        semOrfao: pags.every((itens) => itens.filter((i) => TITULO.test(i.texto))
          .every((t) => itens.some((i) => i.y > t.y + 1 && i.y <= FIM))),
      };
    };

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
      concordancia: s.includes(comoNoPdf('Foto incluída depois da assinatura (não consta deste termo): 4.')),
      diagramacao: diagramacao(s),
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
    out.b.diagramacao = diagramacao(sb);
    out.c.diagramacao = diagramacao(sc);

    // ---------- 4) textos maiores que uma página: observação, descrição de foto e termo ----------
    const lg = await imovelComFotos('Rua dos Textos Longos, 99');
    await db.atualizarImovel(lg.id, {
      observacoes: 'Observação muito longa de teste, repetida para passar de uma página. '.repeat(250),
      referencia: 'Referência comprida de teste. '.repeat(40),
    });
    for (let i = 0; i < 5; i += 1) {
      const f = await db.adicionarFoto(lg.id, lg.sala.id, await foto(lg.imovel, 'sala.jpg', ` · longo ${i}`));
      if (i === 0) await db.atualizarFoto(f.id, { patologias: ['fissura'], descricao: 'Descrição enorme de teste da foto. '.repeat(120) });
    }
    const totalD = (await ids(lg.id)).length;
    await db.gravarAssinatura(lg.id, {
      tipo: 'ciencia',
      texto: textoTermoCiencia({ id: lg.id, data: new Date(), totalFotos: totalD }) + ' Cláusula longa de teste do termo.'.repeat(250),
      inicio: new Date().toISOString(), idsFotosConferidas: await ids(lg.id),
      ocupante: { nome: 'Pessoa Fictícia', documento: '0000000', assinatura: await assinatura(5) },
      vistoriador: { nome: 'Vistoriador Teste', assinatura: await assinatura(6) },
    });
    try {
      const sd = texto(await bytes(await gerarLaudo(lg.id, { responsavel, comprimir: false })));
      out.d = {
        paginas: paginas(sd), continuacao: sd.includes(comoNoPdf('Sala (continuação)')),
        descricoes: sd.includes('Descrições completas'), diagramacao: diagramacao(sd),
      };
      await amostra('-longo', lg.id, { responsavel });
    } catch (e) {
      out.d = { erro: e.stack || e.message };
    }
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
  ok(a.concordancia, 'laudo: "Foto incluída … (não consta deste termo): 4." no singular');

  const { d } = r;
  ok(!d.erro, `laudo com textos longos: gera sem erro${d.erro ? ` — ${d.erro}` : ''}`);
  ok(d.paginas >= a.paginas + 4, `laudo com textos longos: ${d.paginas} páginas (textos continuam nas seguintes)`);
  ok(d.continuacao, 'laudo: ambiente que continua na outra página repete o título "(continuação)"');
  ok(d.descricoes, 'laudo: descrição de foto longa sai inteira em "Descrições completas"');
  for (const [nome, x] of Object.entries({ assinado: a, rascunho: b, recusa: c, longo: d })) {
    const g = x.diagramacao ?? {};
    ok(g.paginasLidas && g.semVazar, `laudo ${nome}: nenhum texto abaixo do limite do conteúdo (só rodapé/faixa)`);
    ok(g.paginasLidas && g.semOrfao, `laudo ${nome}: nenhum título sozinho no pé da página`);
  }
}
