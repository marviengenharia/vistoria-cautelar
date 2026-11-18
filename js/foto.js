// Tratamento das fotos no próprio aparelho: reduz, carimba, gera miniatura e
// calcula a "impressão digital" (SHA-256) que prova que a foto não foi alterada depois.
import { numeroBr } from './util.js';

const LADO_MAIOR = 1600;       // px (especificação)
const QUALIDADE_FOTO = 0.75;   // JPEG (especificação)
const LADO_MINIATURA = 240;    // px, quadrada
const QUALIDADE_MINIATURA = 0.7;

const dois = (n) => String(n).padStart(2, '0');

/** "IM-001 · 18/11/2026 14:05 · -1,443600, -48,473200 ±6 m" (ou "· sem GPS"). */
export function textoCarimbo(imovel, data = new Date()) {
  const quando = `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} `
    + `${dois(data.getHours())}:${dois(data.getMinutes())}`;
  const gps = imovel.gps
    ? `${numeroBr(imovel.gps.lat, 6)}, ${numeroBr(imovel.gps.lon, 6)} ±${imovel.gps.precisao} m`
    : 'sem GPS';
  return `${imovel.id} · ${quando} · ${gps}`;
}

function paraBlob(canvas, qualidade) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a foto.'))),
      'image/jpeg', qualidade);
  });
}

/** Impressão digital SHA-256 em hexadecimal. */
export async function impressaoDigital(blob) {
  const resumo = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {Blob} arquivo  foto vinda da câmera ou da galeria
 * @param {string} carimbo texto do carimbo (ver textoCarimbo)
 * @returns {Promise<{ foto: Blob, miniatura: Blob, hash: string }>}
 */
export async function processarFoto(arquivo, carimbo) {
  let imagem;
  try {
    // imageOrientation 'from-image': respeita a rotação gravada pela câmera (foto em pé sai em pé)
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível ler essa imagem.');
  }

  try {
    // ----- foto reduzida + carimbo -----
    const escala = Math.min(1, LADO_MAIOR / Math.max(imagem.width, imagem.height));
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext('2d');
    ctx.drawImage(imagem, 0, 0, largura, altura);

    const faixa = Math.max(28, Math.round(altura * 0.035));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, altura - faixa, largura, faixa);
    let fonte = Math.round(faixa * 0.6);
    ctx.font = `bold ${fonte}px sans-serif`;
    // diminui a letra se o texto não couber na largura
    while (ctx.measureText(carimbo).width > largura - 16 && fonte > 10) {
      fonte -= 1;
      ctx.font = `bold ${fonte}px sans-serif`;
    }
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(carimbo, 8, altura - faixa / 2);
    const foto = await paraBlob(tela, QUALIDADE_FOTO);

    // ----- miniatura: recorte quadrado do centro -----
    const lado = Math.min(imagem.width, imagem.height);
    const mini = document.createElement('canvas');
    mini.width = LADO_MINIATURA;
    mini.height = LADO_MINIATURA;
    mini.getContext('2d').drawImage(
      imagem,
      (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado,
      0, 0, LADO_MINIATURA, LADO_MINIATURA
    );
    const miniatura = await paraBlob(mini, QUALIDADE_MINIATURA);

    return { foto, miniatura, hash: await impressaoDigital(foto) };
  } finally {
    imagem.close();
  }
}
