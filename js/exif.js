// Leitura da hora em que a foto foi tirada (EXIF), direto do arquivo JPEG.
const LIMITE_LEITURA = 128 * 1024; // só o começo do arquivo, onde fica o EXIF
const TAG_DATA_ORIGINAL = 0x9003;  // DateTimeOriginal
const TAG_DATA = 0x0132;           // DateTime (IFD0)
const TAG_SUB_IFD = 0x8769;        // ponteiro para o sub-IFD EXIF

/** Lê as entradas de um IFD e devolve o texto ASCII da tag pedida (ou o ponteiro numérico). */
function procurarTag(vista, inicioTiff, deslocamento, tag, le) {
  const qtd = vista.getUint16(deslocamento, le);
  for (let i = 0; i < qtd; i++) {
    const e = deslocamento + 2 + i * 12;
    if (vista.getUint16(e, le) !== tag) continue;
    const tipo = vista.getUint16(e + 2, le);
    const total = vista.getUint32(e + 4, le);
    if (tipo === 4) return vista.getUint32(e + 8, le); // LONG (ponteiro)
    if (tipo !== 2 || total < 19) return null;          // ASCII "AAAA:MM:DD HH:MM:SS"
    const ini = inicioTiff + vista.getUint32(e + 8, le);
    let texto = '';
    for (let k = 0; k < 19; k++) texto += String.fromCharCode(vista.getUint8(ini + k));
    return texto;
  }
  return null;
}

function paraData(texto) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(texto || '');
  if (!m) return null;
  const [a, mes, d, h, mi, s] = m.slice(1).map(Number);
  if (a < 1990 || mes < 1 || mes > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return new Date(a, mes - 1, d, h, mi, s); // hora local, como a câmera gravou
}

/** Hora da foto segundo o EXIF (DateTimeOriginal, senão DateTime) ou null. Nunca lança. */
export async function lerHoraExif(blob) {
  try {
    const vista = new DataView(await blob.slice(0, LIMITE_LEITURA).arrayBuffer());
    if (vista.getUint16(0) !== 0xFFD8) return null;
    let pos = 2;
    while (pos + 4 <= vista.byteLength) {
      if (vista.getUint8(pos) !== 0xFF) return null;
      const marcador = vista.getUint8(pos + 1);
      if (marcador === 0xDA || marcador === 0xD9) return null; // chegou na imagem
      const tamanho = vista.getUint16(pos + 2);
      if (marcador === 0xE1 && vista.getUint32(pos + 4) === 0x45786966) { // "Exif"
        const tiff = pos + 10;
        const le = vista.getUint16(tiff) === 0x4949; // "II"
        const ifd0 = tiff + vista.getUint32(tiff + 4, le);
        const sub = procurarTag(vista, tiff, ifd0, TAG_SUB_IFD, le);
        let texto = typeof sub === 'number'
          ? procurarTag(vista, tiff, tiff + sub, TAG_DATA_ORIGINAL, le) : null;
        let data = paraData(texto);
        if (!data) data = paraData(procurarTag(vista, tiff, ifd0, TAG_DATA, le));
        return data;
      }
      pos += 2 + tamanho;
    }
    return null;
  } catch {
    return null;
  }
}

/** Melhor hora conhecida da foto: EXIF, senão data do arquivo, senão agora. */
export async function horaDaFoto(arquivo) {
  const exif = await lerHoraExif(arquivo);
  if (exif) return { data: exif, origem: 'exif' };
  const mod = arquivo.lastModified;
  if (mod && mod <= Date.now() + 60000) return { data: new Date(mod), origem: 'arquivo' };
  return { data: new Date(), origem: 'app' };
}
