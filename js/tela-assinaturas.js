// Aba Assinaturas: o morador assina que as fotos mostram o estado do imóvel (termo de ciência)
// ou, se o imóvel foi recusado, a testemunha assina o termo de recusa. O vistoriador assina sempre.
// Os traços só são gravados ao tocar em "Concluir assinaturas".
import {
  obterImovel, listarAmbientes, listarFotosDoImovel, listarAssinaturas, gravarAssinatura,
  obterMeusDados, gravarMeusDados,
} from './db.js';
import { textoTermoCiencia, textoTermoRecusa, FOTOS_MUDARAM } from './dominio.js';
import { criarAreaAssinatura } from './area-assinatura.js';
import { esc, dataHora, mostrarMensagem, abrirTelaCheia } from './util.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "Assinado em 18/11/2026 15:42 por Fulano · 32 fotos · código ab12…" */
function linhaAssinatura(a) {
  const quem = a.tipo === 'recusa'
    ? `Recusa registrada em ${dataHora(a.assinadoEm)} · testemunha ${a.testemunha?.nome ?? ''}`
    : `Assinado em ${dataHora(a.assinadoEm)} por ${a.ocupante?.nome ?? ''}`;
  return `${quem} · ${plural(a.fotos.length, 'foto', 'fotos')} · código ${a.codigo.slice(0, 16)}…`;
}

