// Banco de dados do app (IndexedDB, fica só no aparelho).
import { openDB } from '../vendor/idb/index.js';
import { imovelVazio, NOME_AMBIENTE_FACHADA, FOTO_ASSINADA, FOTOS_MUDARAM } from './dominio.js';
import { impressaoDigital } from './foto.js';

const NOME_BANCO = 'vistoria-cautelar';
const VERSAO_BANCO = 3;

// Ao criar novas tabelas, aumentar VERSAO_BANCO e acrescentar um bloco
// "if (versaoAntiga < N)" — nunca alterar os blocos anteriores (o celular já tem dados).
const bancoPronto = openDB(NOME_BANCO, VERSAO_BANCO, {
  async upgrade(db, versaoAntiga, novaVersao, transaction) {
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
    if (versaoAntiga < 3) {
      const assinaturas = db.createObjectStore('assinaturas', { keyPath: 'id' });
      assinaturas.createIndex('imovelId', 'imovelId');
      // fotos antigas: a hora de entrada no app é desconhecida, vale a hora da foto
      const fotos = transaction.objectStore('fotos');
      for (let c = await fotos.openCursor(); c; c = await c.continue()) {
        if (!c.value.entrouEm) {
          await c.update({ ...c.value, entrouEm: c.value.tiradaEm, origemHora: 'app' });
        }
      }
    }
  },
  blocked() {
    alert('Feche as outras abas deste app e abra de novo para concluir a atualização.');
  },
});

const novoId = (prefixo) => `${prefixo}-${crypto.randomUUID()}`;
const agora = () => new Date().toISOString();

/**
 * Marca a hora da mudança no imóvel, dentro da transação de quem mudou algo dele
 * (ambiente, foto, assinatura). É o que diz se o imóvel está "sem backup".
 */
async function marcarMudanca(tx, imovelId) {
  const imoveis = tx.objectStore('imoveis');
  const imovel = await imoveis.get(imovelId);
  if (imovel) await imoveis.put({ ...imovel, atualizadoEm: agora() });
}

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

/** O imóvel com ambientes, fotos e assinaturas, lidos de uma vez (retrato consistente para o backup). */
export async function obterImovelCompleto(id) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos', 'assinaturas']);
  const doImovel = (nome) => tx.objectStore(nome).index('imovelId').getAll(id);
  const [imovel, ambientes, fotos, assinaturas] = await Promise.all([
    tx.objectStore('imoveis').get(id), doImovel('ambientes'), doImovel('fotos'), doImovel('assinaturas'),
  ]);
  await tx.done;
  if (!imovel) throw new Error(`Imóvel ${id} não encontrado.`);
  return { imovel, ambientes, fotos, assinaturas };
}

/** Apaga o imóvel com todos os ambientes e fotos dele. */
export async function excluirImovel(id) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos', 'assinaturas'], 'readwrite');
  for (const nome of ['fotos', 'ambientes', 'assinaturas']) {
    const indice = tx.objectStore(nome).index('imovelId');
    for (let c = await indice.openCursor(id); c; c = await c.continue()) await c.delete();
  }
  await tx.objectStore('imoveis').delete(id);
  await tx.done;
}

/**
 * Restaura um imóvel vindo de backup, já conferido (fotos e assinaturas com as imagens em Blob).
 * Numa transação só: apaga o que houver dele neste aparelho e grava tudo exatamente como veio
 * (ids, hashes, códigos e horas, inclusive `atualizadoEm`). Não passa pelas travas de foto
 * assinada: é a mesma prova voltando. A numeração de imóveis novos continua depois dele.
 */
