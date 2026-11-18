// Listas de opções usadas nos formulários (valor gravado no banco + texto mostrado).

export const STATUS = [
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'vistoriado', rotulo: 'Vistoriado' },
  { valor: 'recusado', rotulo: 'Recusado' },
  { valor: 'ausente', rotulo: 'Ausente' },
  { valor: 'revisitar', rotulo: 'Revisitar' },
];

export const LADOS = [
  { valor: 'LE', rotulo: 'LE (esquerdo)' },
  { valor: 'LD', rotulo: 'LD (direito)' },
];

export const CONDICOES_OCUPANTE = [
  { valor: 'proprietario', rotulo: 'Proprietário' },
  { valor: 'inquilino', rotulo: 'Inquilino' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const USOS = [
  { valor: 'residencial', rotulo: 'Residencial' },
  { valor: 'comercial', rotulo: 'Comercial' },
  { valor: 'misto', rotulo: 'Misto' },
  { valor: 'institucional', rotulo: 'Institucional' },
  { valor: 'terreno-vazio', rotulo: 'Terreno vazio' },
];

export const ESTRUTURAS = [
  { valor: 'alvenaria-estrutural', rotulo: 'Alvenaria estrutural' },
  { valor: 'concreto-armado', rotulo: 'Concreto armado' },
  { valor: 'madeira', rotulo: 'Madeira' },
  { valor: 'palafita', rotulo: 'Palafita' },
  { valor: 'mista', rotulo: 'Mista' },
];

export const COBERTURAS = [
  { valor: 'telha-ceramica', rotulo: 'Telha cerâmica' },
  { valor: 'fibrocimento', rotulo: 'Fibrocimento' },
  { valor: 'metalica', rotulo: 'Telha metálica' },
  { valor: 'laje', rotulo: 'Laje' },
  { valor: 'outra', rotulo: 'Outra' },
];

export const FUNDACOES = [
  { valor: 'nao-visivel', rotulo: 'Não visível' },
  { valor: 'baldrame', rotulo: 'Baldrame / alvenaria' },
  { valor: 'estacas-madeira', rotulo: 'Estacas de madeira' },
  { valor: 'concreto', rotulo: 'Concreto' },
  { valor: 'outra', rotulo: 'Outra' },
];

export const IDADES = [
  { valor: 'ate-5', rotulo: 'Até 5 anos' },
  { valor: '5-15', rotulo: '5 a 15 anos' },
  { valor: '15-30', rotulo: '15 a 30 anos' },
  { valor: 'mais-30', rotulo: 'Mais de 30 anos' },
];

export const CONSERVACOES = [
  { valor: 'bom', rotulo: 'Bom' },
  { valor: 'regular', rotulo: 'Regular' },
  { valor: 'precario', rotulo: 'Precário' },
  { valor: 'ruim', rotulo: 'Ruim' },
];

/** Patologias que o vistoriador marca em cada foto (várias por foto). */
export const PATOLOGIAS = [
  { valor: 'fissura', rotulo: 'Fissura', grupo: 'Fissuras e trincas' },
  { valor: 'trinca', rotulo: 'Trinca', grupo: 'Fissuras e trincas' },
  { valor: 'rachadura', rotulo: 'Rachadura', grupo: 'Fissuras e trincas' },
  { valor: 'recalque', rotulo: 'Recalque diferencial', grupo: 'Recalque e prumo' },
  { valor: 'piso-afundado', rotulo: 'Piso afundado', grupo: 'Recalque e prumo' },
  { valor: 'desaprumo', rotulo: 'Desaprumo / inclinação', grupo: 'Recalque e prumo' },
  { valor: 'desplacamento', rotulo: 'Desplacamento de revestimento', grupo: 'Revestimento' },
  { valor: 'corrosao', rotulo: 'Corrosão de armadura', grupo: 'Concreto e aço' },
  { valor: 'concreto-desagregado', rotulo: 'Concreto desagregado / ferro exposto', grupo: 'Concreto e aço' },
  { valor: 'umidade', rotulo: 'Umidade / infiltração', grupo: 'Água' },
  { valor: 'mofo', rotulo: 'Mofo', grupo: 'Água' },
  { valor: 'eflorescencia', rotulo: 'Eflorescência (mancha branca)', grupo: 'Água' },
  { valor: 'esquadria', rotulo: 'Porta ou janela travada', grupo: 'Esquadrias' },
  { valor: 'telhado', rotulo: 'Telha quebrada / deslocada', grupo: 'Telhado e forro' },
  { valor: 'forro', rotulo: 'Forro danificado', grupo: 'Telhado e forro' },
  { valor: 'madeira', rotulo: 'Madeira podre / cupim', grupo: 'Madeira' },
  { valor: 'outra', rotulo: 'Outra (descrever)', grupo: 'Outra' },
];
/** Marca especial: foto que mostra o local em bom estado. Não combina com as patologias. */
export const SEM_PATOLOGIA = 'sem-patologia';

/** Patologias em que faz sentido medir a abertura com fissurômetro. */
export const PATOLOGIAS_COM_ABERTURA = ['fissura', 'trinca', 'rachadura'];

export const LOCAIS_FOTO = [
  { valor: 'parede', rotulo: 'Parede' },
  { valor: 'teto', rotulo: 'Teto' },
  { valor: 'piso', rotulo: 'Piso' },
  { valor: 'viga', rotulo: 'Viga' },
  { valor: 'pilar', rotulo: 'Pilar' },
  { valor: 'muro', rotulo: 'Muro' },
  { valor: 'calcada', rotulo: 'Calçada' },
  { valor: 'fachada', rotulo: 'Fachada' },
  { valor: 'cobertura', rotulo: 'Telhado' },
];

/** Nomes sugeridos ao criar um ambiente. */
export const AMBIENTES_SUGERIDOS = [
  'Fachada', 'Sala', 'Quarto', 'Cozinha', 'Banheiro', 'Área de serviço',
  'Muro', 'Calçada', 'Área externa',
];
export const NOME_AMBIENTE_FACHADA = 'Fachada';

/** Distância (em estacas) do filtro "Perto da estaca": 5 estacas = 100 m para cada lado. */
export const RAIO_ESTACAS = 5;

/**
 * Converte o texto da estaca em número: "42+10" -> 42,5 (estaca de 20 m); "E42" -> 42.
 * Devolve null se não houver número.
 */
export function estacaNumero(texto) {
  const m = String(texto ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 20 : 0);
}

/** Texto mostrado para um valor de uma lista (ou '' se vazio). */
export function rotuloDe(lista, valor) {
  return lista.find((o) => o.valor === valor)?.rotulo ?? '';
}

/** Imóvel novo, com todos os campos da aba Dados. */
export function imovelVazio(id) {
  const agora = new Date().toISOString();
  return {
    id,
    status: 'pendente',
    // localização
    endereco: '',
    referencia: '',
    gps: null, // { lat, lon, precisao (m), capturadoEm }
    estaca: '',
    lado: '',
    distanciaObra: null, // m (na etapa do mapa passa a ser calculada pelo GPS)
    // ocupante (LGPD: só o mínimo)
    ocupanteNome: '',
    ocupanteTelefone: '',
    ocupanteCondicao: '',
    // características
    uso: '',
    pavimentos: null,
    estrutura: '',
    cobertura: '',
    fundacao: '',
    idadeAparente: '',
    conservacao: '',
    observacoes: '',
    // recusa
    recusaMotivo: '',
    recusaTestemunha: '',
    // foto da fachada: { fotoId, miniatura (Blob), tiradaEm } — a foto fica no depósito "fotos"
    fachada: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export const FOTO_ASSINADA = 'Esta foto consta numa assinatura e não pode ser apagada nem trocada.';

export const FOTOS_MUDARAM = 'As fotos mudaram enquanto a tela estava aberta. Confira as fotos e colha a assinatura de novo.';

const dataBr = (d) => [
  String(d.getDate()).padStart(2, '0'),
  String(d.getMonth() + 1).padStart(2, '0'),
  d.getFullYear(),
].join('/');

/** Texto do termo de ciência (rascunho, a revisar pela Raquel/jurídico). */
export function textoTermoCiencia({ id, data, totalFotos }) {
  const fotos = totalFotos === 1 ? 'a 1 foto registrada mostra' : `as ${totalFotos} fotos registradas mostram`;
  return `Declaro que acompanhei a vistoria cautelar do meu imóvel (${id}) em ${dataBr(data)} e que ${fotos} o estado do imóvel nesta data.`;
}

/** Texto do termo de recusa (rascunho, a revisar pela Raquel/jurídico). */
export function textoTermoRecusa({ id, data, motivo }) {
  return `Declaro que presenciei, em ${dataBr(data)}, a recusa do ocupante do imóvel ${id} em permitir a vistoria cautelar. Motivo informado: ${motivo}.`;
}
