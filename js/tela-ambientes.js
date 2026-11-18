// Aba Ambientes: ambientes do imóvel, fotos de cada um e marcação das patologias em cada foto.
import {
  listarAmbientes, criarAmbiente, excluirAmbiente,
  listarFotos, adicionarFoto, atualizarFoto, excluirFoto, obterFoto, obterImovel,
} from './db.js';
import {
  AMBIENTES_SUGERIDOS, PATOLOGIAS, SEM_PATOLOGIA, PATOLOGIAS_COM_ABERTURA, LOCAIS_FOTO,
} from './dominio.js';
import { processarFoto, textoCarimbo } from './foto.js';
import { esc, dataHora, mostrarMensagem, abrirTelaCheia } from './util.js';

const ESPERA_DIGITACAO_MS = 400;

/** Situação da classificação de uma foto. */
function situacaoFoto(foto) {
  if (!foto.patologias.length) return 'pendente';
  return foto.patologias.includes(SEM_PATOLOGIA) ? 'ok' : 'patologia';
}

function resumoAmbiente(fotos) {
  if (!fotos.length) return 'Nenhuma foto';
  const comPatologia = fotos.filter((f) => situacaoFoto(f) === 'patologia').length;
  const pendentes = fotos.filter((f) => situacaoFoto(f) === 'pendente').length;
  const partes = [`${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`];
  if (comPatologia) partes.push(`${comPatologia} com patologia`);
  if (pendentes) partes.push(`${pendentes} sem classificar`);
  return partes.join(', ');
}

/** Próximo nome livre: "Quarto", "Quarto 2", "Quarto 3"... */
function nomeLivre(nome, existentes) {
  const usados = new Set(existentes.map((a) => a.nome.toLowerCase()));
  if (!usados.has(nome.toLowerCase())) return nome;
  let n = 2;
  while (usados.has(`${nome} ${n}`.toLowerCase())) n += 1;
  return `${nome} ${n}`;
}

