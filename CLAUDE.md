@H:/Meu Drive/PROMABEN/CE 07-2026 - FASE III - BERNARDO SAYAO/app_vistoria/CLAUDE.md

# vistoria-cautelar — código do app

A especificação completa está no arquivo importado acima (pasta `app_vistoria` no Drive).
Se não carregar (Drive `H:` desconectado), avisar antes de mexer em regras de negócio.

## Estrutura
- `index.html`, `manifest.json`, `service-worker.js` na raiz (publicados pelo GitHub Pages).
- `js/app.js` roteador (`#/` lista, `#/imovel/IM-001/dados|ambientes|assinaturas|laudo`,
  `#/meus-dados`), `js/db.js` IndexedDB
  (via `vendor/idb`; versão 3: `imoveis`, `config`, `ambientes`, `fotos`, `assinaturas` — histórico
  por imóvel; foto que consta numa assinatura não pode ser apagada nem trocada). Chaves de `config`:
  `proximoNumero`, `backups` (último backup de cada imóvel), `meusDados` (`{ nome, crea, art }` do
  vistoriador; o nome também vai para `vistoriadorNome`, a chave antiga),
  `js/dominio.js` listas de opções (patologias, locais, ambientes), imóvel vazio e textos dos termos,
  `js/gps.js`, `js/foto.js` (redução 1600 px, carimbo, miniatura 240 px, SHA-256),
  `js/exif.js` (hora da foto lida do EXIF, sem biblioteca), `js/area-assinatura.js` (área para
  assinar com o dedo, gera PNG), `js/zip.js` (zip sem biblioteca), `js/compartilhar.js` (folha de
  compartilhamento do celular; sem ela, baixa), `js/backup.js` (backup/restauração por imóvel),
  `js/obra.js` (dados fixos da obra e textos padrão do laudo), `js/laudo.js` (PDF com o jsPDF;
  carregado só ao tocar em "Gerar laudo"), `js/tela-*.js` uma tela por arquivo (`tela-assinaturas.js`
  = termo de ciência ou de recusa; `tela-laudo.js` = aba Laudo; `tela-meus-dados.js`).
- Compartilhar arquivo (backup, laudo) é sempre em dois toques: o 1º prepara, o 2º chama
  `compartilharArquivos` sem nenhum `await` antes (senão o iPhone não abre a folha).
- `vendor/fontes/` Barlow e Barlow Condensed (licença OFL junto); `vendor/jspdf/` (MIT);
  `img/logo-cbs.png` logo do consórcio usado no laudo.
- `tools/gerar_icones.py` gera `icons/*.png`.
- `docs/mockups/` prévias de layout (não fazem parte do app).

## Testes
`npm install` (uma vez) e `npm test` — sobe um servidor próprio na porta 8766 e roda os testes de
navegador (`tests/*.teste.mjs`) no Edge/Chrome sem janela, inclusive sem servidor (offline).
`npm test -- telas` roda só um arquivo. Rodar antes de cada commit.

## Regras do código
- A cada mudança em arquivo do app: aumentar `VERSAO` em `service-worker.js` e, se criar arquivo
  novo, incluí-lo na lista `ARQUIVOS` (senão não funciona offline).
- Mudança de estrutura do banco: aumentar `VERSAO_BANCO` em `js/db.js` e acrescentar novo bloco
  `if (versaoAntiga < N)` — nunca alterar os anteriores (o celular já tem dados).
- Sem CDN: bibliotecas em `vendor/` com a licença junto.
- Repositório **público** (GitHub Pages grátis): nunca commitar dados reais de imóveis/ocupantes.
- Commits em português, formato `tipo: descrição`, um por etapa do roadmap.