export async function restaurarImovel({ imovel, ambientes, fotos, assinaturas }) {
  const db = await bancoPronto;
  const id = imovel.id;
  const fotoFachada = imovel.fachada && fotos.find((f) => f.id === imovel.fachada.fotoId);
  const novo = {
    ...imovel,
    fachada: imovel.fachada ? { ...imovel.fachada, miniatura: fotoFachada?.miniatura ?? null } : null,
  };
  const numero = Number(/^IM-(\d+)$/.exec(id)?.[1]);

  const tx = db.transaction(['imoveis', 'ambientes', 'fotos', 'assinaturas', 'config'], 'readwrite');
  for (const nome of ['fotos', 'ambientes', 'assinaturas']) {
    const indice = tx.objectStore(nome).index('imovelId');
    for (let c = await indice.openCursor(id); c; c = await c.continue()) await c.delete();
  }
  await tx.objectStore('imoveis').put(novo);
  for (const a of ambientes) await tx.objectStore('ambientes').put(a);
  for (const f of fotos) await tx.objectStore('fotos').put(f);
  for (const a of assinaturas) await tx.objectStore('assinaturas').put(a);
  if (numero) {
    const config = tx.objectStore('config');
    const proximo = (await config.get('proximoNumero')) ?? 1;
    if (proximo <= numero) await config.put(numero + 1, 'proximoNumero');
  }
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
  const tx = db.transaction(['ambientes', 'imoveis'], 'readwrite');
  await tx.objectStore('ambientes').add(ambiente);
  await marcarMudanca(tx, imovelId);
  await tx.done;
  return ambiente;
}

/** Apaga o ambiente e as fotos dele (se a fachada estiver entre elas, o imóvel fica sem fachada). */
export async function excluirAmbiente(ambienteId) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos', 'assinaturas'], 'readwrite');
  const ambiente = await tx.objectStore('ambientes').get(ambienteId);
  if (!ambiente) return;
  const assinadas = await idsAssinadasNaTransacao(tx, ambiente.imovelId);
  const doAmbiente = await tx.objectStore('fotos').index('ambienteId').getAll(ambienteId);
  if (doAmbiente.some((f) => assinadas.has(f.id))) throw new Error(FOTO_ASSINADA);
  const imoveis = tx.objectStore('imoveis');
  const imovel = await imoveis.get(ambiente.imovelId);
  const indice = tx.objectStore('fotos').index('ambienteId');
  for (let c = await indice.openCursor(ambienteId); c; c = await c.continue()) {
    if (imovel?.fachada?.fotoId === c.value.id) imovel.fachada = null;
    await c.delete();
  }
  await tx.objectStore('ambientes').delete(ambienteId);
  if (imovel) await imoveis.put({ ...imovel, atualizadoEm: agora() });
  await tx.done;
}

// ===================== fotos =====================

/** Ids das fotos que constam em alguma assinatura do imóvel (dentro de uma transação). */
async function idsAssinadasNaTransacao(tx, imovelId) {
  const lista = await tx.objectStore('assinaturas').index('imovelId').getAll(imovelId);
  return new Set(lista.flatMap((a) => a.fotos.map((f) => f.id)));
}

function registroFoto(imovelId, ambienteId, { foto, miniatura, hash, tiradaEm, origemHora }) {
  const entrouEm = agora();
  return {
    id: novoId('FOTO'),
    imovelId,
    ambienteId,
    blob: foto,
    miniatura,
    hash,             // SHA-256 da foto gravada (prova de que não foi alterada)
    tiradaEm: tiradaEm ?? entrouEm, // hora em que a foto foi feita
    entrouEm,                       // hora em que entrou no app
    origemHora: origemHora ?? 'app', // 'exif' | 'arquivo' | 'app'
    patologias: [],   // valores de PATOLOGIAS, ou [SEM_PATOLOGIA]
    local: '',        // valor de LOCAIS_FOTO
    abertura: null,   // mm, quando medida com fissurômetro
    descricao: '',
  };
}

