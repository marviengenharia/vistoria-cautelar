@H:/Meu Drive/PROMABEN/CE 07-2026 - FASE III - BERNARDO SAYAO/app_vistoria/CLAUDE.md

# vistoria-cautelar — código do app

A especificação completa está no arquivo importado acima (pasta `app_vistoria` no Drive).
Se não carregar (Drive `H:` desconectado), avisar antes de mexer em regras de negócio.

## Estrutura
- `index.html`, `manifest.json`, `service-worker.js` na raiz (publicados pelo GitHub Pages).
- `js/app.js` roteador (`#/` lista, `#/imovel/IM-001/dados`), `js/db.js` IndexedDB (via `vendor/idb`),
  `js/dominio.js` listas de opções e imóvel vazio, `js/gps.js`, `js/tela-*.js` uma tela por arquivo.
- `tools/gerar_icones.py` gera `icons/*.png`.

## Regras do código
- A cada mudança em arquivo do app: aumentar `VERSAO` em `service-worker.js` e, se criar arquivo
  novo, incluí-lo na lista `ARQUIVOS` (senão não funciona offline).
- Mudança de estrutura do banco: aumentar `VERSAO_BANCO` em `js/db.js` e acrescentar novo bloco
  `if (versaoAntiga < N)` — nunca alterar os anteriores (o celular já tem dados).
- Sem CDN: bibliotecas em `vendor/` com a licença junto.
- Repositório **público** (GitHub Pages grátis): nunca commitar dados reais de imóveis/ocupantes.
- Commits em português, formato `tipo: descrição`, um por etapa do roadmap.
