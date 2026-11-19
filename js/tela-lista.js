// Tela inicial: fotos das fachadas em grade, filtro de lado e "perto da estaca".
import { listarImoveis, criarImovel, obterImovel, listarAssinaturas } from './db.js';
import { STATUS, RAIO_ESTACAS, estacaNumero, rotuloDe } from './dominio.js';
import { esc, mostrarMensagem, CASINHA_SVG, dataHora } from './util.js';
import { imoveisSemBackup, montarBackup, registrarBackup, lerBackup, restaurarBackup } from './backup.js';
import { compartilharArquivos } from './compartilhar.js';

// Filtros continuam iguais ao voltar de um imóvel (enquanto o app estiver aberto).
const memoria = { lado: 'LE', estaca: null, situacao: 'todos', busca: '' };

const LADOS_FILTRO = [
  { valor: 'LE', rotulo: 'Lado esquerdo' },
  { valor: 'LD', rotulo: 'Lado direito' },
  { valor: 'ambos', rotulo: 'Os dois' },
];

const ARQUIVOS_POR_VEZ = 10; // alguns celulares não aceitam muitos arquivos num compartilhamento só
const DIAS_PARA_ALERTA = 2;

/** Pergunta antes de trocar o imóvel do celular pelo do backup (avisa se assinaturas vão sumir). */
async function perguntaSubstituir(atual, lido) {
  const quandoCelular = atual.atualizadoEm ?? atual.criadoEm;
  const quandoBackup = lido.atualizadoEm ?? lido.dados.geradoEm;
  const noCelular = await listarAssinaturas(atual.id);
  const noBackup = new Set(lido.dados.assinaturas.map((a) => a.id));
  const n = noCelular.length;
  const atencao = noCelular.some((a) => !noBackup.has(a.id))
    ? `Atenção: neste celular há ${n} ${n === 1 ? 'assinatura' : 'assinaturas'}; no backup, ${noBackup.size}. `
      + 'As que não estão no backup serão apagadas.\n\n'
    : '';
  const maisAntigo = quandoBackup && quandoCelular && quandoBackup < quandoCelular
    ? 'O backup é mais antigo que o que está no celular. ' : '';
  return `${atencao}${atual.id} já existe neste celular (alterado em ${dataHora(quandoCelular)}). `
    + `O backup é de ${dataHora(quandoBackup)}. ${maisAntigo}Substituir pelo backup?`;
}

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function telaLista(raiz) {
  const imoveis = (await listarImoveis()).map((im) => ({ ...im, _estaca: estacaNumero(im.estaca) }));
  const semBackup = await imoveisSemBackup();
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
      <div id="lugar-backup"></div>

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

      <div class="links-discretos">
        <a class="link-discreto" id="meus-dados" href="#/meus-dados">Meus dados</a>
        <label class="link-discreto" id="restaurar"><span>Restaurar backup</span>
          <input type="file" accept=".zip,application/zip" multiple id="entrada-restaurar" hidden></label>
      </div>
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
      <a class="cartao-foto st-${esc(im.status)}" href="#/imovel/${encodeURIComponent(im.id)}"
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

  // ---------- aviso "sem backup" ----------
  // Dois toques: o 1º prepara os arquivos; o 2º abre o Compartilhar. No iPhone a folha de
  // compartilhamento só abre se for chamada direto do toque, sem espera antes.
  // Prepara um lote de até 10 por vez (não guarda todos os arquivos na memória de uma vez).
  const lugarBackup = raiz.querySelector('#lugar-backup');
  let fila = null;   // ids sem backup no momento do 1º toque
  let feitos = 0;    // quantos da fila já tiveram o backup registrado
  let lote = null;   // { arquivos: File[], ids: string[], preparadoEm: string }

  const totalLotes = () => Math.ceil(fila.length / ARQUIVOS_POR_VEZ);
  const mensagemFeito = (ids) => (ids.length === 1 ? `Backup de ${ids[0]} feito.` : `Backup de ${ids.length} imóveis feito.`);

  function desenharBackup(pendentes) {
    fila = null;
    feitos = 0;
    lote = null;
    if (!pendentes.length) {
      lugarBackup.innerHTML = '';
      return;
    }
    const n = pendentes.length;
    const limite = Date.now() - DIAS_PARA_ALERTA * 24 * 60 * 60 * 1000;
    const alerta = pendentes.some((p) => !p.desde || Date.parse(p.desde) < limite);
    lugarBackup.innerHTML = `
      <section class="aviso-backup" data-alerta="${alerta}" aria-label="Backup">
        <p class="aviso-backup-texto"><b>${n}</b> ${n === 1 ? 'imóvel' : 'imóveis'} sem backup</p>
        ${alerta ? `<p class="aviso-backup-ajuda">Tem imóvel sem backup há mais de ${DIAS_PARA_ALERTA} dias.</p>` : ''}
        <div class="aviso-backup-botoes">
          <button type="button" class="botao botao-largo" data-backup="preparar">
            ${n === 1 ? `Fazer backup do ${esc(pendentes[0].id)}` : `Fazer backup dos ${n}`}</button>
        </div>
      </section>`;
  }

  const lugarBotoes = () => lugarBackup.querySelector('.aviso-backup-botoes');

  function rotuloLote() {
    if (lote.arquivos.length === 1) return `Compartilhar ${lote.arquivos[0].name}`;
    if (totalLotes() === 1) return `Compartilhar ${lote.arquivos.length} arquivos`;
    return `Compartilhar arquivos ${feitos + 1} a ${feitos + lote.arquivos.length}`;
  }

  async function prepararLote(botao) {
    botao.disabled = true;
    try {
      if (!fila) fila = (await imoveisSemBackup()).map((p) => p.id);
      const ids = fila.slice(feitos, feitos + ARQUIVOS_POR_VEZ);
      const preparadoEm = new Date().toISOString(); // mudança feita depois disso continua sem backup
      const arquivos = [];
      for (const [i, id] of ids.entries()) {
        botao.textContent = `Preparando ${feitos + i + 1} de ${fila.length}…`;
        arquivos.push(await montarBackup(id));
      }
      lote = { arquivos, ids, preparadoEm };
      lugarBotoes().innerHTML = `
        <button type="button" class="botao botao-largo" data-backup="compartilhar">${esc(rotuloLote())}</button>`;
    } catch (erro) {
      console.error(erro);
      mostrarMensagem('Não foi possível preparar o backup: ' + erro.message, 'erro');
      desenharBackup(await imoveisSemBackup());
    }
  }

  /** Backup do lote registrado: segue para o próximo lote ou termina. */
  async function concluirLote() {
    const { ids, preparadoEm } = lote;
    await registrarBackup(ids, preparadoEm);
    lote = null;
    feitos += ids.length;
    mostrarMensagem(mensagemFeito(ids));
    if (feitos < fila.length) {
      const proximo = feitos / ARQUIVOS_POR_VEZ + 1;
      lugarBotoes().innerHTML = `
        <button type="button" class="botao botao-largo" data-backup="preparar">Preparar próximo lote (${proximo} de ${totalLotes()})</button>`;
    } else {
      desenharBackup(await imoveisSemBackup());
    }
  }

  function compartilharLote(botao) {
    const atual = lote;
    // primeira coisa do toque, sem nenhum await antes (regra do iPhone)
    const envio = compartilharArquivos(atual.arquivos, 'Backup da vistoria');
    botao.disabled = true;
    envio.then(async (resultado) => {
      if (resultado === 'cancelado') {
        botao.disabled = false; // continua disponível para tentar de novo
        return;
      }
      if (resultado === 'baixado') {
        // "baixado" não prova que o arquivo saiu do celular (o Chrome do Android não compartilha
        // .zip): o backup só conta depois que a pessoa confirma que mandou para fora
        atual.arquivos = null; // o arquivo já está na pasta Downloads; libera a memória
        const varios = atual.ids.length > 1;
        lugarBotoes().innerHTML = `
          <p class="aviso-backup-ajuda backup-baixado">${varios
            ? 'Arquivos salvos neste celular (pasta Downloads). Mande para o Drive ou WhatsApp para o backup valer.'
            : 'Arquivo salvo neste celular (pasta Downloads). Mande para o Drive ou WhatsApp para o backup valer.'}</p>
          <button type="button" class="botao botao-largo" data-backup="ja-mandei">Já mandei para fora do celular</button>`;
        return;
      }
      await concluirLote();
    }).catch((erro) => {
      console.error(erro);
      mostrarMensagem('Não foi possível fazer o backup: ' + erro.message, 'erro');
      botao.disabled = false;
    });
  }

  async function jaMandei(botao) {
    botao.disabled = true;
    try {
      await concluirLote();
    } catch (erro) {
      console.error(erro);
      mostrarMensagem('Não foi possível registrar o backup: ' + erro.message, 'erro');
      botao.disabled = false;
    }
  }

  lugarBackup.addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao || botao.disabled) return;
    const acao = botao.dataset.backup;
    if (acao === 'compartilhar' && lote?.arquivos) compartilharLote(botao);
    else if (acao === 'ja-mandei' && lote) jaMandei(botao);
    else if (acao === 'preparar') prepararLote(botao);
  });

  // ---------- restaurar backup (uso raro: celular novo) ----------
  // Cada arquivo é conferido antes de gravar; o que falhar é avisado e o próximo segue.
  const entradaRestaurar = raiz.querySelector('#entrada-restaurar');
  entradaRestaurar.addEventListener('change', async () => {
    const arquivos = [...entradaRestaurar.files];
    entradaRestaurar.value = '';
    if (!arquivos.length) return;
    const rotulo = raiz.querySelector('#restaurar span');
    let restaurados = 0;
    let problemas = 0;
    let mantidos = 0;
    for (const [i, arquivo] of arquivos.entries()) {
      rotulo.textContent = `Restaurando ${i + 1} de ${arquivos.length}…`;
      try {
        const lido = await lerBackup(arquivo);
        const atual = await obterImovel(lido.id);
        if (atual && !confirm(await perguntaSubstituir(atual, lido))) {
          mantidos += 1;
          continue;
        }
        await restaurarBackup(lido);
        restaurados += 1;
      } catch (erro) {
        problemas += 1;
        alert(erro.message.startsWith(`${arquivo.name}:`) ? erro.message : `${arquivo.name}: ${erro.message}`);
      }
    }
    const partes = [`${restaurados} ${restaurados === 1 ? 'imóvel restaurado' : 'imóveis restaurados'}`];
    if (problemas) partes.push(`${problemas} com problema`);
    if (mantidos) partes.push(mantidos === 1 ? '1 mantido como estava' : `${mantidos} mantidos como estavam`);
    window.dispatchEvent(new HashChangeEvent('hashchange')); // desenha a lista de novo, com os restaurados
    mostrarMensagem(partes.join(', '), problemas ? 'erro' : 'normal');
  });

  desenharBackup(semBackup);
  desenhar();
  return async () => liberarUrls();
}
