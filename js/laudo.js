// Laudo de vistoria cautelar em PDF, gerado no próprio aparelho (sem internet) com o jsPDF.
// As fotos carimbadas entram no PDF com os bytes JPEG originais (sem recompressão) e as assinaturas
// com o PNG gravado, para que os códigos de verificação continuem valendo.
//
// jsPDF: usamos o arquivo UMD (vendor/jspdf/jspdf.umd.min.js), que já traz embutidas as
// dependências (fflate). Importado como módulo, ele se registra em self.jspdf.
import '../vendor/jspdf/jspdf.umd.min.js';
import { obterImovelCompleto } from './db.js';
import {
  STATUS, USOS, ESTRUTURAS, COBERTURAS, FUNDACOES, IDADES, CONSERVACOES, PATOLOGIAS, LOCAIS_FOTO,
  CONDICOES_OCUPANTE, SEM_PATOLOGIA, PATOLOGIAS_COM_ABERTURA, NOME_AMBIENTE_FACHADA, rotuloDe,
} from './dominio.js';
import { numeroBr } from './util.js';
import { OBRA, LOGO_URL, TEXTOS } from './obra.js';

const { jsPDF } = self.jspdf;

// ---------- página (mm) ----------
const LARGURA = 210;
const MARGEM = 16;
const UTIL = LARGURA - 2 * MARGEM;
const DIREITA = LARGURA - MARGEM;
const INICIO_CONTEUDO = 30;
const FIM_CONTEUDO = 278;
const PT = 0.3528; // mm por ponto

// ---------- cores (as do mockup aprovado) ----------
const AZUL = [0, 12, 56];
const VERDE = [10, 138, 58];
const VERMELHO = [216, 30, 36];
const CINZA = [91, 97, 112];
const LINHA = [201, 204, 212];
const FUNDO = [241, 242, 245];
const TEXTO = [17, 17, 17];

const SEM_INFO = 'não informado';
const LADO_EXTENSO = { LE: 'lado esquerdo', LD: 'lado direito' };

// ---------- textos ----------

// Caracteres fora da tabela WinAnsi (a da Helvetica do PDF) que têm substituto razoável.
const TROCAS = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '✓': 'ok', '×': 'x', '\t': ' ' };
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Deixa só caracteres que a Helvetica do PDF sabe escrever (emoji etc. viram "?"). */
function limpar(texto) {
  return [...String(texto ?? '').normalize('NFC')].map((c) => {
    if (TROCAS[c]) return TROCAS[c];
    const n = c.codePointAt(0);
    if (n === 10 || (n >= 32 && n < 127) || (n >= 160 && n <= 255) || WINANSI_EXTRA.has(c)) return c;
    return '?';
  }).join('');
}

const dois = (n) => String(n).padStart(2, '0');
const dataBr = (iso) => { const d = new Date(iso); return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`; };
const horaBr = (iso, segundos = false) => {
  const d = new Date(iso);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}${segundos ? `:${dois(d.getSeconds())}` : ''}`;
};
const dataHoraSeg = (iso) => `${dataBr(iso)} ${horaBr(iso, true)}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** "a3f9 2c71 0be4 d816" */
const agrupar = (hex) => String(hex ?? '').match(/.{1,4}/g)?.join(' ') ?? '';
const rotuloPatologia = (valor) => rotuloDe(PATOLOGIAS, valor).replace(/\s*\(descrever\)$/, '') || valor;

/** Data de hoje no aparelho: 2026-11-19 */
function dataLocal(d = new Date()) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** IM-012_Passagem-Exemplo-115_2026-11-19.pdf */
export function nomeDoLaudo(id, endereco, data = new Date()) {
  const trecho = String(endereco ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${[id, trecho, dataLocal(data)].filter(Boolean).join('_')}.pdf`;
}

/** "18/11/2026, das 14:02 às 14:41" */
function periodo(inicio, fim) {
  if (!inicio && !fim) return SEM_INFO;
  if (!inicio || !fim) return dataBr(inicio ?? fim);
  if (dataBr(inicio) === dataBr(fim)) return `${dataBr(inicio)}, das ${horaBr(inicio)} às ${horaBr(fim)}`;
  return `de ${dataBr(inicio)} ${horaBr(inicio)} a ${dataBr(fim)} ${horaBr(fim)}`;
}

// ---------- imagens ----------

/** Largura e altura de um JPEG ou PNG lidas do cabeçalho (sem decodificar a imagem). */
function medidas(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    return { largura: v.getUint32(16), altura: v.getUint32(20) };
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marca = bytes[i + 1];
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
      return { altura: (bytes[i + 5] << 8) | bytes[i + 6], largura: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7) || marca === 0xff) { i += 2; continue; }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

// ---------- dados ----------

