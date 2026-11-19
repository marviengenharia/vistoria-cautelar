// Dados fixos desta obra, usados no laudo (o app serve só a esta obra; sem tela de configuração).

export const OBRA = {
  nome: 'Macrodrenagem e Duplicação da Avenida Bernardo Sayão – Fase III e execução do sistema de '
    + 'comportas da Sub-bacia 2 — Belém/PA',
  contratante: 'Município de Belém — PROMABEN (CE nº 07/2026)',
  consorcio: {
    nome: 'Consórcio Bernardo Sayão',
    cnpj: '70.098.809/0001-83',
    endereco: 'Av. Júlio César, 65 — Souza — Belém/PA — CEP 66.613-010',
    telefone: '(91) 3131-9800',
  },
};

export const LOGO_URL = 'img/logo-cbs.png';

// Textos padrão do laudo — RASCUNHO, a revisar pela Raquel/jurídico (no PDF saem sem marcação).
// Trechos entre **asteriscos** saem em negrito.
export const TEXTOS = {
  objetivo: 'Registrar o estado de conservação do imóvel **antes do início** das obras de macrodrenagem '
    + 'e duplicação da Av. Bernardo Sayão – Fase III, para servir de referência em eventuais reclamações '
    + 'de danos atribuídos à obra (vibração, escavação, rebaixamento do lençol).',

  /** @param {'ciencia'|'recusa'|null} tipo tipo do termo assinado (null = ainda não assinado) */
  metodo(tipo) {
    const base = 'Vistoria visual, sem ensaios destrutivos, seguindo a lógica da ABNT NBR 13752. Cada '
      + 'ambiente foi fotografado; cada foto recebeu, no momento em que entrou no aplicativo, um carimbo '
      + 'com o número do imóvel, a data e hora e as coordenadas GPS, e um código de verificação (SHA-256) '
      + 'que permite provar que a imagem não foi alterada depois.';
    if (tipo === 'ciencia') return `${base} O ocupante acompanhou a vistoria e conferiu as fotos antes de assinar o termo (item 8).`;
    if (tipo === 'recusa') return `${base} O ocupante recusou a vistoria; a recusa foi registrada no termo do item 8, com testemunha.`;
    return `${base} O termo do item 8 ainda não foi assinado.`;
  },

  /** @param {{ conservacao: string, comPatologias: boolean, tipo: 'ciencia'|'recusa'|null }} p */
  conclusao({ conservacao, comPatologias, tipo }) {
    if (tipo === 'recusa') {
      return 'O ocupante recusou a vistoria. Este laudo registra apenas o que pôde ser observado e '
        + 'fotografado, **antes do início das obras**, e não avalia causas.';
    }
    const estado = conservacao
      ? `apresentava estado de conservação **${conservacao.toLowerCase()}**`
      : 'foi registrado conforme as fotos';
    const patologias = comPatologias
      ? ', com as patologias descritas no quadro acima, todas **anteriores ao início das obras**'
      : ', sem patologias aparentes nas fotos registradas';
    return `Na data desta vistoria o imóvel ${estado}${patologias}. Este laudo registra a situação `
      + 'existente e não avalia causas.';
  },
};
