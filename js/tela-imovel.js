// Tela do imóvel: foto da fachada no topo + abas Dados → Ambientes → Assinaturas → Laudo.
// Cada campo é gravado sozinho, sem botão "Salvar".
import {
  obterImovel, atualizarImovel, excluirImovel, definirFachada, obterFoto, idsFotosAssinadas,
  listarAssinaturas,
} from './db.js';
import {
  STATUS, LADOS, CONDICOES_OCUPANTE, USOS, ESTRUTURAS, COBERTURAS, FUNDACOES, IDADES,
  CONSERVACOES, FOTO_ASSINADA, rotuloDe,
} from './dominio.js';
import { capturarGps } from './gps.js';
import { prepararFoto } from './foto.js';
import { telaAmbientes } from './tela-ambientes.js';
import { telaAssinaturas } from './tela-assinaturas.js';
import {
  esc, dataHora, numeroBr, mostrarMensagem, abrirTelaCheia, CASINHA_SVG,
} from './util.js';

const ABAS = [
  { id: 'dados', rotulo: 'Dados' },
  { id: 'ambientes', rotulo: 'Ambientes' },
  { id: 'assinaturas', rotulo: 'Assinaturas' },
  { id: 'laudo', rotulo: 'Laudo' },
];

const EM_BREVE = {
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

// ---------- resumos em frase ----------

const frase = (...partes) => {
  const t = partes.filter(Boolean).join(', ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};
const minusculo = (t) => (t ? t.toLowerCase() : '');
const ladoPorExtenso = (lado) => ({ LE: 'lado esquerdo', LD: 'lado direito' }[lado] ?? '');

function textoLocal(im) {
  return frase(im.estaca && `estaca ${im.estaca}`, ladoPorExtenso(im.lado)) || 'Estaca e lado a preencher';
}

// ---------- blocos da aba Dados (abrem fechados, resumo no título) ----------

const BLOCOS = [
  {
    id: 'situacao',
    titulo: 'Situação',
    resumo: (im) => rotuloDe(STATUS, im.status)
      + (im.status === 'recusado' && im.recusaMotivo ? `: ${im.recusaMotivo}` : ''),
    html: (im) => `
      ${grupo('Situação da vistoria', chips('status', STATUS, im.status))}
      <div data-so-se-recusado ${im.status === 'recusado' ? '' : 'hidden'}>
        ${campo('Motivo da recusa', `<textarea name="recusaMotivo" rows="3">${esc(im.recusaMotivo)}</textarea>`)}
        ${campo('Nome da testemunha', texto('recusaTestemunha', im.recusaTestemunha))}
        <p class="ajuda">Tire a foto da fachada no topo da tela. O Termo de Recusa é assinado na aba Assinaturas.</p>
      </div>`,
  },
  {
    id: 'localizacao',
    titulo: 'Localização',
    resumo: (im) => frase(
      im.endereco,
      im.estaca && `estaca ${im.estaca}`,
      ladoPorExtenso(im.lado),
      im.gps ? `GPS ±${im.gps.precisao} m` : (im.endereco || im.estaca) && 'sem GPS'
    ),
    html: (im) => `
      ${campo('Endereço', texto('endereco', im.endereco, 'enterkeyhint="next"'))}
      ${campo('Ponto de referência', texto('referencia', im.referencia))}
      <fieldset class="campo">
        <legend>GPS do imóvel</legend>
        <div class="gps" id="gps-info">${gpsHtml(im.gps)}</div>
        <button type="button" class="botao botao-largo botao-secundario" id="botao-gps">Capturar GPS</button>
        <p class="ajuda">Fique em frente ao imóvel, de preferência ao ar livre.</p>
      </fieldset>
      ${campo('Estaca mais próxima', texto('estaca', im.estaca, 'placeholder="ex.: 42+10" inputmode="text"'))}
      ${grupo('Lado da obra', chips('lado', LADOS, im.lado))}
      ${campo('Distância à borda da obra (m)',
        `<input type="number" name="distanciaObra" value="${im.distanciaObra ?? ''}" min="0" step="0.1" inputmode="decimal">`,
        'Por enquanto, preencher à mão. Na etapa do mapa passa a ser calculada pelo GPS.')}`,
  },
  {
    id: 'ocupante',
    titulo: 'Ocupante',
    resumo: (im) => frase(
      im.ocupanteNome,
      minusculo(rotuloDe(CONDICOES_OCUPANTE, im.ocupanteCondicao)),
      im.ocupanteTelefone && 'telefone anotado'
    ),
    html: (im) => `
      ${campo('Nome', texto('ocupanteNome', im.ocupanteNome, 'autocapitalize="words"'))}
      ${campo('Telefone', `<input type="tel" name="ocupanteTelefone" value="${esc(im.ocupanteTelefone)}" autocomplete="off" placeholder="(91) 9 0000-0000">`)}
      ${grupo('Condição', chips('ocupanteCondicao', CONDICOES_OCUPANTE, im.ocupanteCondicao))}
      <p class="ajuda">Anote só o necessário (nome e telefone). Os dados ficam apenas neste aparelho.</p>`,
  },
  {
    id: 'caracteristicas',
    titulo: 'Características',
    resumo: (im) => frase(
      rotuloDe(USOS, im.uso),
      im.pavimentos != null && `${im.pavimentos} ${im.pavimentos === 1 ? 'pavimento' : 'pavimentos'}`,
      minusculo(rotuloDe(ESTRUTURAS, im.estrutura)),
      im.conservacao && `conservação ${minusculo(rotuloDe(CONSERVACOES, im.conservacao))}`
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
    resumo: (im) => (im.observacoes.length > 60 ? `${im.observacoes.slice(0, 60)}…` : im.observacoes),
    html: (im) => `
      ${campo('Observações gerais', `<textarea name="observacoes" rows="5">${esc(im.observacoes)}</textarea>`)}`,
  },
];

function qualidadeGps(precisao) {
  if (precisao <= 10) return { classe: 'boa', texto: 'boa' };
  if (precisao <= 25) return { classe: 'media', texto: 'aceitável' };
  return { classe: 'fraca', texto: 'fraca, tente de novo ao ar livre' };
}

function gpsHtml(gps, buscando = false) {
  if (!gps) return buscando ? '<p><strong>Buscando sinal…</strong></p>' : '<p>Ainda sem GPS.</p>';
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
        <span class="bloco-resumo ${resumo ? '' : 'a-preencher'}">${esc(resumo || 'Falta preencher')}</span>
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
      <div class="pagina"><p class="vazio">Imóvel ${esc(id)} não encontrado.</p>
      <a class="botao botao-largo" href="#/">Voltar para a lista</a></div>`;
    return null;
  }

  const abaAtual = ABAS.some((a) => a.id === aba) ? aba : 'dados';
  const base = `#/imovel/${encodeURIComponent(id)}`;

  raiz.innerHTML = `
    <section class="capa" id="capa" aria-label="Fachada do imóvel"></section>
    <nav class="abas" aria-label="Partes da vistoria">
      ${ABAS.map((a) => `<a href="${base}/${a.id}" ${a.id === abaAtual ? 'aria-current="page"' : ''}>${a.rotulo}</a>`).join('')}
    </nav>
    <div class="pagina" id="conteudo-aba"></div>
    <input type="file" accept="image/*" capture="environment" id="entrada-fachada" hidden>`;

  const capa = raiz.querySelector('#capa');
  const conteudo = raiz.querySelector('#conteudo-aba');
  const entradaFachada = raiz.querySelector('#entrada-fachada');
  let urlCapa = null;
  let fotoCapa = null;
  let fachadaAssinada = false; // a foto da fachada consta numa assinatura: não pode ser trocada
  let estadoSalvamento = { estado: 'ok', texto: 'Salvo' };

  function mostrarEstado(estado, textoEstado) {
    estadoSalvamento = { estado, texto: textoEstado };
    const ind = capa.querySelector('#salvamento');
    if (ind) {
      ind.dataset.estado = estado;
      ind.textContent = textoEstado;
    }
  }

  function atualizarCapaTexto() {
    const selo = capa.querySelector('.selo');
    if (selo) {
      selo.className = `selo st-${imovel.status}`;
      selo.textContent = rotuloDe(STATUS, imovel.status);
    }
    const local = capa.querySelector('#capa-local');
    if (local) local.textContent = textoLocal(imovel);
  }

  async function desenharCapa() {
    if (urlCapa) URL.revokeObjectURL(urlCapa);
    urlCapa = null;
    fotoCapa = imovel.fachada ? (await obterFoto(imovel.fachada.fotoId))?.blob ?? null : null;
    if (fotoCapa) urlCapa = URL.createObjectURL(fotoCapa);
    fachadaAssinada = Boolean(imovel.fachada) && (await idsFotosAssinadas(id)).has(imovel.fachada.fotoId);

    capa.classList.toggle('capa-sem-foto', !fotoCapa);
    capa.innerHTML = `
      ${fotoCapa
        ? `<button type="button" class="capa-foto" id="ver-fachada" aria-label="Ver a foto da fachada inteira"><img src="${urlCapa}" alt=""></button>`
        : `<div class="capa-vazia">${CASINHA_SVG}</div>`}
      <div class="capa-barra">
        <a class="pilula" href="#/">‹ Imóveis</a>
        <span class="pilula salvamento" id="salvamento" data-estado="${estadoSalvamento.estado}">${estadoSalvamento.texto}</span>
      </div>
      <div class="capa-texto">
        <p class="capa-num"><span class="num">${esc(id)}</span> <span class="selo st-${imovel.status}">${rotuloDe(STATUS, imovel.status)}</span></p>
        <p class="capa-local" id="capa-local">${esc(textoLocal(imovel))}</p>
      </div>
      <button type="button" class="botao ${fotoCapa ? 'botao-capa' : 'botao-capa-vazia'}" id="botao-fachada">
        ${fotoCapa ? 'Trocar foto' : 'Tirar foto da fachada'}
      </button>`;
  }

  capa.addEventListener('click', (e) => {
    if (e.target.closest('#ver-fachada') && fotoCapa) {
      abrirTelaCheia(fotoCapa);
    } else if (e.target.closest('#botao-fachada')) {
      if (fachadaAssinada) {
        mostrarMensagem(FOTO_ASSINADA, 'erro');
        return;
      }
      if (imovel.fachada && !confirm('Trocar a foto da fachada? A atual será apagada.')) return;
      entradaFachada.click();
    }
  });

  let sairDaAba = null;

  entradaFachada.addEventListener('change', async () => {
    const arquivo = entradaFachada.files[0];
    entradaFachada.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return; // desistiu da câmera
    const botao = capa.querySelector('#botao-fachada');
    botao.disabled = true;
    botao.textContent = 'Preparando a foto…';
    try {
      const processada = await prepararFoto(arquivo, imovel);
      imovel = await definirFachada(id, processada);
      mostrarMensagem('Foto da fachada gravada.');
    } catch (erro) {
      console.error(erro);
      mostrarMensagem(erro.message, 'erro');
    }
    await desenharCapa();
    await sairDaAba?.recarregar?.();
  });

  await desenharCapa();

  // ---------- abas ----------
  // chamado quando a aba muda o imóvel (fachada apagada, situação "Vistoriado" ao assinar)
  const aoMudarImovel = async () => {
    imovel = await obterImovel(id);
    await desenharCapa();
  };
  if (abaAtual === 'ambientes') {
    sairDaAba = await telaAmbientes(conteudo, imovel, { mostrarEstado, aoMudarImovel });
  } else if (abaAtual === 'assinaturas') {
    sairDaAba = await telaAssinaturas(conteudo, imovel, { mostrarEstado, aoMudarImovel });
  } else if (abaAtual !== 'dados') {
    conteudo.innerHTML = `<p class="vazio">${EM_BREVE[abaAtual]}</p>`;
  } else {
    sairDaAba = montarDados();
  }

  return async () => {
    await sairDaAba?.();
    if (urlCapa) URL.revokeObjectURL(urlCapa);
  };

  // ---------- aba Dados ----------
  function montarDados() {
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
    const pendentes = new Map();
    let temporizador = null;
    let gravando = Promise.resolve();

    function atualizarResumos() {
      form.querySelectorAll('details.bloco').forEach((det) => {
        const bloco = BLOCOS.find((b) => b.id === det.dataset.bloco);
        const resumo = bloco.resumo(imovel);
        const span = det.querySelector('.bloco-resumo');
        span.textContent = resumo || 'Falta preencher';
        span.classList.toggle('a-preencher', !resumo);
      });
      form.querySelector('[data-so-se-recusado]').hidden = imovel.status !== 'recusado';
      const ultima = conteudo.querySelector('#ultima-alteracao');
      if (ultima) ultima.textContent = `Última alteração: ${dataHora(imovel.atualizadoEm)}`;
      atualizarCapaTexto();
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

    const lerValor = (alvo) => (alvo.type === 'number'
      ? (alvo.value === '' ? null : Number(alvo.value))
      : alvo.value);

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
      const passo = e.target.closest('.botao-passo');
      if (passo) {
        const entrada = form.elements[passo.dataset.campo];
        const atual = entrada.value === '' ? 0 : Number(entrada.value);
        const novo = Math.min(Number(entrada.max), Math.max(Number(entrada.min), atual + Number(passo.dataset.passo)));
        entrada.value = novo;
        agendar(entrada.name, novo, true);
        return;
      }
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
      const qtdAssinaturas = (await listarAssinaturas(id)).length;
      const pergunta = qtdAssinaturas > 0
        ? `Este imóvel tem ${qtdAssinaturas} ${qtdAssinaturas === 1 ? 'assinatura' : 'assinaturas'} (termo do morador ou de recusa). Excluir apaga também as assinaturas e as fotos assinadas, sem volta. Excluir mesmo?`
        : `Excluir ${id}? Os dados e as fotos deste imóvel serão apagados deste aparelho.`;
      if (!confirm(pergunta)) return;
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

    return async () => {
      capturaGps?.parar();
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', gravar);
      await gravar();
    };
  }
}
