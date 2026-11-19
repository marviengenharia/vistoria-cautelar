// ZIP simples, sem compressão (método 0 "guardar"): as fotos já são JPEG.
// criarZip monta o arquivo a partir de Blobs, sem copiar os dados mais de uma vez.
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataHoraDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const data = (Math.max(d.getFullYear() - 1980, 0) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, data };
}

async function paraBytes(dados) {
  if (dados instanceof Uint8Array) return dados;
  if (typeof dados === 'string') return new TextEncoder().encode(dados);
  return new Uint8Array(await dados.arrayBuffer());
}

export async function criarZip(arquivos) {
  const { hora, data } = dataHoraDos(new Date());
  const partes = [];
  const central = [];
  let posicao = 0;
  for (const { nome, dados } of arquivos) {
    const bytes = await paraBytes(dados);
    const nomeBytes = new TextEncoder().encode(nome);
    const crc = crc32(bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // bit 11: nomes em UTF-8
    local.setUint16(8, 0, true); // método 0: guardar
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nomeBytes.length, true);
    partes.push(local.buffer, nomeBytes, bytes);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, data, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, nomeBytes.length, true);
    c.setUint32(42, posicao, true);
    central.push(c.buffer, nomeBytes);

    posicao += 30 + nomeBytes.length + bytes.length;
  }
  const tamCentral = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, posicao, true);
  return new Blob([...partes, ...central, fim.buffer], { type: 'application/zip' });
}

const DANIFICADO = 'Arquivo de backup danificado.';

export async function lerZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // procura o "fim do diretório central" nos últimos bytes
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error(DANIFICADO);
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const mapa = new Map();
  const decodificador = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error(DANIFICADO);
    const metodo = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const tamanho = dv.getUint32(p + 24, true);
    const tamNome = dv.getUint16(p + 28, true);
    const tamExtra = dv.getUint16(p + 30, true);
    const tamComent = dv.getUint16(p + 32, true);
    const posLocal = dv.getUint32(p + 42, true);
    if (metodo !== 0) throw new Error('Este arquivo não foi feito pelo app.');
    const nome = decodificador.decode(buf.subarray(p + 46, p + 46 + tamNome));
    if (posLocal + 30 > buf.length || dv.getUint32(posLocal, true) !== 0x04034b50) throw new Error(DANIFICADO);
    const inicio = posLocal + 30 + dv.getUint16(posLocal + 26, true) + dv.getUint16(posLocal + 28, true);
    if (inicio + tamanho > buf.length) throw new Error(DANIFICADO);
    const bytes = buf.slice(inicio, inicio + tamanho);
    if (crc32(bytes) !== crc) throw new Error(DANIFICADO);
    mapa.set(nome, bytes);
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return mapa;
}
