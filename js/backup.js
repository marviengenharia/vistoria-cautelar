// Backup de um imóvel: um arquivo .zip com os dados (imovel.json), as fotos e as assinaturas.
// As imagens vão para o zip byte a byte, sem alteração (o hash e o código continuam valendo).
import {
  obterImovelCompleto, listarImoveis, obterConfig, gravarConfig, codigoDaAssinatura, restaurarImovel,
} from './db.js';
import { criarZip, lerZip } from './zip.js';
import { impressaoDigital } from './foto.js';
import { STATUS } from './dominio.js';

const FORMATO = 1;
const PESSOAS = ['ocupante', 'testemunha', 'vistoriador'];

/** Data de hoje no aparelho: 2026-11-19 */
function dataLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monta o arquivo IM-012_2026-11-19.zip do imóvel. */
export async function montarBackup(imovelId) {
  const { imovel, ambientes, fotos, assinaturas } = await obterImovelCompleto(imovelId);
  const arquivos = [];

  const fotosJson = fotos.map(({ blob, miniatura, ...dados }) => {
    arquivos.push({ nome: `fotos/${dados.id}.jpg`, dados: blob });
    if (miniatura) arquivos.push({ nome: `miniaturas/${dados.id}.jpg`, dados: miniatura });
    return dados;
  });

  const assinaturasJson = assinaturas.map((a) => {
    const copia = { ...a };
    for (const papel of PESSOAS) {
      const p = a[papel];
      if (!p) continue;
      const caminho = p.assinatura ? `assinaturas/${a.id}-${papel}.png` : null;
      if (caminho) arquivos.push({ nome: caminho, dados: p.assinatura });
      copia[papel] = { ...p, assinatura: caminho };
    }
    return copia;
  });

  const conteudo = {
    formato: FORMATO,
    geradoEm: new Date().toISOString(),
    imovel: {
      ...imovel,
      fachada: imovel.fachada ? { fotoId: imovel.fachada.fotoId, tiradaEm: imovel.fachada.tiradaEm } : null,
    },
    ambientes,
    fotos: fotosJson,
    assinaturas: assinaturasJson,
  };
  arquivos.unshift({ nome: 'imovel.json', dados: JSON.stringify(conteudo, null, 2) });

  const zip = await criarZip(arquivos);
  return new File([zip], `${imovelId}_${dataLocal()}.zip`, { type: 'application/zip' });
}

const NAO_E_DO_APP = 'Este arquivo não foi feito pelo app.';
const ID_IMOVEL = /^IM-\d{3,}$/;
const ID_REGISTRO = /^[\w-]{1,64}$/;

/** O imovel.json tem a forma que o app grava? (ids, ligações entre registros e situação conhecida) */
function formaValida({ imovel, ambientes, fotos, assinaturas }) {
  const listas = [ambientes, fotos, assinaturas];
  if (!ID_IMOVEL.test(imovel?.id ?? '') || !listas.every(Array.isArray)) return false;
  if (!STATUS.some((s) => s.valor === imovel.status)) return false;
  if (!listas.flat().every((r) => r?.imovelId === imovel.id && ID_REGISTRO.test(r.id ?? ''))) return false;
  const idsAmbientes = new Set(ambientes.map((a) => a.id));
  if (!fotos.every((f) => idsAmbientes.has(f.ambienteId))) return false;
  return !imovel.fachada?.fotoId || fotos.some((f) => f.id === imovel.fachada.fotoId);
}

/**
 * Lê um arquivo de backup e confere tudo antes de qualquer gravação: cada foto com o hash dela,
 * cada assinatura com o código dela e cada foto assinada com o hash que foi assinado.
 * Se algo não bater, lança um Error "IM-012_2026-11-19.zip: motivo".
 * @returns {Promise<{ id: string, atualizadoEm: string, dados: object }>}
 */
export async function lerBackup(arquivo) {
  const falha = (motivo) => new Error(`${arquivo.name}: ${motivo}`);
  let mapa;
  try {
    mapa = await lerZip(arquivo);
  } catch (erro) {
    throw falha(erro.message);
  }
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(mapa.get('imovel.json')));
  } catch {
    throw falha(NAO_E_DO_APP);
  }
  if (typeof json?.formato === 'number' && json.formato > FORMATO) {
    throw falha('este backup foi feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  }
  if (json?.formato !== FORMATO || !formaValida(json)) throw falha(NAO_E_DO_APP);
  const { imovel, ambientes, fotos, assinaturas } = json;
  const id = imovel.id;

  const fotosProntas = [];
  for (const [i, f] of fotos.entries()) {
    const bytes = mapa.get(`fotos/${f.id}.jpg`);
    if (!bytes) throw falha(`falta a foto ${i + 1} no arquivo.`);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    if ((await impressaoDigital(blob)) !== f.hash) throw falha(`a foto ${i + 1} não confere com o código de verificação.`);
    const mini = mapa.get(`miniaturas/${f.id}.jpg`);
    fotosProntas.push({ ...f, blob, miniatura: mini ? new Blob([mini], { type: 'image/jpeg' }) : null });
  }

  const assinaturasProntas = [];
  for (const [i, a] of assinaturas.entries()) {
    const registro = { ...a };
    for (const papel of PESSOAS) {
      const caminho = a[papel]?.assinatura;
      if (!caminho) continue;
      const bytes = mapa.get(caminho);
      if (!bytes) throw falha(`falta a imagem da assinatura ${i + 1} no arquivo.`);
      registro[papel] = { ...a[papel], assinatura: new Blob([bytes], { type: 'image/png' }) };
    }
    if (!Array.isArray(a.fotos) || (await codigoDaAssinatura(registro)) !== a.codigo) {
      throw falha(`a assinatura ${i + 1} não confere com o código de verificação.`);
    }
    for (const assinada of a.fotos) {
      const n = fotos.findIndex((f) => f.id === assinada.id);
      if (n < 0) throw falha(`falta no arquivo uma foto da assinatura ${i + 1}.`);
      if (fotos[n].hash !== assinada.hash) throw falha(`a foto ${n + 1} não é a mesma que foi assinada.`);
    }
    assinaturasProntas.push(registro);
  }

  return {
    id,
    atualizadoEm: imovel.atualizadoEm ?? null,
    dados: { geradoEm: json.geradoEm ?? null, imovel, ambientes, fotos: fotosProntas, assinaturas: assinaturasProntas },
  };
}

/** Grava o imóvel lido por lerBackup (substitui o que houver) e conta como backup feito. */
export async function restaurarBackup({ id, dados }) {
  await restaurarImovel(dados);
  await registrarBackup([id], dados.geradoEm ?? new Date().toISOString());
}

/**
 * Imóveis com alguma mudança depois do último backup dele (ou nunca copiados).
 * `desde` = desde quando está sem backup: a hora do último backup ou, se nunca teve, a criação.
 */
export async function imoveisSemBackup() {
  const backups = (await obterConfig('backups')) ?? {};
  return (await listarImoveis())
    .filter((im) => !backups[im.id] || (im.atualizadoEm && im.atualizadoEm > backups[im.id]))
    .map((im) => ({ id: im.id, desde: backups[im.id] ?? im.criadoEm ?? im.atualizadoEm ?? null }));
}

/**
 * Anota o backup dos imóveis. `quando` = hora em que os dados foram lidos para o backup
 * (padrão: agora); mudança feita depois disso continua contando como "sem backup".
 */
export async function registrarBackup(ids, quando = new Date().toISOString()) {
  const backups = (await obterConfig('backups')) ?? {};
  for (const id of ids) backups[id] = quando;
  await gravarConfig('backups', backups);
}
