// Backup de um imóvel: um arquivo .zip com os dados (imovel.json), as fotos e as assinaturas.
// As imagens vão para o zip byte a byte, sem alteração (o hash e o código continuam valendo).
import { obterImovelCompleto, listarImoveis, obterConfig, gravarConfig } from './db.js';
import { criarZip } from './zip.js';

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

/** Imóveis com alguma mudança depois do último backup dele (ou nunca copiados). */
export async function imoveisSemBackup() {
  const backups = (await obterConfig('backups')) ?? {};
  return (await listarImoveis())
    .map((im) => ({ id: im.id, desde: im.atualizadoEm ?? im.criadoEm ?? null }))
    .filter((p) => !backups[p.id] || (p.desde && p.desde > backups[p.id]));
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
