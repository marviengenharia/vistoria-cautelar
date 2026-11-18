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