export async function telaAmbientes(conteudo, imovel, { mostrarEstado, aoMudarImovel }) {
  conteudo.innerHTML = `
    <div id="lista-ambientes"></div>
    <section class="novo-ambiente" aria-labelledby="titulo-novo-ambiente">
      <h2 class="grupo-titulo" id="titulo-novo-ambiente">Adicionar ambiente</h2>
      <div class="chips">
        ${AMBIENTES_SUGERIDOS.map((n) => `<button type="button" class="chip-botao" data-nome="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>
      <form class="outro-nome" id="form-outro-nome">
        <input type="text" name="nome" placeholder="Outro nome, ex.: Varanda" autocomplete="off" aria-label="Nome do ambiente" enterkeyhint="done">
        <button type="submit" class="botao botao-secundario">Adicionar</button>
      </form>
    </section>
    <input type="file" accept="image/*" capture="environment" id="entrada-camera" hidden>
    <input type="file" accept="image/*" multiple id="entrada-galeria" hidden>`;

  const listaEl = conteudo.querySelector('#lista-ambientes');
  const entradaCamera = conteudo.querySelector('#entrada-camera');
  const entradaGaleria = conteudo.querySelector('#entrada-galeria');

  let ambientes = [];
  let fotosPorAmbiente = new Map();
  let abertos = new Set();
  let ambienteAlvo = null; // ambiente que vai receber as fotos
  let urls = [];
  let editor = null; // { fechar: async () => void }

  const liberarUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };

  async function carregar() {
    ambientes = await listarAmbientes(imovel.id);
    fotosPorAmbiente = new Map(await Promise.all(ambientes.map(async (a) => [a.id, await listarFotos(a.id)])));
  }

  function miniatura(foto, indice) {
    const url = URL.createObjectURL(foto.miniatura);
    urls.push(url);
    const sit = situacaoFoto(foto);
    const marca = {
      pendente: '<span class="marca marca-pendente">Classificar</span>',
      ok: '<span class="marca marca-ok">✓ Sem patologia</span>',
      patologia: `<span class="marca marca-patologia">${foto.patologias.length} ${foto.patologias.length === 1 ? 'patologia' : 'patologias'}</span>`,
    }[sit];
    const capa = imovel.fachada?.fotoId === foto.id ? '<span class="marca-capa">Capa</span>' : '';
    return `<button type="button" class="miniatura-foto" data-foto="${foto.id}" aria-label="Foto ${indice + 1}: abrir para classificar">
      <img src="${url}" alt="">${capa}${marca}</button>`;
  }

  function desenhar() {
    liberarUrls();
    if (!ambientes.length) {
      listaEl.innerHTML = `<p class="vazio">Nenhum ambiente ainda.<br>Escolha abaixo o primeiro, por exemplo <strong>Fachada</strong> ou <strong>Sala</strong>.</p>`;
      return;
    }
    listaEl.innerHTML = ambientes.map((a) => {
      const fotos = fotosPorAmbiente.get(a.id) ?? [];
      return `
        <details class="bloco" data-ambiente="${a.id}" ${abertos.has(a.id) ? 'open' : ''}>
          <summary>
            <span class="bloco-titulo">${esc(a.nome)}</span>
            <span class="bloco-resumo ${fotos.length ? '' : 'a-preencher'}">${resumoAmbiente(fotos)}</span>
          </summary>
          <div class="bloco-corpo">
            ${fotos.length ? `<div class="grade-miniaturas">${fotos.map(miniatura).join('')}</div>` : ''}
            <div class="botoes-foto">
              <button type="button" class="botao" data-acao="camera">Tirar foto</button>
              <button type="button" class="botao botao-secundario" data-acao="galeria">Da galeria</button>
            </div>
            <p class="ajuda">Toque numa foto para marcar as patologias. Da galeria dá para escolher várias de uma vez.</p>
            <button type="button" class="link-perigo" data-acao="excluir-ambiente">Excluir este ambiente</button>
          </div>
        </details>`;
    }).join('');
  }

  async function recarregar() {
    await carregar();
    desenhar();
  }

  // ----- abrir/fechar: lembra quais estão abertos ao redesenhar -----
  listaEl.addEventListener('toggle', (e) => {
    const det = e.target.closest?.('details[data-ambiente]');
    if (!det) return;
    if (det.open) abertos.add(det.dataset.ambiente);
    else abertos.delete(det.dataset.ambiente);
  }, true);

  // ----- adicionar ambiente -----
  async function adicionarAmbiente(nomeDigitado) {
    const nome = nomeDigitado.trim();
    if (!nome) return;
    const novo = await criarAmbiente(imovel.id, nomeLivre(nome, ambientes));
    abertos.add(novo.id);
    await recarregar();
    listaEl.querySelector(`[data-ambiente="${novo.id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    mostrarMensagem(`Ambiente "${novo.nome}" criado.`);
  }

  conteudo.querySelector('.novo-ambiente .chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nome]');
    if (b) adicionarAmbiente(b.dataset.nome);
  });
  conteudo.querySelector('#form-outro-nome').addEventListener('submit', (e) => {
    e.preventDefault();
    const campo = e.target.elements.nome;
    adicionarAmbiente(campo.value);
    campo.value = '';
  });

  // ----- ações dentro de cada ambiente -----
  listaEl.addEventListener('click', async (e) => {
    const miniaturaEl = e.target.closest('[data-foto]');
    if (miniaturaEl) {
      const ambienteId = miniaturaEl.closest('[data-ambiente]').dataset.ambiente;
      abrirEditor(ambienteId, miniaturaEl.dataset.foto);
      return;
    }
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const ambienteId = botao.closest('[data-ambiente]').dataset.ambiente;
    const ambiente = ambientes.find((a) => a.id === ambienteId);

    if (botao.dataset.acao === 'camera' || botao.dataset.acao === 'galeria') {
      ambienteAlvo = ambienteId;
      (botao.dataset.acao === 'camera' ? entradaCamera : entradaGaleria).click();
    } else if (botao.dataset.acao === 'excluir-ambiente') {
      const n = (fotosPorAmbiente.get(ambienteId) ?? []).length;
      const aviso = n ? ` e ${n === 1 ? 'a foto dele' : `as ${n} fotos dele`}` : '';
      if (!confirm(`Excluir o ambiente "${ambiente.nome}"${aviso}?`)) return;
      const tinhaCapa = (fotosPorAmbiente.get(ambienteId) ?? []).some((f) => f.id === imovel.fachada?.fotoId);
      await excluirAmbiente(ambienteId);
      abertos.delete(ambienteId);
      if (tinhaCapa) {
        imovel = { ...imovel, fachada: null };
        await aoMudarImovel();
      }
      await recarregar();
      mostrarMensagem(`Ambiente "${ambiente.nome}" excluído.`);
    }
  });

  // ----- receber fotos -----
  async function receberFotos(arquivos, abrirDepois) {
    const ambienteId = ambienteAlvo;
    if (!arquivos.length || !ambienteId) return;
    let ultima = null;
    let falhas = 0;
    for (let i = 0; i < arquivos.length; i += 1) {
      mostrarEstado('salvando', arquivos.length > 1 ? `Foto ${i + 1} de ${arquivos.length}…` : 'Preparando…');
      try {
        const processada = await processarFoto(arquivos[i], textoCarimbo(imovel));
        ultima = await adicionarFoto(imovel.id, ambienteId, processada);
      } catch (erro) {
        console.error(erro);
        falhas += 1;
      }
    }
    mostrarEstado('ok', 'Salvo');
    abertos.add(ambienteId);
    await recarregar();
    if (falhas) {
      mostrarMensagem(falhas === arquivos.length
        ? 'Não foi possível ler essa imagem.'
        : `${falhas} de ${arquivos.length} imagens não puderam ser lidas.`, 'erro');
    }
    // foto da câmera: já abre para classificar
    if (abrirDepois && ultima) abrirEditor(ambienteId, ultima.id);
  }

  entradaCamera.addEventListener('change', () => {
    const arquivos = [...entradaCamera.files];
    entradaCamera.value = '';
    receberFotos(arquivos, true);
  });
  entradaGaleria.addEventListener('change', () => {
    const arquivos = [...entradaGaleria.files];
    entradaGaleria.value = '';
    receberFotos(arquivos, false);
  });

  // ----- editor da foto (marcar patologias) -----
  async function abrirEditor(ambienteId, fotoId) {
    if (editor) await editor.fechar(false);
    const fotos = fotosPorAmbiente.get(ambienteId) ?? [];
    const indice = fotos.findIndex((f) => f.id === fotoId);
    let foto = await obterFoto(fotoId);
    if (!foto) return;
    const ambiente = ambientes.find((a) => a.id === ambienteId);
    const urlFoto = URL.createObjectURL(foto.blob);
    const ultimaFoto = indice === fotos.length - 1;

    const grupos = [...new Set(PATOLOGIAS.map((p) => p.grupo))];
    const caixa = document.createElement('div');
    caixa.className = 'editor-foto';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-label', `${ambiente.nome}, foto ${indice + 1} de ${fotos.length}`);
    caixa.innerHTML = `
      <header class="editor-topo">
        <button type="button" class="pilula" data-editor="fechar">‹ Voltar</button>
        <span class="editor-titulo">${esc(ambiente.nome)}, foto ${indice + 1} de ${fotos.length}</span>
        <span class="pilula salvamento" data-estado="ok">Salvo</span>
      </header>
      <button type="button" class="editor-imagem" data-editor="ampliar" aria-label="Ver a foto inteira"><img src="${urlFoto}" alt=""></button>
      <form class="editor-corpo" autocomplete="off" novalidate>
        <fieldset class="campo">
          <legend>O que aparece nesta foto?</legend>
          <label class="chip chip-ok"><input type="checkbox" name="patologia" value="${SEM_PATOLOGIA}"
            ${foto.patologias.includes(SEM_PATOLOGIA) ? 'checked' : ''}><span>Sem patologia aparente</span></label>
          ${grupos.map((g) => `
            <p class="grupo-patologia">${esc(g)}</p>
            <div class="chips">${PATOLOGIAS.filter((p) => p.grupo === g).map((p) => `
              <label class="chip"><input type="checkbox" name="patologia" value="${p.valor}"
                ${foto.patologias.includes(p.valor) ? 'checked' : ''}><span>${esc(p.rotulo)}</span></label>`).join('')}
            </div>`).join('')}
        </fieldset>
        <fieldset class="campo">
          <legend>Onde</legend>
          <div class="chips">${LOCAIS_FOTO.map((l) => `
            <label class="chip"><input type="radio" name="local" value="${l.valor}" ${foto.local === l.valor ? 'checked' : ''}><span>${l.rotulo}</span></label>`).join('')}
          </div>
        </fieldset>
        <label class="campo" data-abertura>
          <span class="rotulo">Abertura medida (mm)</span>
          <input type="number" name="abertura" value="${foto.abertura ?? ''}" min="0" step="0.05" inputmode="decimal">
          <span class="ajuda">Só se mediu com o fissurômetro.</span>
        </label>
        <label class="campo">
          <span class="rotulo">Descrição</span>
          <textarea name="descricao" rows="3" placeholder="Ex.: trinca inclinada acima da porta">${esc(foto.descricao)}</textarea>
        </label>
        <p class="ajuda editor-prova">Foto tirada em ${dataHora(foto.tiradaEm)}.<br>
          Código de verificação: <code>${foto.hash ? foto.hash.slice(0, 16) : '—'}</code></p>
        <button type="button" class="botao botao-largo" data-editor="proxima">${ultimaFoto ? 'OK' : 'OK, próxima foto'}</button>
        <button type="button" class="botao botao-perigo" data-editor="excluir">Excluir esta foto</button>
      </form>`;
    document.body.append(caixa);
    document.body.classList.add('com-editor');
    caixa.querySelector('[data-editor="fechar"]').focus();

    const form = caixa.querySelector('form');
    const indicador = caixa.querySelector('.salvamento');
    const campoAbertura = caixa.querySelector('[data-abertura]');
    let temporizador = null;
    let gravando = Promise.resolve();
    let sujo = false;

    const lerFormulario = () => ({
      patologias: [...form.querySelectorAll('input[name="patologia"]:checked')].map((c) => c.value),
      local: form.querySelector('input[name="local"]:checked')?.value ?? '',
      abertura: form.elements.abertura.value === '' ? null : Number(form.elements.abertura.value),
      descricao: form.elements.descricao.value,
    });

    const mostrarAbertura = () => {
      const marcadas = lerFormulario().patologias;
      campoAbertura.hidden = !marcadas.some((p) => PATOLOGIAS_COM_ABERTURA.includes(p));
    };
    mostrarAbertura();

    function gravar() {
      clearTimeout(temporizador);
      if (!sujo) return gravando;
      sujo = false;
      const dados = lerFormulario();
      gravando = gravando.then(async () => {
        try {
          foto = await atualizarFoto(fotoId, dados);
          if (!sujo) {
            indicador.dataset.estado = 'ok';
            indicador.textContent = 'Salvo';
          }
        } catch (erro) {
          console.error(erro);
          sujo = true;
          indicador.dataset.estado = 'erro';
          indicador.textContent = 'Erro ao salvar';
        }
      });
      return gravando;
    }

    function agendar(imediato) {
      sujo = true;
      indicador.dataset.estado = 'salvando';
      indicador.textContent = 'Salvando…';
      clearTimeout(temporizador);
      if (imediato) gravar();
      else temporizador = setTimeout(gravar, ESPERA_DIGITACAO_MS);
    }

    form.addEventListener('change', (e) => {
      const alvo = e.target;
      // "Sem patologia aparente" não combina com as patologias
      if (alvo.name === 'patologia' && alvo.checked) {
        form.querySelectorAll('input[name="patologia"]').forEach((c) => {
          if (c !== alvo && (alvo.value === SEM_PATOLOGIA || c.value === SEM_PATOLOGIA)) c.checked = false;
        });
      }
      mostrarAbertura();
      agendar(alvo.type === 'checkbox' || alvo.type === 'radio');
    });
    form.addEventListener('input', (e) => {
      if (e.target.type === 'checkbox' || e.target.type === 'radio') return;
      agendar(false);
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    async function fechar(redesenhar = true) {
      await gravar();
      // atualiza as miniaturas antes de tirar o editor da frente (evita mostrar a marca antiga)
      if (redesenhar) await recarregar();
      caixa.remove();
      document.body.classList.remove('com-editor');
      URL.revokeObjectURL(urlFoto);
      editor = null;
    }
    editor = { fechar };

    caixa.addEventListener('click', async (e) => {
      const acao = e.target.closest('[data-editor]')?.dataset.editor;
      if (acao === 'fechar') {
        await fechar();
      } else if (acao === 'ampliar') {
        abrirTelaCheia(foto.blob);
      } else if (acao === 'proxima') {
        const lista = fotosPorAmbiente.get(ambienteId) ?? [];
        const proxima = lista[indice + 1];
        await fechar();
        if (proxima) await abrirEditor(ambienteId, proxima.id);
      } else if (acao === 'excluir') {
        if (!confirm('Excluir esta foto? Ela será apagada deste aparelho.')) return;
        const eraCapa = imovel.fachada?.fotoId === fotoId;
        sujo = false;
        await gravando;
        await excluirFoto(fotoId);
        await fechar();
        if (eraCapa) {
          imovel = { ...imovel, fachada: null };
          await aoMudarImovel();
        }
        mostrarMensagem('Foto excluída.');
      }
    });
  }

  await recarregar();

  const sair = async () => {
    if (editor) await editor.fechar(false);
    liberarUrls();
  };
  sair.recarregar = async () => {
    // a capa pode ter mudado (foto da fachada nova): pega o imóvel atualizado na próxima carga
    imovel = (await obterImovel(imovel.id)) ?? imovel;
    await recarregar();
  };
  return sair;
}
