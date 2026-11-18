// Tela inicial: lista de imóveis, busca, filtro por status e contador.
import { listarImoveis, criarImovel } from './db.js';
import { STATUS, rotuloDe } from './dominio.js';
import { esc, mostrarMensagem } from './util.js';

// Filtro e busca continuam iguais ao voltar de um imóvel (enquanto o app estiver aberto).
const memoria = { filtro: 'todos', busca: '' };

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function telaLista(raiz) {
  const imoveis = (await listarImoveis()).sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
  const total = imoveis.length;
  const contagem = Object.fromEntries(STATUS.map((s) => [s.valor, 0]));
  imoveis.forEach((im) => { contagem[im.status] = (contagem[im.status] ?? 0) + 1; });
  const vistoriados = contagem.vistoriado;
  const pct = total ? Math.round((vistoriados / total) * 100) : 0;

  raiz.innerHTML = `
    <header class="barra-topo">
      <h1>Vistoria Cautelar</h1>
      <p class="barra-sub">CBS · Fase III · Av. Bernardo Sayão</p>
    </header>

    <div class="pagina">
      <section class="contador" aria-label="Andamento">
        <p><strong>${vistoriados}</strong> de <strong>${total}</strong> imóveis vistoriados</p>
        <div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="progresso-barra" style="width:${pct}%"></div>
        </div>
      </section>

      <label class="campo-busca">
        <span class="visualmente-oculto">Buscar</span>
        <input type="search" id="busca" placeholder="Buscar nº, endereço ou ocupante"
               value="${esc(memoria.busca)}" autocomplete="off" enterkeyhint="search">
      </label>

      <div class="filtros" role="group" aria-label="Filtrar por situação">
        <button type="button" class="filtro" data-filtro="todos">Todos <span>${total}</span></button>
        ${STATUS.map((s) => `
          <button type="button" class="filtro" data-filtro="${s.valor}">
            <i class="bolinha status-${s.valor}"></i>${s.rotulo} <span>${contagem[s.valor]}</span>
          </button>`).join('')}
      </div>

      <ul class="lista-imoveis" id="lista"></ul>
    </div>

    <button type="button" class="botao-novo" id="novo-imovel">+ Imóvel</button>
  `;

  const lista = raiz.querySelector('#lista');
  const busca = raiz.querySelector('#busca');

  function desenharLista() {
    raiz.querySelectorAll('.filtro').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.filtro === memoria.filtro));
    });
    const termo = normalizar(memoria.busca.trim());
    const visiveis = imoveis.filter((im) =>
      (memoria.filtro === 'todos' || im.status === memoria.filtro)
      && (!termo || normalizar(`${im.id} ${im.endereco} ${im.ocupanteNome}`).includes(termo)));

    if (!total) {
      lista.innerHTML = `<li class="vazio">Nenhum imóvel ainda.<br>Toque em <strong>+ Imóvel</strong> para começar.</li>`;
      return;
    }
    if (!visiveis.length) {
      lista.innerHTML = `<li class="vazio">Nenhum imóvel encontrado com esse filtro.</li>`;
      return;
    }
    lista.innerHTML = visiveis.map((im) => {
      const local = [im.estaca && `Estaca ${im.estaca}`, im.lado].filter(Boolean).join(' · ');
      return `
        <li>
          <a class="cartao-imovel" href="#/imovel/${encodeURIComponent(im.id)}">
            <span class="piquete">${esc(im.id)}</span>
            <span class="cartao-texto">
              <span class="cartao-endereco">${esc(im.endereco) || '<em>Sem endereço</em>'}</span>
              <span class="cartao-detalhe">${esc(local || im.ocupanteNome || '—')}</span>
            </span>
            <span class="selo status-${im.status}">${rotuloDe(STATUS, im.status)}</span>
          </a>
        </li>`;
    }).join('');
  }

  raiz.querySelector('.filtros').addEventListener('click', (e) => {
    const botao = e.target.closest('.filtro');
    if (!botao) return;
    memoria.filtro = botao.dataset.filtro;
    desenharLista();
  });

  busca.addEventListener('input', () => {
    memoria.busca = busca.value;
    desenharLista();
  });

  const botaoNovo = raiz.querySelector('#novo-imovel');
  botaoNovo.addEventListener('click', async () => {
    botaoNovo.disabled = true;
    try {
      const novo = await criarImovel();
      location.hash = `#/imovel/${encodeURIComponent(novo.id)}`;
    } catch (erro) {
      console.error(erro);
      mostrarMensagem('Não foi possível criar o imóvel: ' + erro.message, 'erro');
      botaoNovo.disabled = false;
    }
  });

  desenharLista();
  return null; // nada pendente para gravar ao sair
}
