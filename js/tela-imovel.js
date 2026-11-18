// Tela do imóvel: abas Dados → Ambientes → Assinaturas → Laudo.
// Nesta etapa só a aba Dados funciona. Cada campo é gravado sozinho, sem botão "Salvar".
import { obterImovel, atualizarImovel, excluirImovel } from './db.js';
import {
  STATUS, LADOS, CONDICOES_OCUPANTE, USOS, ESTRUTURAS, COBERTURAS, FUNDACOES, IDADES,
  CONSERVACOES, rotuloDe,
} from './dominio.js';
import { capturarGps } from './gps.js';
import { esc, dataHora, numeroBr, mostrarMensagem } from './util.js';

const ABAS = [
  { id: 'dados', rotulo: 'Dados' },
  { id: 'ambientes', rotulo: 'Ambientes' },
  { id: 'assinaturas', rotulo: 'Assinaturas' },
  { id: 'laudo', rotulo: 'Laudo' },
];

const EM_BREVE = {
  ambientes: 'Ambientes, anomalias e fotos chegam na etapa 3.',
  assinaturas: 'As assinaturas na tela chegam na etapa 4.',
  laudo: 'O laudo em PDF chega na etapa 5.',
};

const ESPERA_DIGITACAO_MS = 400; // grava 0,4 s depois que a pessoa para de digitar

// ---------- pedaços de formulário ----------

function chips(nome, opcoes, atual) {
  return `<div class="chips">${opcoes.map((o) => `
    <label class="chip">
      <input type="radio" name="${nome}" value="${o.valor}" ${o.valor === atual ? 'checked' : ''}>
      <span>${o.rotulo}</span>
    </label>`).join('')}</div>`;
}

function grupo(titulo, controle, ajuda = '') {
  return `<fieldset class="campo"><legend>${titulo}</legend>${controle}
    ${ajuda ? `<p class="ajuda">${ajuda}</p>` : ''}</fieldset>`;
}

function campo(titulo, controle, ajuda = '') {
  return `<label class="campo"><span class="rotulo">${titulo}</span>${controle}
    ${ajuda ? `<span class="ajuda">${ajuda}</span>` : ''}</label>`;
}

function texto(nome, valor, extra = '') {
  return `<input type="text" name="${nome}" value="${esc(valor)}" autocomplete="off" ${extra}>`;
}

function selecao(nome, opcoes, atual) {
  return `<select name="${nome}">
    <option value="">Escolher…</option>
    ${opcoes.map((o) => `<option value="${o.valor}" ${o.valor === atual ? 'selected' : ''}>${o.rotulo}</option>`).join('')}
  </select>`;
}

function maisMenos(nome, valor, min, max) {
  return `<div class="mais-menos">
    <button type="button" class="botao-passo" data-campo="${nome}" data-passo="-1" aria-label="Menos">−</button>
    <input type="number" name="${nome}" value="${valor ?? ''}" min="${min}" max="${max}" inputmode="numeric">
    <button type="button" class="botao-passo" data-campo="${nome}" data-passo="1" aria-label="Mais">+</button>
  </div>`;
}

// ---------- blocos da aba Dados ----------
// Cada bloco abre fechado e mostra um resumo na linha do título.

const juntar = (...partes) => partes.filter(Boolean).join(' · ');

