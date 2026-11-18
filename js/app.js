// Ponto de entrada: escolhe a tela pelo endereço (#/...) e registra o Service Worker.
import { pedirArmazenamentoPersistente } from './db.js';
import { telaLista } from './tela-lista.js';
import { telaImovel } from './tela-imovel.js';
import { esc } from './util.js';

const raiz = document.getElementById('app');

// Cada tela devolve uma função de "saída" (grava o que estiver pendente).
let sairDaTela = null;

async function rotear() {
  if (sairDaTela) {
    await sairDaTela();
    sairDaTela = null;
  }
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (partes[0] === 'imovel' && partes[1]) {
      sairDaTela = await telaImovel(raiz, partes[1], partes[2] || 'dados');
    } else {
      sairDaTela = await telaLista(raiz);
    }
  } catch (erro) {
    console.error(erro);
    raiz.innerHTML = `
      <div class="pagina">
        <h1>Algo deu errado</h1>
        <p>${esc(erro.message)}</p>
        <a class="botao" href="#/">Voltar para a lista</a>
      </div>`;
  }
}

window.addEventListener('hashchange', rotear);
rotear();
pedirArmazenamentoPersistente().catch(() => {});

// ---------- Service Worker (funcionar sem internet) ----------
if ('serviceWorker' in navigator) {
  // Na primeira instalação não há versão antiga: não precisa recarregar.
  const jaTinhaVersao = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaTinhaVersao || recarregando) return;
    recarregando = true;
    location.reload();
  });

  const avisar = (swNovo) => {
    const aviso = document.getElementById('aviso-atualizacao');
    aviso.hidden = false;
    document.getElementById('botao-atualizar').onclick = async () => {
      if (sairDaTela) await sairDaTela(); // grava o que estiver pendente antes de recarregar
      swNovo.postMessage('pular-espera');
    };
  };

  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      novo?.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) avisar(novo);
      });
    });
  }).catch((erro) => console.error('Service Worker não registrado:', erro));
}
