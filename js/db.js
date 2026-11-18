// Banco de dados do app (IndexedDB, fica só no aparelho).
import { openDB } from '../vendor/idb/index.js';
import { imovelVazio } from './dominio.js';

const NOME_BANCO = 'vistoria-cautelar';
const VERSAO_BANCO = 1;

// Ao criar novas tabelas (ambientes, anomalias, fotos...), aumentar VERSAO_BANCO e
// acrescentar um bloco "if (versaoAntiga < N)" — nunca alterar os blocos anteriores.
const bancoPronto = openDB(NOME_BANCO, VERSAO_BANCO, {
  upgrade(db, versaoAntiga) {
    if (versaoAntiga < 1) {
      const imoveis = db.createObjectStore('imoveis', { keyPath: 'id' });
      imoveis.createIndex('status', 'status');
      db.createObjectStore('config'); // chave/valor: contador de imóveis, data do último backup...
    }
  },
  blocked() {
    alert('Feche as outras abas deste app e abra de novo para concluir a atualização.');
  },
});

/** IM-001, IM-002, ... */
export function formatarId(numero) {
  return `IM-${String(numero).padStart(3, '0')}`;
}

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
  const novo = { ...atual, ...alteracoes, id, atualizadoEm: new Date().toISOString() };
  await tx.store.put(novo);
  await tx.done;
  return novo;
}

export async function excluirImovel(id) {
  const db = await bancoPronto;
  await db.delete('imoveis', id);
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function pedirArmazenamentoPersistente() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