export async function adicionarFoto(imovelId, ambienteId, processada) {
  const db = await bancoPronto;
  const registro = registroFoto(imovelId, ambienteId, processada);
  const tx = db.transaction(['fotos', 'imoveis'], 'readwrite');
  await tx.objectStore('fotos').add(registro);
  await marcarMudanca(tx, imovelId);
  await tx.done;
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

const CAMPOS_CLASSIFICACAO = ['patologias', 'local', 'abertura', 'descricao'];

/** Grava a classificação da foto (patologias, local, abertura, descrição). A imagem nunca muda. */
export async function atualizarFoto(id, alteracoes) {
  const db = await bancoPronto;
  const tx = db.transaction(['fotos', 'imoveis'], 'readwrite');
  const fotos = tx.objectStore('fotos');
  const atual = await fotos.get(id);
  if (!atual) throw new Error('Foto não encontrada.');
  // lista branca: só a classificação muda; imagem, horas, imóvel e ambiente ficam como estão
  const nova = { ...atual };
  for (const campo of CAMPOS_CLASSIFICACAO) {
    if (campo in alteracoes) nova[campo] = alteracoes[campo];
  }
  await fotos.put(nova);
  await marcarMudanca(tx, atual.imovelId);
  await tx.done;
  return nova;
}

export async function excluirFoto(id) {
  const db = await bancoPronto;
  const tx = db.transaction(['imoveis', 'fotos', 'assinaturas'], 'readwrite');
  const foto = await tx.objectStore('fotos').get(id);
  if (foto) {
    if ((await idsAssinadasNaTransacao(tx, foto.imovelId)).has(id)) throw new Error(FOTO_ASSINADA);
    const imoveis = tx.objectStore('imoveis');
    const imovel = await imoveis.get(foto.imovelId);
    if (imovel) {
      const fachada = imovel.fachada?.fotoId === id ? null : imovel.fachada;
      await imoveis.put({ ...imovel, fachada, atualizadoEm: agora() });
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
  const tx = db.transaction(['imoveis', 'ambientes', 'fotos', 'assinaturas'], 'readwrite');
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

  if (imovel.fachada?.fotoId && (await idsAssinadasNaTransacao(tx, imovelId)).has(imovel.fachada.fotoId)) {
    throw new Error(FOTO_ASSINADA);
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

export async function listarFotosDoImovel(imovelId) {
  const db = await bancoPronto;
  const lista = await db.getAllFromIndex('fotos', 'imovelId', imovelId);
  return lista.sort((a, b) => a.tiradaEm.localeCompare(b.tiradaEm));
}

// ===================== configuração =====================

export async function obterConfig(chave) {
  const db = await bancoPronto;
  return db.get('config', chave);
}

export async function gravarConfig(chave, valor) {
  const db = await bancoPronto;
  await db.put('config', valor, chave);
}

// "Meus dados" do vistoriador deste celular: { nome, crea, art } — sai como responsável técnico no
// laudo. Antes da etapa 5 só havia o nome, em 'vistoriadorNome' (continua sendo gravado junto).
const meusDadosDe = (meus, nomeAntigo) => ({
  nome: meus?.nome ?? nomeAntigo ?? '', crea: meus?.crea ?? '', art: meus?.art ?? '',
});

export async function obterMeusDados() {
  const db = await bancoPronto;
  return meusDadosDe(await db.get('config', 'meusDados'), await db.get('config', 'vistoriadorNome'));
}

/** Grava só os campos informados (ex.: `{ nome }`) e devolve os dados completos. */
export async function gravarMeusDados(campos) {
  const db = await bancoPronto;
  const tx = db.transaction('config', 'readwrite');
  const atual = meusDadosDe(await tx.store.get('meusDados'), await tx.store.get('vistoriadorNome'));
  const novo = { ...atual, ...campos };
  await tx.store.put(novo, 'meusDados');
  if ('nome' in campos) await tx.store.put(novo.nome, 'vistoriadorNome');
  await tx.done;
  return novo;
}

// ===================== assinaturas =====================

const mesmoConjunto = (a, b) => {
  const conjunto = new Set(a);
  return conjunto.size === new Set(b).size && b.every((id) => conjunto.has(id));
};

/**
 * Código de verificação (SHA-256) de uma assinatura. Monta o conteúdo em ordem fixa, para que
 * qualquer pessoa possa recalcular o código a partir do registro gravado e conferir que nada mudou.
 * Cada imagem de assinatura entra pelo próprio SHA-256.
 */
export async function codigoDaAssinatura(registro) {
  const pessoa = async (p) => (p
    ? { nome: p.nome ?? null, documento: p.documento ?? null, assinatura: await impressaoDigital(p.assinatura) }
    : null);
  const conteudo = {
    tipo: registro.tipo ?? null,
    imovelId: registro.imovelId ?? null,
    assinadoEm: registro.assinadoEm ?? null,
    inicio: registro.inicio ?? null,
    texto: registro.texto ?? null,
    motivoRecusa: registro.motivoRecusa ?? null,
    fotos: registro.fotos.map((f) => ({ id: f.id, hash: f.hash ?? null })),
    ocupante: await pessoa(registro.ocupante),
    testemunha: await pessoa(registro.testemunha),
    vistoriador: await pessoa(registro.vistoriador),
  };
  return impressaoDigital(new Blob([JSON.stringify(conteudo)]));
}

/**
 * Grava uma assinatura (ciência ou recusa) com a lista das fotos do imóvel nesse momento.
 * `dados.idsFotosConferidas` são as fotos que estavam na tela: se o banco tiver outras,
 * nada é gravado (o morador não pode assinar por uma foto que não viu).
 */
export async function gravarAssinatura(imovelId, dados) {
  const db = await bancoPronto;
  const conferidas = dados.idsFotosConferidas ?? [];
  const fotos = (await listarFotosDoImovel(imovelId)).map((f) => ({ id: f.id, hash: f.hash }));
  if (!mesmoConjunto(fotos.map((f) => f.id), conferidas)) throw new Error(FOTOS_MUDARAM);

  const pessoa = (p) => (p ? { nome: p.nome, documento: p.documento ?? null, assinatura: p.assinatura } : null);
  const assinatura = {
    id: novoId('ASS'),
    imovelId,
    tipo: dados.tipo,
    assinadoEm: agora(),
    inicio: dados.inicio ?? null,
    texto: dados.texto,
    motivoRecusa: dados.motivoRecusa ?? null,
    fotos,
    ocupante: pessoa(dados.ocupante),
    testemunha: pessoa(dados.testemunha),
    vistoriador: pessoa(dados.vistoriador),
  };
  // os hashes são calculados antes de abrir a transação (crypto.subtle a fecharia)
  assinatura.codigo = await codigoDaAssinatura(assinatura);

  const tx = db.transaction(['assinaturas', 'imoveis', 'fotos'], 'readwrite');
  // confere de novo dentro da transação: nenhuma foto pode ter entrado ou saído no meio
  const agoraNoBanco = await tx.objectStore('fotos').index('imovelId').getAllKeys(imovelId);
  if (!mesmoConjunto(agoraNoBanco, conferidas)) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(FOTOS_MUDARAM);
  }
  await tx.objectStore('assinaturas').add(assinatura);
  const imovel = await tx.objectStore('imoveis').get(imovelId);
  if (imovel) {
    const vistoriado = dados.tipo === 'ciencia' && ['pendente', 'ausente', 'revisitar'].includes(imovel.status);
    await tx.objectStore('imoveis').put({ ...imovel, ...(vistoriado && { status: 'vistoriado' }), atualizadoEm: agora() });
  }
  await tx.done;
  return assinatura;
}

/** Assinaturas do imóvel, a mais nova primeiro. */
export async function listarAssinaturas(imovelId) {
  const db = await bancoPronto;
  const lista = await db.getAllFromIndex('assinaturas', 'imovelId', imovelId);
  return lista.sort((a, b) => b.assinadoEm.localeCompare(a.assinadoEm));
}

/** Ids das fotos que já constam em alguma assinatura do imóvel. */
export async function idsFotosAssinadas(imovelId) {
  const lista = await listarAssinaturas(imovelId);
  return new Set(lista.flatMap((a) => a.fotos.map((f) => f.id)));
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function pedirArmazenamentoPersistente() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
