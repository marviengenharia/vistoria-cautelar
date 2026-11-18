// Banco de dados do app (IndexedDB, fica só no aparelho).
import { openDB } from '../vendor/idb/index.js';
import { imovelVazio, NOME_AMBIENTE_FACHADA } from './dominio.js';

const NOME_BANCO = 'vistoria-cautelar';
const VERSAO_BANCO = 2;

// Ao criar novas tabelas, aumentar VERSAO_BANCO e acrescentar um bloco
// "if (versaoAntiga < N)" — nunca alterar os blocos anteriores (o celular já tem dados).
const bancoPronto = openDB(NOME_BANCO, VERSAO_BANCO, {
  upgrade(db, versaoAntiga) {
    if (versaoAntiga < 1) {
      const imoveis = db.createObjectStore('imoveis', { keyPath: 'id' });
      imoveis.createIndex('status', 'status');
      db.createObjectStore('config'); // chave/valor: contador de imóveis, data do último backup...
    }
    if (versaoAntiga < 2) {
      const ambientes = db.createObjectStore('ambientes', { keyPath: 'id' });
      ambientes.createIndex('imovelId', 'imovelId');
      const fotos = db.createObjectStore('fotos', { keyPath: 'id' });
      fotos.createIndex('imovelId', 'imovelId');
      fotos.createIndex('ambienteId', 'ambienteId');
    }
  },
  blocked() {
    alert('Feche as outras abas deste app e abra de novo para concluir a atualização.');
  },
});

const novoId = (prefixo) => `${prefixo}-${crypto.randomUUID()}`;
const agora = () => new Date().toISOString();

/** IM-001, IM-002, ... */
export function formatarId(numero) {
  return `IM-${String(numero).padStart(3, '0')}`;
}

// ===================== imóveis =====================

export async function listarImoveis() {
  const db = await bancoPronto;
  return db.getAll('imoveis');
}

export async function obterImovel(id) {
  const db = await bancoPronto;
  return db.get('imoveis', id);
}

/** Cria um imóvel com o próximo número livre. O número nunca é reaproveitado. */
export async function criarImovel() {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'config'], 'readwrite');
  const config = tx.objectStore('config');
  const imoveis = tx.objectStore('imoveis');
  let numero = (await config.get('proximoNumero')) ?? 1;
  // segurança: se já existir (ex.: importado), pula para o próximo livre
  while (await imoveis.get(formatarId(numero))) numero += 1;
  const imovel = imovelVazio(formatarId(numero));
  await imoveis.add(imovel);
  await config.put(numero + 1, 'proximoNumero');
  await tx.done;
  return imovel;
}

/** Grava só os campos alterados de um imóvel. Devolve o imóvel atualizado. */
export async function atualizarImovel(id, alteracoes) {
  const db = await bancoPronto;
  const tx = db.transaction('imoveis', 'readwrite');
  const atual = await tx.store.get(id);
  if (!atual) throw new Error(`Imóvel ${id} não encontrado.`);
  const novo = { ...atual, ...alteracoes, id, atualizadoEm: agora() };
  await tx.store.put(novo);
  await tx.done;
  return novo;
}

/** Apaga o imóvel com todos os ambientes e fotos dele. */
export async function excluirImovel(id) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos'], 'readwrite');
  for (const nome of ['fotos', 'ambientes']) {
    const indice = tx.objectStore(nome).index('imovelId');
    for (let c = await indice.openCursor(id); c; c = await c.continue()) await c.delete();
  }
  await tx.objectStore('imoveis').delete(id);
  await tx.done;
}

// ===================== ambientes =====================

export async function listarAmbientes(imovelId) {
  const db = await bancoPronto;
  const lista = await db.getAllFromIndex('ambientes', 'imovelId', imovelId);
  return lista.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export async function criarAmbiente(imovelId, nome) {
  const db = await bancoPronto;
  const ambiente = { id: novoId('AMB'), imovelId, nome, criadoEm: agora() };
  await db.add('ambientes', ambiente);
  return ambiente;
}

/** Apaga o ambiente e as fotos dele (se a fachada estiver entre elas, o imóvel fica sem fachada). */
export async function excluirAmbiente(ambienteId) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos'], 'readwrite');
  const ambiente = await tx.objectStore('ambientes').get(ambienteId);
  if (!ambiente) return;
  const imoveis = tx.objectStore('imoveis');
  const imovel = await imoveis.get(ambiente.imovelId);
  const indice = tx.objectStore('fotos').index('ambienteId');
  for (let c = await indice.openCursor(ambienteId); c; c = await c.continue()) {
    if (imovel?.fachada?.fotoId === c.value.id) {
      imovel.fachada = null;
      imovel.atualizadoEm = agora();
      await imoveis.put(imovel);
    }
    await c.delete();
  }
  await tx.objectStore('ambientes').delete(ambienteId);
  await tx.done;
}