/** Ambientes com fotos, na ordem do relatório (Fachada primeiro), e as fotos numeradas. */
function organizarFotos(ambientes, fotos) {
  const ehFachada = (a) => a.fachada || a.nome === NOME_AMBIENTE_FACHADA;
  const ordem = [...ambientes].sort((a, b) => (ehFachada(b) - ehFachada(a)) || a.criadoEm.localeCompare(b.criadoEm));
  const grupos = [];
  let numero = 0;
  for (const ambiente of ordem) {
    const lista = fotos.filter((f) => f.ambienteId === ambiente.id)
      .sort((a, b) => a.tiradaEm.localeCompare(b.tiradaEm))
      .map((foto) => ({ foto, ambiente, numero: ++numero }));
    if (lista.length) grupos.push({ ambiente, fotos: lista });
  }
  return grupos;
}

/**
 * Gera o laudo do imóvel.
 * @param {string} imovelId
 * @param {{ responsavel: { nome: string, crea?: string, art?: string }, comprimir?: boolean }} opcoes
 *   `comprimir: false` só nos testes (para procurar texto no PDF).
 * @returns {Promise<File>}
 */
export async function gerarLaudo(imovelId, { responsavel, comprimir = true } = {}) {
  const { imovel, ambientes, fotos, assinaturas } = await obterImovelCompleto(imovelId);
  const assinatura = [...assinaturas].sort((a, b) => b.assinadoEm.localeCompare(a.assinadoEm))[0] ?? null;
  const tipo = assinatura?.tipo ?? null;
  const grupos = organizarFotos(ambientes, fotos);
  const numeradas = grupos.flatMap((g) => g.fotos);
  const numeroDe = new Map(numeradas.map((n) => [n.foto.id, n.numero]));
  const assinadas = new Set(assinatura?.fotos.map((f) => f.id) ?? []);
  const depoisDaAssinatura = (foto) => !!assinatura && !assinadas.has(foto.id);
  const respostaLogo = await fetch(new URL(`../${LOGO_URL}`, import.meta.url));
  if (!respostaLogo.ok) throw new Error('Não foi possível ler o logotipo do consórcio.');
  const logo = new Uint8Array(await respostaLogo.arrayBuffer());
  const medidasLogo = medidas(logo);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: comprimir });
  doc.setProperties({ title: `Laudo de Vistoria Cautelar — ${imovel.id}`, creator: OBRA.consorcio.nome });
  doc.setLineHeightFactor(1.35);
  let y = 0;

  // ---------- primitivas ----------
  const fonte = (estilo, tamanho, cor = TEXTO) => {
    doc.setFont(estilo === 'mono' ? 'courier' : 'helvetica', estilo === 'negrito' ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const entrelinha = (tamanho) => tamanho * PT * 1.35;
  const escrever = (texto, x, yy, opcoes) => doc.text(limpar(texto), x, yy, opcoes);
  const quebrar = (texto, largura) => doc.splitTextToSize(limpar(texto), largura);
  // As larguras da Helvetica no jsPDF têm só duas casas (ex.: "o" 0,55 em vez de 0,556) e somam, em
  // média, 0,003 em por letra a menos que as reais: compensa, para um trecho não "encostar" no anterior.
  const medir = (texto) => doc.getTextWidth(texto)
    + (doc.getFont().fontName === 'courier' ? 0 : texto.length * 0.003 * doc.getFontSize() * PT);

  /** Quebra o texto em no máximo `maximo` linhas; se sobrar, a última termina em "…". */
  function cortar(texto, largura, maximo) {
    const linhas = quebrar(texto, largura);
    if (linhas.length <= maximo) return linhas;
    const resultado = linhas.slice(0, maximo);
    let ultima = resultado[maximo - 1];
    while (ultima && doc.getTextWidth(`${ultima}…`) > largura) ultima = ultima.slice(0, -1);
    resultado[maximo - 1] = `${ultima.trimEnd()}…`;
    return resultado;
  }

  /**
   * Quebra em linhas um texto com trechos de estilos diferentes. Cada trecho:
   * { texto, estilo: 'normal'|'negrito'|'mono', cor, tamanho, inteiro (não quebra no meio) }.
   */
  function comporRico(trechos, largura, tamanho) {
    const linhas = [[]];
    let pos = 0;
    let espaco = 0;
    for (const t of trechos) {
      fonte(t.estilo ?? 'normal', t.tamanho ?? tamanho, t.cor ?? TEXTO);
      const larguraEspaco = medir(' ');
      const pedacos = t.inteiro ? [limpar(t.texto)] : limpar(t.texto).split(/(\s+)/).filter(Boolean);
      for (const p of pedacos) {
        if (/^\s+$/.test(p)) { if (pos > 0) espaco = larguraEspaco; continue; }
        const partes = medir(p) > largura ? doc.splitTextToSize(p, largura) : [p];
        for (const parte of partes) {
          const w = medir(parte);
          if (pos > 0 && pos + espaco + w > largura) { linhas.push([]); pos = 0; espaco = 0; }
          const linha = linhas[linhas.length - 1];
          const ultimo = linha[linha.length - 1];
          if (ultimo && ultimo.t === t && espaco > 0) ultimo.texto += ` ${parte}`;
          else if (ultimo && ultimo.t === t && espaco === 0) ultimo.texto += parte;
          else linha.push({ t, texto: parte, x: pos + espaco });
          pos += espaco + w;
          espaco = 0;
        }
      }
    }
    return linhas;
  }

  function desenharLinhaRica(linha, x, yy, tamanho) {
    for (const p of linha) {
      fonte(p.t.estilo ?? 'normal', p.t.tamanho ?? tamanho, p.t.cor ?? TEXTO);
      doc.text(p.texto, x + p.x, yy);
    }
  }

  /** Escreve (ou só mede, com desenhar=false) um texto rico num lugar fixo. Devolve a altura. */
  function textoRico(trechos, x, yy, largura, tamanho, desenhar = true) {
    const linhas = comporRico(trechos, largura, tamanho);
    const passo = entrelinha(tamanho);
    if (desenhar) linhas.forEach((linha, i) => desenharLinhaRica(linha, x, yy + i * passo, tamanho));
    return linhas.length * passo;
  }

  /** "Texto com **negrito**" -> trechos */
  const negritos = (texto, cor = TEXTO) => String(texto).split(/\*\*/)
    .map((parte, i) => ({ texto: parte, estilo: i % 2 ? 'negrito' : 'normal', cor }))
    .filter((t) => t.texto);

  function cabecalho() {
    const altura = 8;
    doc.addImage(logo, 'PNG', MARGEM, 11.5, altura * medidasLogo.largura / medidasLogo.altura, altura, 'logo');
    fonte('normal', 8.5, CINZA);
    escrever(`Laudo de Vistoria Cautelar — ${imovel.id}`, DIREITA, 15, { align: 'right' });
    if (imovel.endereco) doc.text(cortar(imovel.endereco, 110, 1)[0], DIREITA, 19, { align: 'right' });
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.line(MARGEM, 22.5, DIREITA, 22.5);
  }

  function novaPagina() {
    doc.addPage();
    cabecalho();
    y = INICIO_CONTEUDO;
  }

  const garantir = (altura) => { if (y + altura > FIM_CONTEUDO) novaPagina(); };

  /**
   * Título de seção. `seguinte` = altura do começo do que vem depois (parágrafo, tabela, quadro),
   * para o título não ficar sozinho no pé da página.
   */
  function titulo(numero, texto, seguinte = 12) {
    garantir(11.5 + seguinte);
    y += 5;
    fonte('negrito', 14, VERDE);
    escrever(String(numero), MARGEM, y);
    const recuo = doc.getTextWidth(String(numero)) + 2.5;
    fonte('negrito', 14, AZUL);
    escrever(texto, MARGEM + recuo, y);
    y += 6.5;
  }

  const trechosDe = (texto) => (typeof texto === 'string' ? negritos(texto) : texto);

  /** Altura das primeiras linhas (até 3) de um parágrafo: o que o título antes dele reserva. */
  const inicioParagrafo = (texto, tamanho = 10) =>
    Math.min(comporRico(trechosDe(texto), UTIL, tamanho).length, 3) * entrelinha(tamanho);

  /** Parágrafo que continua na página seguinte quando não cabe. */
  function paragrafo(texto, tamanho = 10) {
    const passo = entrelinha(tamanho);
    const linhas = comporRico(trechosDe(texto), UTIL, tamanho);
    for (const [i, linha] of linhas.entries()) {
      // a última linha não vai sozinha para a página seguinte: leva a penúltima junto
      if (i >= 2 && i === linhas.length - 2 && y + 2 * passo > FIM_CONTEUDO) novaPagina();
      garantir(passo);
      desenharLinhaRica(linha, MARGEM, y + tamanho * PT, tamanho);
      y += passo;
    }
    y += 2;
  }

  /**
   * Tabela simples. colunas: [{ titulo, largura, estilo, tamanho, cor, fundo }].
   * linhas: arrays de texto (ou { texto, estilo, cor }). O cabeçalho se repete na página seguinte.
   */
  function tabela(colunas, linhas, { tamanho = 9, comCabecalho = true } = {}) {
    const folga = 1.4;
    const passo = entrelinha(tamanho);
    const larguraUtil = (c) => c.largura - 2 * 1.8;
    const titulos = colunas.map((c) => c.titulo);
    const desenharLinha = (celulas, cabecalhoLinha) => {
      let conteudos = celulas.map((cel, i) => {
        const c = colunas[i];
        const dado = typeof cel === 'object' && cel !== null ? cel : { texto: cel };
        const estilo = cabecalhoLinha ? 'negrito' : (dado.estilo ?? c.estilo ?? 'normal');
        const tam = cabecalhoLinha ? tamanho : (c.tamanho ?? tamanho);
        fonte(estilo, tam);
        return { linhas: quebrar(dado.texto === '' || dado.texto == null ? '—' : dado.texto, larguraUtil(c)), estilo, tam, cor: cabecalhoLinha ? AZUL : (dado.cor ?? c.cor ?? TEXTO) };
      });
      const pagina = () => {
        novaPagina();
        if (!cabecalhoLinha && comCabecalho) desenharLinha(titulos, true);
      };
      const desenharPedaco = (pedaco) => {
        const altura = Math.max(...pedaco.map((k) => k.linhas.length)) * passo + 2 * folga;
        let x = MARGEM;
        pedaco.forEach((k, i) => {
          const c = colunas[i];
          const fundo = cabecalhoLinha ? FUNDO : c.fundo;
          doc.setDrawColor(...LINHA);
          doc.setLineWidth(0.25);
          if (fundo) { doc.setFillColor(...fundo); doc.rect(x, y, c.largura, altura, 'FD'); } else doc.rect(x, y, c.largura, altura);
          fonte(k.estilo, k.tam, k.cor);
          if (k.linhas.length) doc.text(k.linhas, x + 1.8, y + folga + k.tam * PT * 0.95);
          x += c.largura;
        });
        y += altura;
      };
      // linha maior que o espaço: pula de página; se nem numa página inteira couber, divide a linha
      let noTopo = false;
      for (;;) {
        const altura = Math.max(...conteudos.map((k) => k.linhas.length)) * passo + 2 * folga;
        if (y + altura <= FIM_CONTEUDO) { desenharPedaco(conteudos); return; }
        const cabem = Math.floor((FIM_CONTEUDO - y - 2 * folga) / passo);
        if (!noTopo && (cabem < 2 || altura <= FIM_CONTEUDO - INICIO_CONTEUDO - 15)) {
          pagina();
          noTopo = true;
          continue;
        }
        desenharPedaco(conteudos.map((k) => ({ ...k, linhas: k.linhas.slice(0, cabem) })));
        conteudos = conteudos.map((k) => ({ ...k, linhas: k.linhas.slice(cabem) }));
        pagina();
        noTopo = true;
      }
    };
    if (comCabecalho) desenharLinha(titulos, true);
    for (const l of linhas) desenharLinha(l, false);
    y += 3;
  }

  const ficha = (linhas) => tabela(
    [{ titulo: '', largura: UTIL * 0.34, fundo: FUNDO, cor: CINZA }, { titulo: '', largura: UTIL * 0.66 }],
    linhas, { tamanho: 9.5, comCabecalho: false },
  );

  /** Desenha a foto inteira (proporção mantida, sem cortar) dentro da caixa. */
  async function fotoNaCaixa(foto, x, yy, largura, altura) {
    doc.setFillColor(...FUNDO);
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.25);
    doc.rect(x, yy, largura, altura, 'FD');
    const bytes = await bytesDe(foto.blob);
    const m = medidas(bytes) ?? { largura: 4, altura: 3 };
    const escala = Math.min(largura / m.largura, altura / m.altura);
    const w = m.largura * escala;
    const h = m.altura * escala;
    // alias = id da foto: a mesma foto (capa e relatório) entra uma vez só no arquivo
    doc.addImage(bytes, 'JPEG', x + (largura - w) / 2, yy + (altura - h) / 2, w, h, foto.id, 'NONE');
  }

  // =====================================================================
  // CAPA
  // =====================================================================
  const larguraLogo = 62;
  doc.addImage(logo, 'PNG', MARGEM, 16, larguraLogo, larguraLogo * medidasLogo.altura / medidasLogo.largura, 'logo');
  y = 16 + larguraLogo * medidasLogo.altura / medidasLogo.largura + 7;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.line(MARGEM, y, DIREITA, y);
  y += 13;
  fonte('negrito', 25, AZUL);
  escrever('Laudo de Vistoria Cautelar', MARGEM, y);
  escrever('de Vizinhança', MARGEM, y + 9.5);
  y += 24;
  fonte('negrito', 40, AZUL);
  escrever(imovel.id, MARGEM, y);
  y += 9;
  fonte('negrito', 11, TEXTO);
  const linhasObra = quebrar(`Obra: ${OBRA.nome}`, 155);
  doc.text(linhasObra, MARGEM, y);
  y += linhasObra.length * entrelinha(11) + 2;

  const fotoFachada = imovel.fachada && fotos.find((f) => f.id === imovel.fachada.fotoId);
  const alturaFachada = 92;
  if (fotoFachada) {
    await fotoNaCaixa(fotoFachada, MARGEM, y, UTIL, alturaFachada);
  } else {
    doc.setFillColor(...FUNDO);
    doc.setDrawColor(...LINHA);
    doc.rect(MARGEM, y, UTIL, alturaFachada, 'FD');
    fonte('normal', 10, CINZA);
    escrever('Sem foto da fachada', LARGURA / 2, y + alturaFachada / 2, { align: 'center' });
  }
  y += alturaFachada + 8;

  const localizacao = [imovel.estaca && `Estaca ${imovel.estaca}`, LADO_EXTENSO[imovel.lado]].filter(Boolean).join(', ');
  const rotuloStatus = rotuloDe(STATUS, imovel.status) || imovel.status;
  const situacao = {
    ciencia: 'Vistoriado — termo assinado pelo morador',
    recusa: 'Recusado — termo de recusa assinado',
  }[tipo] ?? `${rotuloStatus} — termo ainda não assinado`;
  const inicioVistoria = assinatura?.inicio ?? fotos.map((f) => f.entrouEm).sort()[0] ?? imovel.criadoEm;
  const fimVistoria = assinatura?.assinadoEm ?? fotos.map((f) => f.entrouEm).sort().at(-1) ?? null;
  const nomeResponsavel = [
    responsavel?.nome || SEM_INFO,
    responsavel?.crea && (/^CREA/i.test(responsavel.crea) ? responsavel.crea : `CREA ${responsavel.crea}`),
    responsavel?.art && `ART ${responsavel.art}`,
  ].filter(Boolean).join(' · ');
  const enderecoCompleto = imovel.endereco
    ? (/bel[eé]m/i.test(imovel.endereco) ? imovel.endereco : `${imovel.endereco} — Belém/PA`)
    : SEM_INFO;
  const dados = [
    ['Endereço do imóvel', enderecoCompleto],
    ['Localização na obra', localizacao || SEM_INFO],
    ['Data da vistoria', periodo(inicioVistoria, fimVistoria)],
    ['Situação', situacao],
    ['Responsável técnico', nomeResponsavel],
    ['Contratante da obra', OBRA.contratante],
  ];
  const larguraDado = (UTIL - 8) / 2;
  for (let i = 0; i < dados.length; i += 2) {
    let maior = 0;
    dados.slice(i, i + 2).forEach(([rotulo, valor], j) => {
      const x = MARGEM + j * (larguraDado + 8);
      fonte('normal', 8.5, CINZA);
      escrever(rotulo, x, y);
      fonte('normal', 10, TEXTO);
      // até 2 linhas na capa (o texto completo está nas seções 3 e 4)
      const linhas = cortar(valor, larguraDado, 2);
      doc.text(linhas, x, y + 4.6);
      maior = Math.max(maior, 4.6 + linhas.length * entrelinha(10));
    });
    y += maior + 3;
  }

  const yRodapeCapa = 256;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.line(MARGEM, yRodapeCapa, DIREITA, yRodapeCapa);
  textoRico([
    { texto: OBRA.consorcio.nome, estilo: 'negrito', cor: TEXTO },
    { texto: ` · CNPJ ${OBRA.consorcio.cnpj}`, cor: CINZA },
  ], MARGEM, yRodapeCapa + 5, UTIL, 8.5);
  fonte('normal', 8.5, CINZA);
  escrever(`${OBRA.consorcio.endereco} · ${OBRA.consorcio.telefone}`, MARGEM, yRodapeCapa + 9.5);

  // =====================================================================
  // 1–4: objetivo, método, identificação, características
  // =====================================================================
  novaPagina();
  titulo(1, 'Objetivo', inicioParagrafo(TEXTOS.objetivo));
  paragrafo(TEXTOS.objetivo);
  titulo(2, 'Método', inicioParagrafo(TEXTOS.metodo(tipo)));
  paragrafo(TEXTOS.metodo(tipo));

  titulo(3, 'Identificação e localização');
  const gps = imovel.gps
    ? `${numeroBr(imovel.gps.lat, 6)}, ${numeroBr(imovel.gps.lon, 6)}${imovel.gps.precisao != null ? ` (precisão ±${numeroBr(imovel.gps.precisao)} m)` : ''}`
    : SEM_INFO;
  const ocupante = imovel.ocupanteNome
    ? [imovel.ocupanteNome, rotuloDe(CONDICOES_OCUPANTE, imovel.ocupanteCondicao).toLowerCase()].filter(Boolean).join(' — ')
    : SEM_INFO;
  const distancia = imovel.distanciaObra != null && imovel.distanciaObra !== ''
    ? `${Number(imovel.distanciaObra).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m` : SEM_INFO;
  ficha([
    ['Endereço', enderecoCompleto],
    ['Ponto de referência', imovel.referencia || SEM_INFO],
    ['Estaca / lado', [imovel.estaca, LADO_EXTENSO[imovel.lado]].filter(Boolean).join(' / ') || SEM_INFO],
    ['Distância à borda da obra', distancia],
    ['Coordenadas GPS', gps],
    ['Ocupante', ocupante],
  ]);

  titulo(4, 'Características e estado de conservação');
  const conservacao = rotuloDe(CONSERVACOES, imovel.conservacao);
  ficha([
    ['Uso', rotuloDe(USOS, imovel.uso) || SEM_INFO],
    ['Pavimentos', imovel.pavimentos != null && imovel.pavimentos !== '' ? String(imovel.pavimentos) : SEM_INFO],
    ['Estrutura', rotuloDe(ESTRUTURAS, imovel.estrutura) || SEM_INFO],
    ['Cobertura', rotuloDe(COBERTURAS, imovel.cobertura) || SEM_INFO],
    ['Fundação aparente', rotuloDe(FUNDACOES, imovel.fundacao) || SEM_INFO],
    ['Idade aparente', rotuloDe(IDADES, imovel.idadeAparente) || SEM_INFO],
    ['Estado de conservação', conservacao ? { texto: conservacao, estilo: 'negrito' } : SEM_INFO],
    ['Observações', imovel.observacoes || '—'],
  ]);

  // =====================================================================
  // 5: relatório fotográfico (2 fotos por linha, foto inteira, legenda)
  // =====================================================================
  novaPagina();
  titulo(5, 'Relatório fotográfico');
  const COLUNA = (UTIL - 6) / 2;
  const ALTURA_FOTO = 62;
  const TAM_LEGENDA = 8.5;
  const MAX_LINHAS_DESCRICAO = 10;
  const descricoesLongas = []; // descrição que não cabe na legenda sai inteira no fim da seção 5

  const legenda = ({ foto, ambiente, numero }) => {
    const local = rotuloDe(LOCAIS_FOTO, foto.local);
    const onde = [ambiente.nome, local && local.toLowerCase() !== ambiente.nome.toLowerCase() ? local.toLowerCase() : '']
      .filter(Boolean).join(', ');
    const trechos = [
      { texto: `Foto ${numero}`, estilo: 'negrito', cor: AZUL, inteiro: true },
      { texto: ` — ${onde}` },
      { texto: '\n' },
    ];
    const patologias = (foto.patologias ?? []).filter((p) => p !== SEM_PATOLOGIA);
    if (patologias.length) {
      trechos.push({ texto: patologias.map(rotuloPatologia).join(' · '), estilo: 'negrito', cor: VERMELHO });
      const medida = foto.abertura != null && foto.abertura !== '' && patologias.some((p) => PATOLOGIAS_COM_ABERTURA.includes(p));
      if (medida) trechos.push({ texto: ` · abertura ${Number(foto.abertura).toLocaleString('pt-BR')} mm` });
    } else if (foto.patologias?.includes(SEM_PATOLOGIA)) {
      trechos.push({ texto: 'Sem patologia aparente', estilo: 'negrito', cor: VERDE });
    } else {
      trechos.push({ texto: 'Patologia não informada', cor: CINZA });
    }
    trechos.push({ texto: '\n' });
    if (foto.descricao) {
      fonte('normal', TAM_LEGENDA);
      if (quebrar(foto.descricao, COLUNA - 2).length > MAX_LINHAS_DESCRICAO) {
        for (const l of cortar(foto.descricao, COLUNA - 2, MAX_LINHAS_DESCRICAO)) {
          trechos.push({ texto: l, inteiro: true }, { texto: '\n' });
        }
        trechos.push({ texto: 'Descrição completa no fim do relatório fotográfico.', cor: CINZA }, { texto: '\n' });
        descricoesLongas.push({ numero, texto: foto.descricao });
      } else {
        trechos.push({ texto: foto.descricao }, { texto: '\n' });
      }
    }
    trechos.push({ texto: `Tirada em ${dataHoraSeg(foto.tiradaEm)}` });
    if (foto.entrouEm && Math.abs(new Date(foto.entrouEm) - new Date(foto.tiradaEm)) > 10 * 60000) {
      trechos.push({ texto: ` · no app em ${dataHoraSeg(foto.entrouEm)}` });
    }
    trechos.push({ texto: ' · ' }, { texto: agrupar(String(foto.hash).slice(0, 16)), estilo: 'mono', cor: CINZA, tamanho: 7.5, inteiro: true });
    if (depoisDaAssinatura(foto)) {
      trechos.push({ texto: '\n' }, { texto: 'Foto incluída depois da assinatura (fora do termo)', estilo: 'negrito', cor: CINZA });
    }
    return trechos;
  };

  // "\n" nos trechos = quebra de linha: cada bloco entre quebras é medido e escrito separado
  const blocos = (trechos) => trechos.reduce((lista, t) => {
    if (t.texto === '\n') lista.push([]); else lista[lista.length - 1].push(t);
    return lista;
  }, [[]]).filter((b) => b.length);
  const medirLegenda = (trechos) => blocos(trechos)
    .reduce((soma, b) => soma + textoRico(b, 0, 0, COLUNA, TAM_LEGENDA, false), 0);
  const escreverLegenda = (trechos, x, yy) => {
    let pos = yy + TAM_LEGENDA * PT;
    for (const b of blocos(trechos)) pos += textoRico(b, x, pos, COLUNA, TAM_LEGENDA);
  };

  const ALTURA_TITULO_AMBIENTE = 10;
  function tituloAmbiente(texto) {
    y += 2;
    doc.setFillColor(...VERDE);
    doc.rect(MARGEM, y, 1.3, 5.5, 'F');
    fonte('negrito', 11.5, AZUL);
    doc.text(cortar(texto, UTIL - 4, 1)[0], MARGEM + 3.5, y + 4.3);
    y += ALTURA_TITULO_AMBIENTE - 2;
  }

  if (!grupos.length) paragrafo('Nenhuma foto registrada.');
  for (const { ambiente, fotos: lista } of grupos) {
    const linhas = [];
    for (let i = 0; i < lista.length; i += 2) linhas.push(lista.slice(i, i + 2));
    for (const par of linhas) {
      par.legendas = par.map(legenda);
      par.altura = ALTURA_FOTO + 2 + Math.max(...par.legendas.map(medirLegenda));
    }
    for (const [i, par] of linhas.entries()) {
      if (i === 0) {
        garantir(ALTURA_TITULO_AMBIENTE + par.altura); // título do ambiente junto da primeira linha
        tituloAmbiente(ambiente.nome);
      } else if (y + par.altura > FIM_CONTEUDO) {
        novaPagina();
        tituloAmbiente(`${ambiente.nome} (continuação)`);
      }
      for (const [j, item] of par.entries()) {
        const x = MARGEM + j * (COLUNA + 6);
        await fotoNaCaixa(item.foto, x, y, COLUNA, ALTURA_FOTO);
        escreverLegenda(par.legendas[j], x, y + ALTURA_FOTO + 2);
      }
      y += par.altura + 5;
    }
  }
  if (descricoesLongas.length) {
    garantir(ALTURA_TITULO_AMBIENTE + 3 * entrelinha(9));
    tituloAmbiente('Descrições completas');
    for (const { numero, texto } of descricoesLongas) {
      paragrafo([{ texto: `Foto ${numero}: `, estilo: 'negrito', cor: AZUL }, { texto }], 9);
    }
  }

  // =====================================================================
  // 6–8: quadro-resumo, conclusão, termo
  // =====================================================================
  novaPagina();
  titulo(6, 'Quadro-resumo das patologias', 15);
  const linhasResumo = [];
  let fotosComPatologia = 0;
  let semPatologia = 0;
  let semClassificacao = 0;
  for (const { foto, ambiente, numero } of numeradas) {
    const patologias = (foto.patologias ?? []).filter((p) => p !== SEM_PATOLOGIA);
    if (patologias.length) fotosComPatologia += 1;
    else if (foto.patologias?.includes(SEM_PATOLOGIA)) semPatologia += 1;
    else semClassificacao += 1;
    for (const p of patologias) {
      const abertura = PATOLOGIAS_COM_ABERTURA.includes(p) && foto.abertura != null && foto.abertura !== ''
        ? `${Number(foto.abertura).toLocaleString('pt-BR')} mm` : '—';
      linhasResumo.push([String(numero), ambiente.nome, rotuloPatologia(p), rotuloDe(LOCAIS_FOTO, foto.local) || '—', abertura]);
    }
  }
  if (linhasResumo.length) {
    tabela([
      { titulo: 'Foto', largura: 16 }, { titulo: 'Ambiente', largura: 38 }, { titulo: 'Patologia', largura: 70 },
      { titulo: 'Local', largura: 28 }, { titulo: 'Abertura', largura: UTIL - 152 },
    ], linhasResumo, { tamanho: 9 });
  } else {
    paragrafo('Nenhuma patologia registrada nas fotos.');
  }
  const partesResumo = [
    linhasResumo.length
      ? `${plural(linhasResumo.length, 'patologia', 'patologias')} em ${plural(fotosComPatologia, 'foto', 'fotos')}`
      : 'nenhuma patologia',
    semPatologia && `${plural(semPatologia, 'foto', 'fotos')} sem patologia aparente`,
    semClassificacao && `${plural(semClassificacao, 'foto', 'fotos')} sem classificação`,
  ].filter(Boolean);
  if (numeradas.length) {
    paragrafo(`${plural(numeradas.length, 'foto registrada', 'fotos registradas')}: ${partesResumo.join('; ')}.`);
  }

  const textoConclusao = TEXTOS.conclusao({ conservacao, comPatologias: linhasResumo.length > 0, tipo });
  titulo(7, 'Conclusão', inicioParagrafo(textoConclusao));
  paragrafo(textoConclusao);

  // termo num quadro; se o texto for maior que o espaço, o quadro continua na página seguinte
  const textoTermo = assinatura ? assinatura.texto : 'Termo ainda não assinado.';
  const passoTermo = entrelinha(10.5);
  fonte('normal', 10.5);
  let restoTermo = quebrar(textoTermo, UTIL - 10);
  titulo(8, tipo === 'recusa' ? 'Termo de Recusa' : 'Termo de ciência',
    2 + Math.min(restoTermo.length, 3) * passoTermo + 8);
  y += 2;
  while (restoTermo.length) {
    const cabem = Math.floor((FIM_CONTEUDO - y - 8) / passoTermo);
    if (cabem < Math.min(2, restoTermo.length)) { novaPagina(); continue; }
    const parte = restoTermo.slice(0, cabem);
    restoTermo = restoTermo.slice(cabem);
    const altura = parte.length * passoTermo + 8;
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(MARGEM, y, UTIL, altura);
    fonte('normal', 10.5);
    doc.text(parte, MARGEM + 5, y + 4 + 10.5 * PT);
    y += altura;
    if (restoTermo.length) novaPagina();
  }
  y += 4;

  if (assinatura) {
    if (tipo === 'recusa' && assinatura.motivoRecusa && !assinatura.texto.includes(assinatura.motivoRecusa)) {
      paragrafo([{ texto: 'Motivo da recusa: ', estilo: 'negrito' }, { texto: assinatura.motivoRecusa }]);
    }
    const pessoas = [
      ['ocupante', 'Ocupante'], ['testemunha', 'Testemunha'], ['vistoriador', 'Vistoriador'],
    ].filter(([papel]) => assinatura[papel]).map(([papel, rotulo]) => ({ ...assinatura[papel], rotulo }));
    const LARG_ASS = (UTIL - 10) / 2;
    const ALT_ASS = 22;
    for (let i = 0; i < pessoas.length; i += 2) {
      garantir(ALT_ASS + 16);
      y += 4;
      for (const [j, p] of pessoas.slice(i, i + 2).entries()) {
        const x = MARGEM + j * (LARG_ASS + 10);
        if (p.assinatura) {
          const bytes = await bytesDe(p.assinatura);
          const m = medidas(bytes) ?? { largura: 3, altura: 1 };
          const escala = Math.min(LARG_ASS / m.largura, ALT_ASS / m.altura);
          const w = m.largura * escala;
          const h = m.altura * escala;
          doc.addImage(bytes, 'PNG', x + (LARG_ASS - w) / 2, y + ALT_ASS - h, w, h);
        }
        doc.setDrawColor(34, 34, 34);
        doc.setLineWidth(0.3);
        doc.line(x, y + ALT_ASS, x + LARG_ASS, y + ALT_ASS);
        fonte('negrito', 9);
        escrever(p.nome ?? '', x + LARG_ASS / 2, y + ALT_ASS + 4.5, { align: 'center' });
        fonte('normal', 9);
        escrever([p.rotulo, p.documento && `Doc. ${p.documento}`].filter(Boolean).join(' · '),
          x + LARG_ASS / 2, y + ALT_ASS + 8.6, { align: 'center' });
      }
      y += ALT_ASS + 12;
    }
    y += 3;
    const inicio = assinatura.inicio ? ` · início da vistoria ${horaBr(assinatura.inicio, true)}` : '';
    paragrafo(`Assinado em ${dataBr(assinatura.assinadoEm)} às ${horaBr(assinatura.assinadoEm, true)}${inicio}.`, 9);
    y -= 1.5;
    paragrafo([
      { texto: 'Código de verificação da assinatura: ' },
      { texto: agrupar(assinatura.codigo), estilo: 'mono', cor: CINZA, tamanho: 7.5, inteiro: true },
    ], 9);
  }

  const listaCodigos = assinatura
    ? assinatura.fotos.map((f) => [numeroDe.has(f.id) ? String(numeroDe.get(f.id)) : '?', f.hash])
    : numeradas.map(({ foto, numero }) => [String(numero), foto.hash]);
  const tituloCodigos = {
    ciencia: 'Fotos conferidas pelo ocupante (códigos completos)',
    recusa: 'Fotos registradas na recusa (códigos completos)',
  }[tipo] ?? 'Fotos registradas (códigos completos)';
  garantir(20);
  y += 3;
  fonte('negrito', 10.5, AZUL);
  escrever(tituloCodigos, MARGEM, y);
  y += 3;
  if (listaCodigos.length) {
    tabela([
      { titulo: 'Foto', largura: 16 },
      { titulo: 'Código de verificação (SHA-256)', largura: UTIL - 16, estilo: 'mono', tamanho: 7.4 },
    ], listaCodigos, { tamanho: 9 });
  } else {
    y += 3;
    paragrafo('Nenhuma foto.');
  }
  const depois = numeradas.filter(({ foto }) => depoisDaAssinatura(foto)).map(({ numero }) => numero);
  if (depois.length) {
    paragrafo(depois.length === 1
      ? `Foto incluída depois da assinatura (não consta deste termo): ${depois[0]}.`
      : `Fotos incluídas depois da assinatura (não constam deste termo): ${depois.join(', ')}.`, 9);
  }

  // =====================================================================
  // rodapé "página X de Y" e faixa de rascunho em todas as páginas
  // =====================================================================
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    if (!assinatura) {
      doc.setFillColor(253, 228, 229);
      doc.setDrawColor(...VERMELHO);
      doc.setLineWidth(0.4);
      doc.rect(MARGEM, 280.5, UTIL, 6.5, 'FD');
      fonte('negrito', 9.5, VERMELHO);
      escrever('RASCUNHO — termo ainda não assinado', LARGURA / 2, 284.9, { align: 'center' });
    }
    fonte('normal', 7.5, CINZA);
    escrever('Vistoria cautelar – CBS Fase III', MARGEM, 291.5);
    escrever(`página ${p} de ${total}`, DIREITA, 291.5, { align: 'right' });
  }

  return new File([doc.output('arraybuffer')], nomeDoLaudo(imovel.id, imovel.endereco), { type: 'application/pdf' });
}
