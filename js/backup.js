// Backup de um imóvel: um arquivo .zip com os dados (imovel.json), as fotos e as assinaturas.
// As imagens vão para o zip byte a byte, sem alteração (o hash e o código continuam valendo).
import {
  obterImovelCompleto, listarImoveis, obterConfig, gravarConfig, codigoDaAssinatura, restaurarImovel,
} from './db.js';
import { criarZip, lerZip } from './zip.js';
import { impressaoDigital, miniaturaDaFoto } from './foto.js';
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

// Conferência de tipo: o que vem do arquivo vai para a tela e para métodos de texto.
const texto = (v) => typeof v === 'string';
const textoOuNada = (v) => v === undefined || v === null || typeof v === 'string';
const numeroOuNada = (v) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v));
const idRegistro = (v) => texto(v) && ID_REGISTRO.test(v);
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Campos de texto do imóvel que podem faltar em imóvel antigo (se vierem, têm de ser texto). */
const TEXTOS_IMOVEL = [
  'endereco', 'referencia', 'estaca', 'lado', 'ocupanteNome', 'ocupanteTelefone', 'ocupanteCondicao',
  'uso', 'estrutura', 'cobertura', 'fundacao', 'idadeAparente', 'conservacao', 'recusaMotivo', 'recusaTestemunha',
];
const TEXTOS_ASSINATURA = ['tipo', 'inicio', 'texto', 'motivoRecusa'];

function imovelValido(im) {
  if (!objeto(im) || !texto(im.id) || !ID_IMOVEL.test(im.id)) return false;
  if (!STATUS.some((s) => s.valor === im.status)) return false;
  if (![im.criadoEm, im.atualizadoEm, im.observacoes].every(texto)) return false;
  if (!TEXTOS_IMOVEL.every((c) => textoOuNada(im[c]))) return false;
  if (!numeroOuNada(im.distanciaObra) || !numeroOuNada(im.pavimentos)) return false;
  if (im.gps != null && !(objeto(im.gps) && [im.gps.lat, im.gps.lon, im.gps.precisao].every(numeroOuNada)
    && textoOuNada(im.gps.capturadoEm))) return false;
  return im.fachada == null || (objeto(im.fachada) && idRegistro(im.fachada.fotoId) && textoOuNada(im.fachada.tiradaEm));
}

const ambienteValido = (a) => texto(a.nome) && texto(a.criadoEm);

const fotoValida = (f) => idRegistro(f.ambienteId) && texto(f.tiradaEm) && texto(f.entrouEm)
  && Array.isArray(f.patologias) && f.patologias.every(texto) && numeroOuNada(f.abertura)
  && ['local', 'descricao', 'origemHora', 'hash'].every((c) => textoOuNada(f[c]));

const assinaturaValida = (a) => texto(a.assinadoEm) && TEXTOS_ASSINATURA.every((c) => textoOuNada(a[c]))
  && Array.isArray(a.fotos) && a.fotos.every((f) => objeto(f) && idRegistro(f.id) && texto(f.hash))
  && PESSOAS.every((p) => a[p] == null || (objeto(a[p]) && textoOuNada(a[p].nome) && textoOuNada(a[p].documento)
    && textoOuNada(a[p].assinatura)));

/** O imovel.json tem a forma que o app grava? (tipos, ids, ligações entre registros e situação conhecida) */
function formaValida({ imovel, ambientes, fotos, assinaturas }) {
  const listas = [ambientes, fotos, assinaturas];
  if (!imovelValido(imovel) || !listas.every(Array.isArray)) return false;
  if (!listas.flat().every((r) => objeto(r) && r.imovelId === imovel.id && idRegistro(r.id))) return false;
  if (!ambientes.every(ambienteValido) || !fotos.every(fotoValida) || !assinaturas.every(assinaturaValida)) return false;
  const idsAmbientes = new Set(ambientes.map((a) => a.id));
  if (!fotos.every((f) => idsAmbientes.has(f.ambienteId))) return false;
  return !imovel.fachada?.fotoId || fotos.some((f) => f.id === imovel.fachada.fotoId);
}

/** Hora do arquivo no formato que o app grava (toISOString); senão, agora. */
function horaValida(valor) {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  return texto(valor) && iso.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : new Date().toISOString();
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
    fotosProntas.push({ ...f, blob });
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

  // A miniatura do arquivo não tem código de verificação: é refeita a partir da foto conferida
  // (a da fachada vem daí). Fica aqui, antes da gravação: a transação do banco não pode esperar isso.
  for (const [i, f] of fotosProntas.entries()) {
    try {
      f.miniatura = await miniaturaDaFoto(f.blob);
    } catch {
      throw falha(`não foi possível ler a foto ${i + 1}.`);
    }
  }

  return {
    id,
    atualizadoEm: imovel.atualizadoEm,
    dados: { geradoEm: horaValida(json.geradoEm), imovel, ambientes, fotos: fotosProntas, assinaturas: assinaturasProntas },
  };
}

/** Grava o imóvel lido por lerBackup (substitui o que houver) e conta como backup feito. */
export async function restaurarBackup({ id, dados }) {
  await restaurarImovel(dados);
  await registrarBackup([id], horaValida(dados.geradoEm));
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
