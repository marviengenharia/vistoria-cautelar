// Tela inicial: fotos das fachadas em grade, filtro de lado e "perto da estaca".
import { listarImoveis, criarImovel } from './db.js';
import { STATUS, RAIO_ESTACAS, estacaNumero, rotuloDe } from './dominio.js';
import { esc, mostrarMensagem, CASINHA_SVG } from './util.js';

// Filtros continuam iguais ao voltar de um imóvel (enquanto o app estiver aberto).
const memoria = { lado: 'LE', estaca: null, situacao: 'todos', busca: '' };

const LADOS_FILTRO = [
  { valor: 'LE', rotulo: 'Lado esquerdo' },
  { valor: 'LD', rotulo: 'Lado direito' },
  { valor: 'ambos', rotulo: 'Os dois' },
];

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function telaLista(raiz) {
  const imoveis = (await listarImoveis()).map((im) => ({ ...im, _estaca: estacaNumero(im.estaca) }));
  imoveis.sort((a, b) => (a._estaca ?? Infinity) - (b._estaca ?? Infinity)
    || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));

  const total = imoveis.length;
  const contagem = Object.fromEntries(STATUS.map((s) => [s.valor, 0]));
  imoveis.forEach((im) => { contagem[im.status] = (contagem[im.status] ?? 0) + 1; });
  const estacasConhecidas = imoveis.map((im) => im._estaca).filter((e) => e !== null);

  const barra = STATUS.filter((s) => s.valor !== 'pendente').map((s) => (total
    ? `<i class="st-${s.valor}" style="width:${(contagem[s.valor] / total) * 100}%"></i>` : '')).join('');

  raiz.innerHTML = `
    <header class="topo">
      <div class="topo-linha">
        <h1>Vistoria cautelar</h1>
        <p class="placar"><b>${contagem.vistoriado}</b> de ${total} vistoriados</p>
      </div>
      <div class="andamento" aria-hidden="true">${barra}</div>
    </header>

    <div class="pagina pagina-lista">
      <div class="segmentos" role="group" aria-label="Lado da obra">
        ${LADOS_FILTRO.map((l) => `<button type="button" class="segmento" data-lado="${l.valor}">${l.rotulo}</button>`).join('')}
      </div>

      <div class="perto" role="group" aria-label="Perto da estaca">
        <span class="perto-rotulo">Perto da estaca</span>
        <button type="button" class="botao-passo" data-estaca="-1" aria-label="Estaca anterior">−</button>
        <output class="perto-valor" id="estaca-atual"></output>
        <button type="button" class="botao-passo" data-estaca="1" aria-label="Próxima estaca">+</button>
        <button type="button" class="perto-todas" id="todas-estacas">Todas</button>
      </div>

      <details class="mais-filtros">
        <summary>Buscar e filtrar por situação</summary>
        <input type="search" id="busca" class="busca" placeholder="Número, rua ou nome do ocupante"
               value="${esc(memoria.busca)}" autocomplete="off" enterkeyhint="search" aria-label="Buscar">
        <div class="filtros" role="group" aria-label="Situação">
          <button type="button" class="filtro" data-situacao="todos">Todas <b>${total}</b></button>
          ${STATUS.map((s) => `<button type="button" class="filtro" data-situacao="${s.valor}">
            ${s.rotulo} <b>${contagem[s.valor]}</b></button>`).join('')}
        </div>
      </details>

      <div id="grupos"></div>
    </div>

    <button type="button" class="botao-novo" id="novo-imovel">+ Imóvel</button>
  `;

  const grupos = raiz.querySelector('#grupos');
  const saidaEstaca = raiz.querySelector('#estaca-atual');
  const maisFiltros = raiz.querySelector('.mais-filtros');
  if (memoria.busca || memoria.situacao !== 'todos') maisFiltros.open = true;
  let urls = [];

  const liberarUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };

  function cartao(im) {
    let imagem = `<span class="foto-vazia">${CASINHA_SVG}<span>Sem foto</span></span>`;
    if (im.fachada?.miniatura) {
      const url = URL.createObjectURL(im.fachada.miniatura);
      urls.push(url);
      imagem = `<img src="${url}" alt="">`;
    }
    const estaca = im.estaca
      ? `<span class="tag-estaca">E${esc(String(im.estaca).replace(/^\s*E\s*/i, ''))}</span>` : '';
    return `
      <a class="cartao-foto st-${im.status}" href="#/imovel/${encodeURIComponent(im.id)}"
         aria-label="${esc(`${im.id}, ${rotuloDe(STATUS, im.status)}${im.endereco ? `, ${im.endereco}` : ''}`)}">
        ${imagem}${estaca}
        <span class="cartao-rodape">
          <span class="num">${esc(im.id)}</span>
          <span class="cartao-situacao">${rotuloDe(STATUS, im.status)}</span>
        </span>
      </a>`;
  }

  function desenhar() {
    liberarUrls();
    raiz.querySelectorAll('.segmento').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lado === memoria.lado)));
    raiz.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.situacao === memoria.situacao)));
    saidaEstaca.textContent = memoria.estaca === null ? 'todas' : `E${memoria.estaca}`;
    raiz.querySelector('#todas-estacas').hidden = memoria.estaca === null;

    if (!total) {
      grupos.innerHTML = `<p class="vazio">Nenhum imóvel ainda.<br>Toque em <strong>+ Imóvel</strong> para começar.</p>`;
      return;
    }

    const termo = normalizar(memoria.busca.trim());
    const passaBuscaSituacao = (im) => (memoria.situacao === 'todos' || im.status === memoria.situacao)
      && (!termo || normalizar(`${im.id} ${im.endereco} ${im.ocupanteNome} ${im.estaca}`).includes(termo));

    // Imóvel sem estaca ou sem lado aparece sempre (senão some depois de criado).
    const semLocal = imoveis.filter((im) => (im._estaca === null || !im.lado) && passaBuscaSituacao(im));
    const naRua = imoveis.filter((im) => im._estaca !== null && im.lado
      && (memoria.lado === 'ambos' || im.lado === memoria.lado)
      && (memoria.estaca === null || Math.abs(im._estaca - memoria.estaca) <= RAIO_ESTACAS)
      && passaBuscaSituacao(im));

    const titulo = memoria.estaca === null
      ? rotuloDe(LADOS_FILTRO, memoria.lado)
      : `${rotuloDe(LADOS_FILTRO, memoria.lado)}, E${Math.max(0, memoria.estaca - RAIO_ESTACAS)} a E${memoria.estaca + RAIO_ESTACAS}`;

    grupos.innerHTML = `
      ${semLocal.length ? `
        <h2 class="grupo-titulo">Falta estaca ou lado <span>${semLocal.length}</span></h2>
        <div class="grade-fotos">${semLocal.map(cartao).join('')}</div>` : ''}
      <h2 class="grupo-titulo">${esc(titulo)} <span>${naRua.length}</span></h2>
      ${naRua.length
        ? `<div class="grade-fotos">${naRua.map(cartao).join('')}</div>`
        : '<p class="vazio">Nenhum imóvel aqui. Troque o lado ou a estaca.</p>'}`;
  }

  raiz.querySelector('.segmentos').addEventListener('click', (e) => {
    const b = e.target.closest('.segmento');
    if (!b) return;
    memoria.lado = b.dataset.lado;
    desenhar();
  });

  raiz.querySelector('.perto').addEventListener('click', (e) => {
    const passo = e.target.closest('[data-estaca]');
    if (passo) {
      if (memoria.estaca === null) {
        // primeiro toque: começa na primeira estaca com imóvel (ou E18, início do trecho da obra)
        memoria.estaca = estacasConhecidas.length ? Math.floor(Math.min(...estacasConhecidas)) : 18;
      } else {
        memoria.estaca = Math.max(0, memoria.estaca + Number(passo.dataset.estaca));
      }
      desenhar();
    } else if (e.target.closest('#todas-estacas')) {
      memoria.estaca = null;
      desenhar();
    }
  });

  raiz.querySelector('.filtros').addEventListener('click', (e) => {
    const b = e.target.closest('.filtro');
    if (!b) return;
    memoria.situacao = b.dataset.situacao;
    desenhar();
  });

  raiz.querySelector('#busca').addEventListener('input', (e) => {
    memoria.busca = e.target.value;
    desenhar();
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

  desenhar();
  return async () => liberarUrls();
}