// ===================== fotos =====================

function registroFoto(imovelId, ambienteId, { foto, miniatura, hash }) {
  return {
    id: novoId('FOTO'),
    imovelId,
    ambienteId,
    blob: foto,
    miniatura,
    hash,             // SHA-256 da foto gravada (prova de que não foi alterada)
    tiradaEm: agora(),
    patologias: [],   // valores de PATOLOGIAS, ou [SEM_PATOLOGIA]
    local: '',        // valor de LOCAIS_FOTO
    abertura: null,   // mm, quando medida com fissurômetro
    descricao: '',
  };
}

export async function adicionarFoto(imovelId, ambienteId, processada) {
  const db = await bancoPronto;
  const registro = registroFoto(imovelId, ambienteId, processada);
  await db.add('fotos', registro);
  return registro;
}

export async function listarFotos(ambienteId) {
  const db = await bancoPronto;
  const lista = await db.getAllFromIndex('fotos', 'ambienteId', ambienteId);
  return lista.sort((a, b) => a.tiradaEm.localeCompare(b.tiradaEm));
}

export async function obterFoto(id) {
  const db = await bancoPronto;
  return db.get('fotos', id);
}

/** Grava a classificação da foto (patologias, local, abertura, descrição). A imagem nunca muda. */
export async function atualizarFoto(id, alteracoes) {
  const db = await bancoPronto;
  const tx = db.transaction('fotos', 'readwrite');
  const atual = await tx.store.get(id);
  if (!atual) throw new Error('Foto não encontrada.');
  const { blob, miniatura, hash, ...permitidas } = alteracoes; // a imagem não pode ser trocada
  const nova = { ...atual, ...permitidas, id };
  await tx.store.put(nova);
  await tx.done;
  return nova;
}

export async function excluirFoto(id) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'fotos'], 'readwrite');
  const foto = await tx.objectStore('fotos').get(id);
  if (foto) {
    const imoveis = tx.objectStore('imoveis');
    const imovel = await imoveis.get(foto.imovelId);
    if (imovel?.fachada?.fotoId === id) {
      imovel.fachada = null;
      imovel.atualizadoEm = agora();
      await imoveis.put(imovel);
    }
    await tx.objectStore('fotos').delete(id);
  }
  await tx.done;
}

/**
 * Grava a foto da fachada: ela vai para o ambiente "Fachada" (criado se não existir),
 * a fachada anterior é apagada e o imóvel guarda a miniatura para a lista.
 * Devolve o imóvel atualizado.
 */
export async function definirFachada(imovelId, processada) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos'], 'readwrite');
  const imoveis = tx.objectStore('imoveis');
  const fotos = tx.objectStore('fotos');
  const ambientes = tx.objectStore('ambientes');

  const imovel = await imoveis.get(imovelId);
  if (!imovel) throw new Error(`Imóvel ${imovelId} não encontrado.`);

  const doImovel = await ambientes.index('imovelId').getAll(imovelId);
  let ambiente = doImovel.find((a) => a.fachada) ?? doImovel.find((a) => a.nome === NOME_AMBIENTE_FACHADA);
  if (!ambiente) {
    ambiente = { id: novoId('AMB'), imovelId, nome: NOME_AMBIENTE_FACHADA, fachada: true, criadoEm: agora() };
    await ambientes.add(ambiente);
  }

  if (imovel.fachada?.fotoId) await fotos.delete(imovel.fachada.fotoId);
  const registro = registroFoto(imovelId, ambiente.id, processada);
  registro.local = 'fachada';
  await fotos.add(registro);

  const novo = {
    ...imovel,
    fachada: { fotoId: registro.id, miniatura: processada.miniatura, tiradaEm: registro.tiradaEm },
    atualizadoEm: agora(),
  };
  await imoveis.put(novo);
  await tx.done;
  return novo;
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function pedirArmazenamentoPersistente() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