export async function telaAssinaturas(conteudo, imovel, { mostrarEstado, aoMudarImovel }) {
  let fotos = [];
  let ambientes = [];
  let assinaturas = [];
  let nomeVistoriador = '';
  let colhendoNova = false;
  let urls = [];
  let areas = {}; // bloco -> área de assinatura (criada quando o bloco abre pela primeira vez)
  let termo = '';
  let idsFotosConferidas = []; // fotos mostradas no formulário: são elas que a assinatura cobre

  const liberarUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
  const urlDe = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const destruirAreas = () => { Object.values(areas).forEach((a) => a.destruir()); areas = {}; };
  const tipo = () => (imovel.status === 'recusado' ? 'recusa' : 'ciencia');
  const motivo = () => (imovel.recusaMotivo ?? '').trim();

  async function carregar() {
    imovel = (await obterImovel(imovel.id)) ?? imovel;
    [ambientes, fotos, assinaturas, nomeVistoriador] = await Promise.all([
      listarAmbientes(imovel.id), listarFotosDoImovel(imovel.id), listarAssinaturas(imovel.id),
      obterMeusDados().then((m) => m.nome),
    ]);
  }

  function textoDoTermo() {
    const data = new Date();
    return tipo() === 'recusa'
      ? textoTermoRecusa({ id: imovel.id, data, motivo: motivo() })
      : textoTermoCiencia({ id: imovel.id, data, totalFotos: fotos.length });
  }

  // ---------- blocos do formulário ----------

  function blocoFotos() {
    const grupos = ambientes
      .map((a) => ({ nome: a.nome, fotos: fotos.filter((f) => f.ambienteId === a.id) }))
      .filter((g) => g.fotos.length);
    const resumo = fotos.length
      ? `${plural(fotos.length, 'foto', 'fotos')} em ${plural(grupos.length, 'ambiente', 'ambientes')}`
      : '';
    const corpo = grupos.length
      ? grupos.map((g) => `
          <p class="grupo-patologia">${esc(g.nome)}</p>
          <div class="grade-miniaturas">${g.fotos.map((f) => `
            <button type="button" class="miniatura-foto" data-ver-foto="${esc(f.id)}" aria-label="Ver a foto inteira">
              <img src="${urlDe(f.miniatura)}" alt=""></button>`).join('')}
          </div>`).join('')
        + '<p class="ajuda">Toque numa foto para ver inteira. O morador confere só se as fotos mostram o imóvel como está hoje.</p>'
      : '<p class="ajuda">Ainda não há fotos. Tire as fotos na aba Ambientes.</p>';
    return { id: 'fotos', titulo: 'Fotos que o morador confere', resumo, corpo };
  }

  function blocoRecusa() {
    const fachada = imovel.fachada ? fotos.find((f) => f.id === imovel.fachada.fotoId) : null;
    return {
      id: 'recusa',
      titulo: 'Recusa',
      resumo: motivo(),
      resumoVazio: 'Falta o motivo',
      corpo: `
        <p class="campo"><span class="rotulo">Motivo da recusa</span>${motivo() ? esc(motivo()) : '<em>Não preenchido</em>'}</p>
        <p class="campo"><span class="rotulo">Foto da fachada</span>${fachada
          ? `<button type="button" class="miniatura-foto miniatura-unica" data-ver-foto="${fachada.id}" aria-label="Ver a foto inteira"><img src="${urlDe(fachada.miniatura)}" alt=""></button>`
          : '<em>Ainda sem foto. Tire no topo da tela.</em>'}</p>
        <p class="ajuda">Para mudar o motivo ou a testemunha, vá na aba Dados, bloco Situação.</p>`,
    };
  }

  function blocoPessoa(id, titulo, campos, comTermo) {
    return {
      id,
      titulo,
      resumo: '', // preenchido por atualizarResumos()
      corpo: `
        ${campos}
        ${comTermo ? `<p class="termo">${esc(termo)}</p>` : ''}
        <div class="campo">
          <span class="rotulo">Assinatura</span>
          <div class="lugar-area" data-area="${id}"></div>
          <button type="button" class="botao botao-secundario botao-limpar" data-limpar="${id}">Limpar</button>
        </div>`,
    };
  }

  const campoTexto = (titulo, nome, valor, extra = '') => `
    <label class="campo"><span class="rotulo">${titulo}</span>
      <input type="text" name="${nome}" value="${esc(valor)}" autocomplete="off" ${extra}></label>`;

  function blocosDoFormulario() {
    if (tipo() === 'recusa') {
      return [
        blocoRecusa(),
        blocoPessoa('testemunha', 'Testemunha',
          campoTexto('Nome da testemunha', 'testemunhaNome', imovel.recusaTestemunha, 'readonly')
          + '<p class="ajuda">O nome vem da aba Dados. Para mudar, vá na aba Dados, bloco Situação.</p>', true),
        blocoPessoa('vistoriador', 'Vistoriador',
          campoTexto('Nome do vistoriador', 'vistoriadorNome', nomeVistoriador ?? '', 'autocapitalize="words"'), false),
      ];
    }
    return [
      blocoFotos(),
      blocoPessoa('morador', 'Morador',
        campoTexto('Nome do morador', 'moradorNome', imovel.ocupanteNome, 'autocapitalize="words"')
        + campoTexto('Documento (opcional)', 'moradorDocumento', '', 'placeholder="RG ou CPF"'), true),
      blocoPessoa('vistoriador', 'Vistoriador',
        campoTexto('Nome do vistoriador', 'vistoriadorNome', nomeVistoriador ?? '', 'autocapitalize="words"'), false),
    ];
  }

  function htmlBloco(b, ultimo) {
    return `
      <details class="bloco" data-bloco="${b.id}">
        <summary>
          <span class="bloco-titulo">${b.titulo}</span>
          <span class="bloco-resumo ${b.resumo ? '' : 'a-preencher'}">${esc(b.resumo || b.resumoVazio || 'Falta preencher')}</span>
        </summary>
        <div class="bloco-corpo">
          ${b.corpo}
          <button type="button" class="botao botao-largo ok-proximo">${ultimo ? 'OK' : 'OK, próximo'}</button>
        </div>
      </details>`;
  }

  // ---------- desenho ----------

  function desenhar() {
    liberarUrls();
    destruirAreas();
    if (assinaturas.length && !colhendoNova) desenharFeita();
    else desenharFormulario();
  }

  function imagensAssinatura(a) {
    const pessoas = [
      a.ocupante && { rotulo: 'Morador', ...a.ocupante },
      a.testemunha && { rotulo: 'Testemunha', ...a.testemunha },
      { rotulo: 'Vistoriador', ...a.vistoriador },
    ].filter(Boolean);
    return `<div class="assinaturas-imagens">${pessoas.map((p) => `
      <figure><img src="${urlDe(p.assinatura)}" alt="Assinatura de ${esc(p.nome)}">
        <figcaption>${p.rotulo}: ${esc(p.nome)}</figcaption></figure>`).join('')}</div>`;
  }

  function desenharFeita() {
    const [ultima, ...anteriores] = assinaturas;
    const assinadas = new Set(ultima.fotos.map((f) => f.id));
    const novas = fotos.filter((f) => !assinadas.has(f.id)).length;
    conteudo.innerHTML = `
      <section class="assinatura-feita" aria-label="Assinatura concluída">
        <p class="assinatura-linha">${esc(linhaAssinatura(ultima))}</p>
        <p class="termo">${esc(ultima.texto)}</p>
        ${imagensAssinatura(ultima)}
      </section>
      ${novas ? `<p class="aviso-novas">${plural(novas, 'foto foi tirada', 'fotos foram tiradas')} depois desta assinatura.
        ${ultima.tipo === 'recusa'
          ? 'Para que elas constem numa assinatura, colha uma nova.'
          : 'Para o morador conferir, colha uma nova assinatura.'}</p>` : ''}
      <p class="ajuda">As fotos assinadas não podem ser apagadas. A classificação das fotos e a aba Dados continuam livres para completar.</p>
      ${anteriores.length ? `
        <details class="bloco" data-bloco="historico">
          <summary>
            <span class="bloco-titulo">Histórico</span>
            <span class="bloco-resumo">${plural(anteriores.length, 'assinatura anterior', 'assinaturas anteriores')}</span>
          </summary>
          <div class="bloco-corpo">${anteriores.map((a) => `
            <div class="historico-item">
              <p class="assinatura-linha">${esc(linhaAssinatura(a))}</p>
              ${imagensAssinatura(a)}
            </div>`).join('')}
          </div>
        </details>` : ''}
      <button type="button" class="botao botao-largo botao-secundario" id="nova-assinatura">Colher nova assinatura</button>`;
  }

  function desenharFormulario() {
    termo = textoDoTermo();
    idsFotosConferidas = fotos.map((f) => f.id);
    const blocos = blocosDoFormulario();
    conteudo.innerHTML = `
      ${colhendoNova ? `<p class="aviso-novas">A assinatura anterior fica guardada no histórico.
        A nova cobre todas as fotos de agora.</p>` : ''}
      <form id="form-assinaturas" autocomplete="off" novalidate>
        <fieldset class="sem-moldura">
          ${blocos.map((b, i) => htmlBloco(b, i === blocos.length - 1)).join('')}
        </fieldset>
      </form>
      <p class="ajuda">As assinaturas só ficam gravadas ao tocar em "Concluir assinaturas".
        Se sair desta aba antes, será preciso assinar de novo.</p>
      <button type="button" class="botao botao-largo" id="concluir-assinaturas">Concluir assinaturas</button>
      ${colhendoNova ? '<button type="button" class="link-perigo" id="cancelar-nova">Cancelar</button>' : ''}`;
    atualizarResumos();
  }

  const valor = (nome) => conteudo.querySelector(`[name="${nome}"]`)?.value.trim() ?? '';
  const assinada = (id) => Boolean(areas[id] && !areas[id].vazia());
  const campoNome = { morador: 'moradorNome', testemunha: 'testemunhaNome', vistoriador: 'vistoriadorNome' };

  function atualizarResumos() {
    Object.entries(campoNome).forEach(([id, nome]) => {
      const span = conteudo.querySelector(`details[data-bloco="${id}"] .bloco-resumo`);
      if (!span) return;
      let texto = 'Pronto para concluir';
      if (!assinada(id)) texto = 'Falta assinar';
      else if (!valor(nome)) texto = 'Falta o nome';
      span.textContent = texto;
      span.classList.toggle('a-preencher', texto !== 'Pronto para concluir');
    });
  }

  // cria a área só quando o bloco abre (com o bloco fechado a largura seria zero)
  conteudo.addEventListener('toggle', (e) => {
    const det = e.target;
    if (!det.matches?.('details.bloco') || !det.open) return;
    const lugar = det.querySelector('[data-area]');
    if (!lugar || areas[lugar.dataset.area]) return;
    areas[lugar.dataset.area] = criarAreaAssinatura(lugar, { aoMudar: atualizarResumos });
  }, true);

  conteudo.addEventListener('input', atualizarResumos);

  // ---------- concluir ----------

  function falta(bloco, texto) {
    mostrarMensagem(texto, 'erro');
    const det = bloco && conteudo.querySelector(`details[data-bloco="${bloco}"]`);
    if (det) {
      det.open = true;
      det.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    return false;
  }

  function validar() {
    const pessoa = (id, quem, onde) => {
      if (!valor(campoNome[id])) return falta(id, `Falta o nome ${quem} (bloco ${onde}).`);
      if (!assinada(id)) return falta(id, `Falta a assinatura ${quem} (bloco ${onde}).`);
      return true;
    };
    if (tipo() === 'recusa') {
      if (!imovel.fachada) return falta(null, 'Falta a foto da fachada. Tire a foto no topo da tela.');
      if (!motivo()) return falta(null, 'Falta o motivo da recusa. Preencha na aba Dados, bloco Situação.');
      if (!valor('testemunhaNome')) return falta(null, 'Falta o nome da testemunha. Preencha na aba Dados, bloco Situação.');
      return pessoa('testemunha', 'da testemunha', 'Testemunha') && pessoa('vistoriador', 'do vistoriador', 'Vistoriador');
    }
    if (!fotos.length) return falta(null, 'Não há fotos para o morador conferir. Tire as fotos na aba Ambientes.');
    return pessoa('morador', 'do morador', 'Morador') && pessoa('vistoriador', 'do vistoriador', 'Vistoriador');
  }

  /** Trava (ou libera) o formulário e os botões enquanto grava. */
  function travar(sim) {
    const fieldset = conteudo.querySelector('#form-assinaturas fieldset');
    if (fieldset) fieldset.disabled = sim;
    const botao = conteudo.querySelector('#concluir-assinaturas');
    if (botao) {
      botao.disabled = sim;
      botao.textContent = sim ? 'Gravando…' : 'Concluir assinaturas';
    }
    const cancelar = conteudo.querySelector('#cancelar-nova');
    if (cancelar) cancelar.disabled = sim;
  }

  async function concluir() {
    if (!validar()) return;
    // a data do termo é a de hoje: se virou o dia com a tela aberta, mostra o texto novo antes
    const texto = textoDoTermo();
    if (texto !== termo) {
      termo = texto;
      conteudo.querySelectorAll('form .termo').forEach((p) => { p.textContent = texto; });
      mostrarMensagem('O texto do termo mudou de data. Confira e toque de novo em "Concluir assinaturas".', 'erro');
      return;
    }
    // as imagens saem todas juntas, antes de qualquer espera, e o formulário trava
    const quem = tipo() === 'recusa' ? 'testemunha' : 'morador';
    const pngs = Promise.all([areas.vistoriador.paraPng(), areas[quem].paraPng()]);
    travar(true);
    mostrarEstado('salvando', 'Salvando…');
    const vistoriadorNome = valor('vistoriadorNome');
    try {
      const [pngVistoriador, pngOutro] = await pngs;
      const dados = {
        tipo: tipo(), texto, inicio: fotos[0]?.tiradaEm ?? null, idsFotosConferidas,
        vistoriador: { nome: vistoriadorNome, assinatura: pngVistoriador },
      };
      if (dados.tipo === 'recusa') {
        dados.testemunha = { nome: valor('testemunhaNome'), assinatura: pngOutro };
        dados.motivoRecusa = motivo();
      } else {
        dados.ocupante = { nome: valor('moradorNome'), documento: valor('moradorDocumento'), assinatura: pngOutro };
      }
      await gravarAssinatura(imovel.id, dados);
    } catch (erro) {
      if (erro.message === FOTOS_MUDARAM) {
        // quem assina não viu essas fotos: recarrega a tela para conferir e assinar de novo
        mostrarEstado('erro', 'Não gravado');
        await carregar();
        desenhar();
        mostrarMensagem(FOTOS_MUDARAM, 'erro');
        return;
      }
      console.error(erro);
      mostrarEstado('erro', 'Erro ao salvar');
      mostrarMensagem('Não foi possível gravar as assinaturas. Tente de novo.', 'erro');
      travar(false);
      return;
    }
    // a assinatura já está gravada: falha ao lembrar o nome não é falha da assinatura
    try {
      await gravarMeusDados({ nome: vistoriadorNome }); // é o mesmo nome de "Meus dados"
    } catch (erro) {
      console.error(erro);
    }
    mostrarEstado('ok', 'Salvo');
    colhendoNova = false;
    await carregar();
    desenhar();
    await aoMudarImovel(); // a situação pode ter passado para "Vistoriado"
    window.scrollTo({ top: 0, behavior: 'smooth' });
    mostrarMensagem('Assinaturas gravadas.');
  }

  conteudo.addEventListener('submit', (e) => e.preventDefault());
  conteudo.addEventListener('click', async (e) => {
    const ver = e.target.closest('[data-ver-foto]');
    if (ver) {
      const foto = fotos.find((f) => f.id === ver.dataset.verFoto);
      if (foto) abrirTelaCheia(foto.blob);
      return;
    }
    const limpar = e.target.closest('[data-limpar]');
    if (limpar) {
      areas[limpar.dataset.limpar]?.limpar();
      return;
    }
    const ok = e.target.closest('.ok-proximo');
    if (ok) {
      const atual = ok.closest('details.bloco');
      atual.open = false;
      const proximo = atual.nextElementSibling;
      if (proximo?.matches('details.bloco')) {
        proximo.open = true;
        proximo.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        conteudo.querySelector('#concluir-assinaturas')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    if (e.target.closest('#concluir-assinaturas')) {
      await concluir();
    } else if (e.target.closest('#nova-assinatura')) {
      colhendoNova = true;
      desenhar();
    } else if (e.target.closest('#cancelar-nova')) {
      colhendoNova = false;
      desenhar();
    }
  });

  await carregar();
  desenhar();

  const sair = async () => {
    destruirAreas();
    liberarUrls();
  };
  // chamado quando a foto da fachada muda no topo da tela
  sair.recarregar = async () => {
    await carregar();
    if (!conteudo.querySelector('#form-assinaturas')) {
      desenhar();
      return;
    }
    // formulário aberto: troca só o primeiro bloco (fotos ou recusa) e mantém os traços
    const antes = new Set(idsFotosConferidas);
    idsFotosConferidas = fotos.map((f) => f.id);
    const mudouFotos = antes.size !== idsFotosConferidas.length || idsFotosConferidas.some((id) => !antes.has(id));
    const [primeiro] = blocosDoFormulario();
    const antigo = conteudo.querySelector(`details[data-bloco="${primeiro.id}"]`);
    const aberto = antigo.open;
    antigo.outerHTML = htmlBloco(primeiro, false);
    conteudo.querySelector(`details[data-bloco="${primeiro.id}"]`).open = aberto;
    const texto = textoDoTermo();
    if (texto !== termo) {
      termo = texto;
      conteudo.querySelectorAll('form .termo').forEach((p) => { p.textContent = texto; });
    }
    if (mudouFotos) {
      // quem assinou viu outras fotos: assina de novo
      areas.morador?.limpar();
      areas.testemunha?.limpar();
      mostrarMensagem(tipo() === 'recusa'
        ? 'As fotos mudaram. A testemunha precisa assinar de novo.'
        : 'As fotos mudaram. O morador precisa assinar de novo.', 'erro');
    }
  };
  return sair;
}
