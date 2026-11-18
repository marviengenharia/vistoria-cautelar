// Área para assinar com o dedo (ou mouse/caneta). Sem bibliotecas.
// Uso: const area = criarAreaAssinatura(container, { aoMudar });
//      area.vazia() · area.limpar() · await area.paraPng() · area.destruir()
// O botão "Limpar" fica na tela; a linha-guia "Assine aqui" é desenhada pelo CSS (não vai no PNG).

const COMPRIMENTO_MINIMO = 80; // px CSS: um toque ou risquinho não conta como assinatura
const ESPESSURA = 2.5;         // px CSS (multiplicado pelo devicePixelRatio)

export function criarAreaAssinatura(container, { aoMudar } = {}) {
  const caixa = document.createElement('div');
  caixa.className = 'area-assinatura';
  const canvas = document.createElement('canvas');
  caixa.append(canvas);
  container.append(caixa);

  // Tamanho fixado na criação; depois só o CSS reescala (girar o celular não apaga o traço).
  const dpr = window.devicePixelRatio || 1;
  const largura = Math.max(1, Math.round((container.clientWidth || 300) * dpr));
  canvas.width = largura;
  canvas.height = Math.round(largura / 2);
  const ctx = canvas.getContext('2d');

  let comprimento = 0;   // px CSS desenhados no total
  let ponto = null;      // último ponto do traço em andamento
  let meio = null;       // último ponto médio (início da próxima curva)
  let idAtivo = null;

  function fundoBranco() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function estiloTraco() {
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = ESPESSURA * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  fundoBranco();
  estiloTraco();

  // Posição do ponteiro em pixels do canvas, mesmo com o canvas reescalado pelo CSS.
  function posicao(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }
  const escalaCss = () => canvas.getBoundingClientRect().width / canvas.width || 1;

  function aoDescer(e) {
    if (idAtivo !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    idAtivo = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    ponto = posicao(e);
    meio = ponto;
    e.preventDefault();
  }

  function aoMover(e) {
    if (e.pointerId !== idAtivo) return;
    const novo = posicao(e);
    const medio = { x: (ponto.x + novo.x) / 2, y: (ponto.y + novo.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(meio.x, meio.y);
    ctx.quadraticCurveTo(ponto.x, ponto.y, medio.x, medio.y);
    ctx.stroke();
    comprimento += Math.hypot(novo.x - ponto.x, novo.y - ponto.y) * escalaCss();
    ponto = novo;
    meio = medio;
    e.preventDefault();
    if (aoMudar) aoMudar();
  }

  function aoSoltar(e) {
    if (e.pointerId !== idAtivo) return;
    // fecha o último trecho até o ponto final
    ctx.beginPath();
    ctx.moveTo(meio.x, meio.y);
    ctx.lineTo(ponto.x, ponto.y);
    ctx.stroke();
    idAtivo = null;
    ponto = meio = null;
    if (aoMudar) aoMudar();
  }

  canvas.addEventListener('pointerdown', aoDescer);
  canvas.addEventListener('pointermove', aoMover);
  canvas.addEventListener('pointerup', aoSoltar);
  canvas.addEventListener('pointercancel', aoSoltar);

  return {
    vazia: () => comprimento < COMPRIMENTO_MINIMO,
    limpar() {
      fundoBranco();
      comprimento = 0;
      idAtivo = null;
      ponto = meio = null;
      if (aoMudar) aoMudar();
    },
    paraPng: () => new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem da assinatura.'))), 'image/png');
    }),
    destruir() { caixa.remove(); },
  };
}
