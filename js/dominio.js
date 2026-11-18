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
    criadoEm: agora,
    atualizadoEm: agora,
  };
}
