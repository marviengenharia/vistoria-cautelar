// Funções pequenas usadas em várias telas.

/** Escapa texto digitado pelo usuário antes de colocar em HTML. */
export function esc(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Data/hora no formato brasileiro: 18/11/2026 14:05 */
export function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Número com vírgula decimal: 1.5 -> "1,5" */
export function numeroBr(n, casas = 0) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Desenho de casinha usado quando o imóvel ainda não tem foto. */
export const CASINHA_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`;

/** Mostra uma foto ocupando a tela inteira; um toque fecha. */
export function abrirTelaCheia(blob) {
  const url = URL.createObjectURL(blob);
  const fundo = document.createElement('div');
  fundo.className = 'tela-cheia';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-label', 'Foto em tela cheia. Toque para fechar.');
  fundo.innerHTML = `<img src="${url}" alt=""><p>Toque para fechar</p>`;
  fundo.addEventListener('click', () => {
    fundo.remove();
    URL.revokeObjectURL(url);
  });
  document.body.append(fundo);
}

let temporizadorMensagem;
/** Mostra um aviso curto no rodapé da tela. */
export function mostrarMensagem(texto, tipo = 'normal') {
  const caixa = document.getElementById('mensagem');
  caixa.textContent = texto;
  caixa.dataset.tipo = tipo;
  caixa.hidden = false;
  clearTimeout(temporizadorMensagem);
  temporizadorMensagem = setTimeout(() => { caixa.hidden = true; }, 3500);
}
