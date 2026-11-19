// "Meus dados": nome, CREA e ART do vistoriador deste celular (saem no laudo como responsável técnico).
// Grava sozinho, sem botão "Salvar".
import { obterMeusDados, gravarMeusDados } from './db.js';
import { esc, mostrarMensagem } from './util.js';

const ESPERA_DIGITACAO_MS = 400;

export async function telaMeusDados(raiz) {
  const dados = await obterMeusDados();

  raiz.innerHTML = `
    <header class="topo topo-com-volta">
      <a class="pilula" href="#/">‹ Imóveis</a>
      <h1>Meus dados</h1>
      <span class="pilula salvamento" id="salvamento" data-estado="ok">Salvo</span>
    </header>
    <div class="pagina">
      <form id="form-meus-dados" autocomplete="off" novalidate>
        <p class="explicacao">Seu nome sai como responsável técnico no laudo.
          Estes dados ficam só neste celular.</p>
        <label class="campo"><span class="rotulo">Nome completo</span>
          <input type="text" name="nome" value="${esc(dados.nome)}" autocapitalize="words" autocomplete="off"></label>
        <label class="campo"><span class="rotulo">CREA</span>
          <input type="text" name="crea" value="${esc(dados.crea)}" autocomplete="off" placeholder="ex.: 151234567-0">
          <span class="ajuda">Se não tiver, deixe em branco.</span></label>
        <label class="campo"><span class="rotulo">ART</span>
          <input type="text" name="art" value="${esc(dados.art)}" autocomplete="off">
          <span class="ajuda">Número da ART da vistoria. Se não tiver, deixe em branco.</span></label>
        <a class="botao botao-largo ok-proximo" href="#/">OK</a>
      </form>
    </div>`;

  const form = raiz.querySelector('#form-meus-dados');
  const indicador = raiz.querySelector('#salvamento');
  const pendentes = {};
  let temporizador = null;
  let gravando = Promise.resolve();

  const mostrarEstado = (estado, texto) => { indicador.dataset.estado = estado; indicador.textContent = texto; };

  function gravar() {
    clearTimeout(temporizador);
    if (!Object.keys(pendentes).length) return gravando;
    const lote = { ...pendentes };
    Object.keys(pendentes).forEach((k) => delete pendentes[k]);
    gravando = gravando.then(async () => {
      try {
        await gravarMeusDados(lote);
        if (!Object.keys(pendentes).length) mostrarEstado('ok', 'Salvo');
      } catch (erro) {
        console.error(erro);
        Object.entries(lote).forEach(([k, v]) => { if (!(k in pendentes)) pendentes[k] = v; });
        mostrarEstado('erro', 'Erro ao salvar');
        mostrarMensagem('Não foi possível salvar. Tente de novo.', 'erro');
      }
    });
    return gravando;
  }

  form.addEventListener('input', (e) => {
    if (!e.target.name) return;
    pendentes[e.target.name] = e.target.value.trim();
    mostrarEstado('salvando', 'Salvando…');
    clearTimeout(temporizador);
    temporizador = setTimeout(gravar, ESPERA_DIGITACAO_MS);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  const aoEsconder = () => { if (document.visibilityState === 'hidden') gravar(); };
  document.addEventListener('visibilitychange', aoEsconder);
  window.addEventListener('pagehide', gravar);

  return async () => {
    document.removeEventListener('visibilitychange', aoEsconder);
    window.removeEventListener('pagehide', gravar);
    await gravar();
  };
}