const BLOCOS = [
  {
    id: 'situacao',
    titulo: 'Situação',
    resumo: (im) => juntar(rotuloDe(STATUS, im.status), im.status === 'recusado' && im.recusaMotivo),
    html: (im) => `
      ${grupo('Situação da vistoria', chips('status', STATUS, im.status))}
      <div data-so-se-recusado ${im.status === 'recusado' ? '' : 'hidden'}>
        ${campo('Motivo da recusa', `<textarea name="recusaMotivo" rows="3">${esc(im.recusaMotivo)}</textarea>`)}
        ${campo('Nome da testemunha', texto('recusaTestemunha', im.recusaTestemunha))}
        <p class="ajuda">A foto da fachada e o Termo de Recusa chegam nas próximas etapas.</p>
      </div>`,
  },
  {
    id: 'localizacao',
    titulo: 'Localização',
    resumo: (im) => juntar(
      im.endereco,
      im.estaca && `Est. ${im.estaca}`,
      im.lado,
      im.gps ? `GPS ±${im.gps.precisao} m` : (im.endereco || im.estaca) && 'sem GPS'
    ),
    html: (im) => `
      ${campo('Endereço', texto('endereco', im.endereco, 'enterkeyhint="next"'))}
      ${campo('Ponto de referência', texto('referencia', im.referencia))}
      <fieldset class="campo">
        <legend>GPS do imóvel</legend>
        <div class="gps" id="gps-info">${gpsHtml(im.gps)}</div>
        <button type="button" class="botao botao-largo" id="botao-gps">Capturar GPS</button>
        <p class="ajuda">Fique em frente ao imóvel, de preferência ao ar livre.</p>
      </fieldset>
      ${campo('Estaca mais próxima', texto('estaca', im.estaca, 'placeholder="ex.: 42+10"'))}
      ${grupo('Lado da obra', chips('lado', LADOS, im.lado))}
      ${campo('Distância à borda da obra (m)',
        `<input type="number" name="distanciaObra" value="${im.distanciaObra ?? ''}" min="0" step="0.1" inputmode="decimal">`,
        'Por enquanto, preencher à mão. Na etapa do mapa passa a ser calculada pelo GPS.')}`,
  },
  {
    id: 'ocupante',
    titulo: 'Ocupante',
    resumo: (im) => juntar(im.ocupanteNome, rotuloDe(CONDICOES_OCUPANTE, im.ocupanteCondicao), im.ocupanteTelefone),
    html: (im) => `
      ${campo('Nome', texto('ocupanteNome', im.ocupanteNome, 'autocapitalize="words"'))}
      ${campo('Telefone', `<input type="tel" name="ocupanteTelefone" value="${esc(im.ocupanteTelefone)}" autocomplete="off" placeholder="(91) 9 0000-0000">`)}
      ${grupo('Condição', chips('ocupanteCondicao', CONDICOES_OCUPANTE, im.ocupanteCondicao))}
      <p class="ajuda">LGPD: anotar só o necessário (nome e telefone). Os dados ficam apenas neste aparelho.</p>`,
  },
  {
    id: 'caracteristicas',
    titulo: 'Características',
    resumo: (im) => juntar(
      rotuloDe(USOS, im.uso),
      im.pavimentos != null && `${im.pavimentos} pav.`,
      rotuloDe(ESTRUTURAS, im.estrutura),
      im.conservacao && `conservação ${rotuloDe(CONSERVACOES, im.conservacao).toLowerCase()}`
    ),
    html: (im) => `
      ${grupo('Uso', chips('uso', USOS, im.uso))}
      ${grupo('Nº de pavimentos', maisMenos('pavimentos', im.pavimentos, 0, 30))}
      ${campo('Estrutura', selecao('estrutura', ESTRUTURAS, im.estrutura))}
      ${campo('Cobertura', selecao('cobertura', COBERTURAS, im.cobertura))}
      ${campo('Fundação aparente', selecao('fundacao', FUNDACOES, im.fundacao))}
      ${campo('Idade aparente', selecao('idadeAparente', IDADES, im.idadeAparente))}
      ${grupo('Estado de conservação', chips('conservacao', CONSERVACOES, im.conservacao))}`,
  },
  {
    id: 'observacoes',
    titulo: 'Observações',
    resumo: (im) => (im.observacoes.length > 40 ? `${im.observacoes.slice(0, 40)}…` : im.observacoes),
    html: (im) => `
      ${campo('Observações gerais', `<textarea name="observacoes" rows="5">${esc(im.observacoes)}</textarea>`)}`,
  },
];

function qualidadeGps(precisao) {
  if (precisao <= 10) return { classe: 'boa', texto: 'boa' };
  if (precisao <= 25) return { classe: 'media', texto: 'aceitável' };
  return { classe: 'fraca', texto: 'fraca — tente de novo ao ar livre' };
}

function gpsHtml(gps, buscando = false) {
  if (!gps) {
    return buscando
      ? '<p><strong>Buscando sinal…</strong></p>'
      : '<p>Ainda sem GPS.</p>';
  }
  const q = qualidadeGps(gps.precisao);
  return `
    <p class="gps-coord">${numeroBr(gps.lat, 6)}, ${numeroBr(gps.lon, 6)}</p>
    <p>Precisão <strong class="precisao-${q.classe}">±${gps.precisao} m (${q.texto})</strong></p>
    <p class="ajuda">${buscando ? 'Melhorando a leitura…' : `Capturado em ${dataHora(gps.capturadoEm)}`}</p>`;
}

