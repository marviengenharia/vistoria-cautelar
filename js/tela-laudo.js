// Aba Laudo: resumo do que vai no PDF e o botão "Gerar laudo".
// Dois toques: o 1º gera o PDF; o 2º abre o Compartilhar. No iPhone a folha de compartilhamento
// só abre se for chamada direto do toque, sem espera antes.
import {
  obterImovel, listarFotosDoImovel, listarAssinaturas, obterMeusDados, gravarMeusDados,
} from './db.js';
import { SEM_PATOLOGIA } from './dominio.js';
import { compartilharArquivos } from './compartilhar.js';
import { esc, dataHora, mostrarMensagem } from './util.js';

const ESPERA_DIGITACAO_MS = 400;
const ROTULO = 'Gerar laudo';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "Fulano (CREA 1234) · ART 99" — como sai na capa do laudo. */
function textoResponsavel({ nome, crea, art }) {
  const extras = [
    crea && (/^CREA/i.test(crea) ? crea : `CREA ${crea}`),
    art && `ART ${art}`,
  ].filter(Boolean).join(' · ');
  return extras ? `${nome} (${extras})` : nome;
}

export async function telaLaudo(conteudo, imovel, { mostrarEstado }) {
  const id = imovel.id;
  let meusDados = await obterMeusDados();
  // sem nome, o campo aparece aqui e continua até sair da aba (para corrigir o que foi digitado)
  const pedirNome = !meusDados.nome.trim();
  let pronto = null; // File do laudo já gerado, à espera do 2º toque
  let gerando = false;
  let geracao = 0; // muda quando o imóvel muda: o PDF que estiver sendo gerado já nasce velho
  let temporizador = null;
  let gravando = Promise.resolve();
  let nomePendente = null;

  conteudo.innerHTML = `
    <section class="laudo-resumo" aria-label="O que vai no laudo">
      <p id="laudo-fotos"></p>
      <p id="laudo-termo"></p>
      ${pedirNome ? '' : `<p>Responsável: ${esc(textoResponsavel(meusDados))}
        <a class="link-trocar" href="#/meus-dados">Mudar</a></p>`}
    </section>
    ${pedirNome ? `
      <label class="campo campo-destaque"><span class="rotulo">Seu nome</span>
        <input type="text" name="laudo-nome" autocapitalize="words" autocomplete="off">
        <span class="ajuda">Falta o seu nome em "Meus dados". Ele sai como responsável técnico no laudo.</span></label>` : ''}
    <button type="button" class="botao botao-largo" id="gerar-laudo">${ROTULO}</button>
    <p class="ajuda">O laudo sai em PDF, com as fotos e o termo. Depois de pronto, toque de novo para mandar
      (WhatsApp, Drive, e-mail).</p>`;

  const botao = conteudo.querySelector('#gerar-laudo');
  const entradaNome = conteudo.querySelector('input[name="laudo-nome"]');

  const temNome = () => Boolean(meusDados.nome.trim());
  function atualizarBotao() {
    if (gerando) return;
    botao.textContent = pronto ? `Compartilhar ${pronto.name}` : ROTULO;
    botao.disabled = !temNome();
  }

  async function desenharResumo() {
    imovel = (await obterImovel(id)) ?? imovel;
    const [fotos, assinaturas] = await Promise.all([listarFotosDoImovel(id), listarAssinaturas(id)]);
    const comPatologia = fotos.filter((f) => f.patologias.length && !f.patologias.includes(SEM_PATOLOGIA)).length;
    conteudo.querySelector('#laudo-fotos').textContent = fotos.length
      ? `${plural(fotos.length, 'foto', 'fotos')}, ${comPatologia || 'nenhuma'} com patologia`
      : 'Nenhuma foto ainda';
    const ultima = [...assinaturas].sort((a, b) => b.assinadoEm.localeCompare(a.assinadoEm))[0];
    const termo = conteudo.querySelector('#laudo-termo');
    termo.classList.toggle('laudo-rascunho', !ultima);
    termo.textContent = !ultima ? 'Termo ainda não assinado — o laudo sai como RASCUNHO'
      : `${ultima.tipo === 'recusa' ? 'Termo de recusa' : 'Termo'} assinado em ${dataHora(ultima.assinadoEm)}`;
  }

  function descartarArquivoPronto() {
    if (!pronto) return;
    pronto = null;
    atualizarBotao();
  }

  // ----- nome digitado aqui vai para "Meus dados" -----
  function gravarNome() {
    clearTimeout(temporizador);
    if (nomePendente === null) return gravando;
    const nome = nomePendente;
    nomePendente = null;
    gravando = gravando.then(async () => {
      try {
        await gravarMeusDados({ nome });
        if (nomePendente === null) mostrarEstado('ok', 'Salvo');
      } catch (erro) {
        console.error(erro);
        if (nomePendente === null) nomePendente = nome;
        mostrarEstado('erro', 'Erro ao salvar');
        mostrarMensagem('Não foi possível salvar o nome. Tente de novo.', 'erro');
      }
    });
    return gravando;
  }

  entradaNome?.addEventListener('input', () => {
    meusDados = { ...meusDados, nome: entradaNome.value.trim() };
    nomePendente = meusDados.nome;
    geracao += 1; // o PDF que estiver sendo gerado leva o nome antigo: nasce velho
    descartarArquivoPronto(); // o nome está dentro do PDF
    atualizarBotao();
    mostrarEstado('salvando', 'Salvando…');
    clearTimeout(temporizador);
    temporizador = setTimeout(gravarNome, ESPERA_DIGITACAO_MS);
  });

  // ----- gerar e compartilhar -----
  async function gerar() {
    gerando = true;
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    const minha = ++geracao;
    try {
      await gravarNome();
      // o gerador (e a biblioteca de PDF) só é carregado quando precisa; vem do aparelho, sem internet
      const { gerarLaudo } = await import('./laudo.js');
      const arquivo = await gerarLaudo(id, { responsavel: { ...meusDados } });
      if (minha === geracao) pronto = arquivo;
    } catch (erro) {
      console.error(erro);
      mostrarMensagem('Não foi possível gerar o laudo: ' + erro.message, 'erro');
    } finally {
      gerando = false;
      atualizarBotao();
    }
  }

  botao.addEventListener('click', () => {
    if (!pronto) {
      gerar();
      return;
    }
    const arquivo = pronto;
    // primeira coisa do toque, sem nenhum await antes (regra do iPhone)
    const envio = compartilharArquivos([arquivo], `Laudo ${id}`);
    botao.disabled = true;
    envio.then((resultado) => {
      if (resultado === 'cancelado') return; // o botão "Compartilhar" continua disponível
      if (pronto === arquivo) pronto = null;
      mostrarMensagem(resultado === 'baixado' ? `Laudo de ${id} baixado.` : `Laudo de ${id} enviado.`);
    }).catch((erro) => {
      console.error(erro);
      mostrarMensagem('Não foi possível mandar o laudo: ' + erro.message, 'erro');
    }).finally(atualizarBotao);
  });

  await desenharResumo();
  atualizarBotao();

  const sair = async () => {
    pronto = null;
    await gravarNome();
  };
  sair.descartarArquivoPronto = () => {
    geracao += 1;
    descartarArquivoPronto();
  };
  sair.recarregar = desenharResumo; // a foto da fachada mudou no topo da tela
  return sair;
}