function htmlBloco(bloco, im, ultimo) {
  const resumo = bloco.resumo(im);
  return `
    <details class="bloco" data-bloco="${bloco.id}">
      <summary>
        <span class="bloco-titulo">${bloco.titulo}</span>
        <span class="bloco-resumo ${resumo ? '' : 'a-preencher'}">${esc(resumo || 'a preencher')}</span>
      </summary>
      <div class="bloco-corpo">
        ${bloco.html(im)}
        <button type="button" class="botao botao-largo ok-proximo">${ultimo ? 'OK' : 'OK, próximo'}</button>
      </div>
    </details>`;
}

// ---------- tela ----------

export async function telaImovel(raiz, id, aba) {
  let imovel = await obterImovel(id);

  if (!imovel) {
    raiz.innerHTML = `
      <header class="barra-topo barra-imovel"><a class="voltar" href="#/">‹ Imóveis</a></header>
      <div class="pagina"><p class="vazio">Imóvel ${esc(id)} não encontrado.</p></div>`;
    return null;
  }

  const abaAtual = ABAS.some((a) => a.id === aba) ? aba : 'dados';
  const base = `#/imovel/${encodeURIComponent(id)}`;

  raiz.innerHTML = `
    <div class="topo-fixo">
      <header class="barra-topo barra-imovel">
        <a class="voltar" href="#/">‹ Imóveis</a>
        <span class="piquete">${esc(id)}</span>
        <span class="salvamento" id="salvamento" data-estado="ok">Salvo</span>
      </header>
      <nav class="abas" aria-label="Partes da vistoria">
        ${ABAS.map((a) => `<a href="${base}/${a.id}" ${a.id === abaAtual ? 'aria-current="page"' : ''}>${a.rotulo}</a>`).join('')}
      </nav>
    </div>
    <div class="pagina" id="conteudo-aba"></div>`;

  const conteudo = raiz.querySelector('#conteudo-aba');

  if (abaAtual !== 'dados') {
    conteudo.innerHTML = `<p class="vazio">${EM_BREVE[abaAtual]}</p>`;
    return null;
  }

  conteudo.innerHTML = `
    <form id="form-dados" autocomplete="off" novalidate>
      ${BLOCOS.map((b, i) => htmlBloco(b, imovel, i === BLOCOS.length - 1)).join('')}
    </form>
    <p class="rodape-imovel">
      Criado em ${dataHora(imovel.criadoEm)}<br>
      <span id="ultima-alteracao">Última alteração: ${dataHora(imovel.atualizadoEm)}</span>
    </p>
    <button type="button" class="botao botao-perigo" id="excluir">Excluir este imóvel</button>`;

  const form = conteudo.querySelector('#form-dados');
  const indicador = raiz.querySelector('#salvamento');

  // ----- gravação automática -----
  const pendentes = new Map();
  let temporizador = null;
  let gravando = Promise.resolve();

  function mostrarEstado(estado, textoEstado) {
    indicador.dataset.estado = estado;
    indicador.textContent = textoEstado;
  }

  function atualizarResumos() {
    form.querySelectorAll('details.bloco').forEach((det) => {
      const bloco = BLOCOS.find((b) => b.id === det.dataset.bloco);
      const resumo = bloco.resumo(imovel);
      const span = det.querySelector('.bloco-resumo');
      span.textContent = resumo || 'a preencher';
      span.classList.toggle('a-preencher', !resumo);
    });
    form.querySelector('[data-so-se-recusado]').hidden = imovel.status !== 'recusado';
    const ultima = conteudo.querySelector('#ultima-alteracao');
    if (ultima) ultima.textContent = `Última alteração: ${dataHora(imovel.atualizadoEm)}`;
  }

  function gravar() {
    clearTimeout(temporizador);
    if (!pendentes.size) return gravando;
    const lote = Object.fromEntries(pendentes);
    pendentes.clear();
    // uma gravação de cada vez, na ordem
    gravando = gravando.then(async () => {
      try {
        imovel = await atualizarImovel(id, lote);
        if (!pendentes.size) mostrarEstado('ok', 'Salvo');
        atualizarResumos();
      } catch (erro) {
        console.error(erro);
        // devolve para a fila, sem passar por cima do que foi digitado depois
        Object.entries(lote).forEach(([k, v]) => { if (!pendentes.has(k)) pendentes.set(k, v); });
        mostrarEstado('erro', 'Erro ao salvar');
        mostrarMensagem('Não foi possível salvar. Tente de novo.', 'erro');
      }
    });
    return gravando;
  }

  function agendar(campoNome, valor, imediato = false) {
    pendentes.set(campoNome, valor);
    mostrarEstado('salvando', 'Salvando…');
    clearTimeout(temporizador);
    if (imediato) gravar();
    else temporizador = setTimeout(gravar, ESPERA_DIGITACAO_MS);
  }

  function lerValor(alvo) {
    if (alvo.type === 'number') return alvo.value === '' ? null : Number(alvo.value);
    return alvo.value;
  }

  form.addEventListener('input', (e) => {
    const alvo = e.target;
    if (!alvo.name || alvo.type === 'radio' || alvo.tagName === 'SELECT') return;
    agendar(alvo.name, lerValor(alvo));
  });

  form.addEventListener('change', (e) => {
    const alvo = e.target;
    if (!alvo.name) return;
    agendar(alvo.name, lerValor(alvo), alvo.type === 'radio' || alvo.tagName === 'SELECT');
  });

  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('click', (e) => {
    // botões − e +
    const passo = e.target.closest('.botao-passo');
    if (passo) {
      const entrada = form.elements[passo.dataset.campo];
      const min = Number(entrada.min);
      const max = Number(entrada.max);
      const atual = entrada.value === '' ? 0 : Number(entrada.value);
      const novo = Math.min(max, Math.max(min, atual + Number(passo.dataset.passo)));
      entrada.value = novo;
      agendar(entrada.name, novo, true);
      return;
    }
    // OK, próximo: fecha este bloco e abre o seguinte
    const ok = e.target.closest('.ok-proximo');
    if (ok) {
      gravar();
      const atual = ok.closest('details.bloco');
      atual.open = false;
      const proximo = atual.nextElementSibling;
      if (proximo?.matches('details.bloco')) {
        proximo.open = true;
        proximo.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        atual.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  });

  // ----- GPS -----
  const botaoGps = form.querySelector('#botao-gps');
  const infoGps = form.querySelector('#gps-info');
  let capturaGps = null;

  botaoGps.addEventListener('click', async () => {
    if (capturaGps) { // já buscando: o toque serve para parar e usar a melhor leitura
      capturaGps.parar();
      return;
    }
    infoGps.innerHTML = gpsHtml(null, true);
    botaoGps.textContent = 'Parar e usar esta leitura';
    capturaGps = capturarGps({
      aoMelhorar: (leitura) => { infoGps.innerHTML = gpsHtml(leitura, true); },
    });
    let temGps = Boolean(imovel.gps);
    try {
      const leitura = await capturaGps.resultado;
      agendar('gps', leitura, true);
      temGps = true;
      infoGps.innerHTML = gpsHtml(leitura);
      mostrarMensagem(`GPS gravado (±${leitura.precisao} m).`);
    } catch (erro) {
      infoGps.innerHTML = gpsHtml(imovel.gps);
      mostrarMensagem(erro.message, 'erro');
    } finally {
      capturaGps = null;
      botaoGps.textContent = temGps ? 'Capturar GPS de novo' : 'Capturar GPS';
    }
  });
  if (imovel.gps) botaoGps.textContent = 'Capturar GPS de novo';

  // ----- excluir -----
  conteudo.querySelector('#excluir').addEventListener('click', async () => {
    if (!confirm(`Excluir ${id}? Todos os dados deste imóvel serão apagados deste aparelho.`)) return;
    clearTimeout(temporizador);
    pendentes.clear();
    await gravando;
    await excluirImovel(id);
    mostrarMensagem(`${id} excluído.`);
    location.hash = '#/';
  });

  // grava o que estiver pendente se o app for para segundo plano ou fechado
  const aoEsconder = () => { if (document.visibilityState === 'hidden') gravar(); };
  document.addEventListener('visibilitychange', aoEsconder);
  window.addEventListener('pagehide', gravar);

  // função de saída (chamada ao trocar de tela)
  return async () => {
    capturaGps?.parar();
    document.removeEventListener('visibilitychange', aoEsconder);
    window.removeEventListener('pagehide', gravar);
    await gravar();
  };
}
