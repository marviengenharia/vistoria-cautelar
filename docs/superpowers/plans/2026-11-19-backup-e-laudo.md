# Backup por imóvel + Laudo PDF — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar cada imóvel do celular num arquivo de backup (e restaurar), e gerar o laudo PDF do imóvel.

**Architecture:** Módulos ES puros, um por responsabilidade: `zip.js` (ZIP sem compressão), `compartilhar.js`
(botão Compartilhar do celular ou download), `backup.js` (montar/ler/restaurar), `obra.js` (dados fixos
da obra), `laudo.js` (PDF com jsPDF). O banco continua na versão 3; o estado de backup fica em `config`.

**Tech Stack:** HTML/CSS/JS puro, IndexedDB (`vendor/idb`), jsPDF em `vendor/jspdf`, testes puppeteer-core + Edge (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-18-backup-design.md` e `docs/superpowers/specs/2026-11-19-laudo-design.md`

## Global Constraints
- `VERSAO` em `service-worker.js` → `'0.4.0'` (na Task 1); todo arquivo novo do app entra em `ARQUIVOS`
  (senão não funciona offline) — incluindo `img/logo-cbs.png` e o arquivo do jsPDF.
- Sem CDN: jsPDF copiado para `vendor/jspdf/` com a licença (MIT) junto. Nenhuma outra biblioteca.
- Banco fica na versão 3 (sem tabela nova). Nunca alterar blocos de migração existentes.
- Interface em português simples; blocos abrem fechados com resumo no título; botões grandes.
- Nenhum dado real nos testes (repositório público). Logo e dados do consórcio são públicos (cartão CNPJ).
- `npm test` antes de cada commit; commits `tipo: descrição` em português, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Provas: nunca recomprimir nem alterar a foto carimbada, o `hash`, os PNG das assinaturas ou o `codigo`
  ao exportar, restaurar ou montar o PDF.

## Review Focus
1. Backup restaurado num celular limpo → mesmo imóvel, mesmas fotos byte a byte, `hash` e `codigo` conferem,
   fachada/miniatura da lista funcionando (Task 3).
2. Arquivo de backup alterado (um byte de uma foto ou de um PNG) → aquele imóvel não entra, mensagem diz qual
   arquivo e por quê (Task 3).
3. Mudança só numa foto (patologia) ou só numa assinatura → imóvel volta para "sem backup" (Task 2).
4. Celular sem `navigator.share` com arquivos (PC) → baixa o arquivo; usuário cancela o Compartilhar → não
   marca como "backup feito" (Task 1/2).
5. Laudo de imóvel sem assinatura, de imóvel recusado e com foto em pé (retrato) → PDF gerado, foto inteira
   com o carimbo, marca de rascunho quando não assinado (Task 4).

---

### Task 1: ZIP e Compartilhar

**Files:** Create `js/zip.js`, `js/compartilhar.js`, `tests/backup.teste.mjs` · Modify `service-worker.js`

**Interfaces — Produces:**
- `criarZip(arquivos: { nome: string, dados: Blob|Uint8Array|string }[]): Promise<Blob>` — ZIP modo
  "guardar" (método 0), CRC32, nomes UTF-8 (flag bit 11), `type: 'application/zip'`.
- `lerZip(blob: Blob): Promise<Map<string, Uint8Array>>` — lê o diretório central; confere CRC32 de cada
  arquivo; lança `Error('Arquivo de backup danificado.')` se a estrutura ou um CRC não bater. Não precisa
  ler ZIP com compressão (lança `Error('Este arquivo não foi feito pelo app.')`).
- `compartilharArquivos(arquivos: File[], titulo: string): Promise<'compartilhado'|'baixado'|'cancelado'>` —
  usa `navigator.canShare({ files })` + `navigator.share`; `AbortError` → `'cancelado'`; sem suporte →
  baixa cada arquivo com `<a download>` e devolve `'baixado'`.

- [ ] Teste (RED): ida e volta com 3 arquivos (texto com acento no nome, Uint8Array de 0–255, Blob de 300 KB)
  → mesmos bytes; ZIP gerado abre como ZIP válido (assinatura `PK\x03\x04`, diretório central `PK\x01\x02`,
  fim `PK\x05\x06`); um byte trocado no meio → `lerZip` lança "danificado"; `compartilharArquivos` no
  Edge de teste (sem share de arquivos) devolve `'baixado'`.
- [ ] Implementar; `VERSAO = '0.4.0'`; os dois arquivos em `ARQUIVOS`. `npm test` OK.
- [ ] Commit `feat: zip e compartilhar arquivos`.

### Task 2: Backup de um imóvel e aviso de "sem backup"

**Files:** Create `js/backup.js` · Modify `js/db.js`, `js/tela-imovel.js`, `js/tela-lista.js`, `css/app.css`,
`service-worker.js` · Test `tests/backup.teste.mjs`, `tests/telas.teste.mjs`

**Interfaces — Consumes:** Task 1. **Produces:**
- Em `db.js`: toda gravação que muda o imóvel ou algo dele (`atualizarImovel`, `criarAmbiente`,
  `excluirAmbiente`, `adicionarFoto`, `atualizarFoto`, `excluirFoto`, `definirFachada`, `gravarAssinatura`)
  atualiza `imovel.atualizadoEm` **na mesma transação**.
- `montarBackup(imovelId): Promise<File>` — nome `IM-012_2026-11-19.zip` (data local). Conteúdo:
  `imovel.json` = `{ formato: 1, geradoEm, imovel, ambientes, fotos, assinaturas }` onde blobs viram
  caminhos: `imovel.fachada = { fotoId, tiradaEm }` (sem miniatura), cada foto sem `blob`/`miniatura`
  (vão para `fotos/<id>.jpg` e `miniaturas/<id>.jpg`), cada pessoa de assinatura com
  `assinatura: 'assinaturas/<assId>-<ocupante|testemunha|vistoriador>.png'`. Bytes das imagens copiados sem
  alteração.
- `imoveisSemBackup(): Promise<{ id: string, desde: string }[]>` — imóveis com `atualizadoEm` posterior ao
  último backup dele (config `'backups'` = `{ [id]: ISO }`), ou sem backup; `desde` = `atualizadoEm`.
- `registrarBackup(ids: string[]): Promise<void>` — grava agora para cada id.
- Tela do imóvel (aba Dados, acima de "Excluir"): botão **"Fazer backup deste imóvel"** → `montarBackup` →
  `compartilharArquivos` → se não cancelado, `registrarBackup` e mensagem "Backup de IM-012 feito.".
- Tela inicial: aviso abaixo do placar **"3 imóveis sem backup"** + botão **"Fazer backup dos 3"**
  (compartilha os arquivos juntos, em lotes de no máximo 10); aviso com cor de alerta se algum `desde`
  tiver mais de 2 dias; sem pendentes, aviso some.
- [ ] Testes (RED): JSON e arquivos do ZIP conferem com o banco (bytes da foto iguais, hash igual);
  `atualizarFoto` só de patologia põe o imóvel em `imoveisSemBackup`; `registrarBackup` tira; UI: botão da
  tela inicial aparece com o número certo e some depois do backup (no Edge de teste, "baixado").
- [ ] Implementar; `js/backup.js` em `ARQUIVOS`; `npm test` OK; commit `feat: backup por imóvel`.

### Task 3: Restaurar backup

**Files:** Modify `js/backup.js`, `js/db.js`, `js/tela-lista.js`, `css/app.css` · Test `tests/backup.teste.mjs`, `tests/telas.teste.mjs`

**Interfaces — Consumes:** Tasks 1–2, `codigoDaAssinatura`, `impressaoDigital`. **Produces:**
- `lerBackup(arquivo: File): Promise<{ id: string, atualizadoEm: string, dados }>` — usa `lerZip`, refaz os
  Blobs (`image/jpeg`, `image/png`), confere: `impressaoDigital(foto) === foto.hash` de cada foto e
  `codigoDaAssinatura(ass) === ass.codigo` de cada assinatura. Qualquer falha lança `Error` com o motivo,
  ex.: `'IM-012_2026-11-19.zip: a foto 3 não confere com o código de verificação.'`.
- Em `db.js`: `restaurarImovel(dados)` — numa transação: apaga o que houver do mesmo imóvel (imóvel,
  ambientes, fotos, assinaturas) e grava tudo como veio (ids, hashes, códigos, horas iguais; refaz
  `imovel.fachada.miniatura` a partir da miniatura da foto da fachada); `proximoNumero` passa a ser no
  mínimo o número do imóvel + 1. Não passa pelas travas de foto assinada (é restauração).
- Restaurar conta como backup feito (`registrarBackup([id])`).
- Tela inicial: link discreto **"Restaurar backup"** → escolhe um ou vários arquivos → para cada um:
  se falhar a conferência, mensagem com o motivo e segue para o próximo; se o imóvel já existe, `confirm`
  `'IM-012 já existe neste celular (alterado em 19/11/2026 10:02). O backup é de 18/11/2026 16:40. Substituir pelo backup?'`;
  no fim, resumo "2 imóveis restaurados, 1 com problema".
- [ ] Testes (RED): ida e volta num perfil limpo (montar, apagar imóvel, restaurar) → fotos byte a byte,
  `codigoDaAssinatura` confere, travas continuam valendo, miniatura da fachada aparece na lista; byte trocado
  numa foto → rejeita com o motivo; PNG trocado → rejeita; numeração continua depois do restaurado.
- [ ] Implementar; `npm test` OK; commit `feat: restaurar backup`.

### Task 4: Gerador do laudo PDF

**Files:** Create `vendor/jspdf/` (arquivo ES module da versão 2.5.2 + `LICENSE`), `js/obra.js`, `js/laudo.js` ·
Modify `service-worker.js` · Test `tests/laudo.teste.mjs`

**Interfaces — Produces:**
- `js/obra.js`: `OBRA` (nome da obra, contratante, consórcio: nome, CNPJ, endereço, telefone — valores
  exatos do design), `LOGO_URL = 'img/logo-cbs.png'`, `TEXTOS = { objetivo, metodo, conclusao }`
  (rascunhos do mockup `docs/mockups/2026-11-19-previa-laudo.html`, com comentário "a revisar pela
  Raquel/jurídico").
- `js/laudo.js`: `gerarLaudo(imovelId, { responsavel: { nome, crea, art } }): Promise<File>` — PDF A4 com
  jsPDF seguindo o design e o mockup (ordem, cabeçalho, rodapé "página X de Y", foto inteira com
  proporção preservada, 2 por linha, legenda, quadro-resumo, termo com as imagens das assinaturas e a
  lista de códigos completos; versão de recusa; faixa "RASCUNHO — termo ainda não assinado" se não houver
  assinatura). Nome do arquivo `IM-012_<endereço sem acentos, espaços→hífen, máx. 40>_<AAAA-MM-DD>.pdf`.
- [ ] Testes (RED), em página do app com dados fictícios e as fixtures: gera `application/pdf` começando
  com `%PDF`; nº de páginas ≥ 4 (contar `/Type /Page` sem `s`); texto contém `IM-001` e `Bernardo Say`;
  sem assinatura contém `RASCUNHO`; com assinatura não contém; recusado contém `Termo de Recusa`; foto
  retrato não lança erro.
- [ ] Implementar (copiar o jsPDF de `node_modules` após `npm i -D jspdf@2.5.2`, sem carregar de CDN);
  arquivos em `ARQUIVOS`; `npm test` OK; commit `feat: gerador do laudo em PDF`.

### Task 5: Aba Laudo, "Meus dados" e documentação

**Files:** Create `js/tela-laudo.js` · Modify `js/tela-imovel.js`, `js/tela-lista.js`, `js/tela-assinaturas.js`
(se ler o nome), `css/app.css`, `service-worker.js`, `CLAUDE.md`, Drive `app_vistoria/CLAUDE.md` · Test `tests/telas.teste.mjs`

**Interfaces — Consumes:** Tasks 1, 2, 4; `obterConfig`/`gravarConfig`. **Produces:**
- Config `'meusDados' = { nome, crea, art }`; `nome` substitui e migra `'vistoriadorNome'` (ler os dois;
  gravar nos dois para não quebrar a aba Assinaturas, ou trocar a aba para `meusDados.nome`).
- Tela inicial: link discreto **"Meus dados"** → formulário simples (nome, CREA, ART) com salvamento automático.
- Aba **Laudo** (`telaLaudo(conteudo, imovel, { mostrarEstado })`): resumo em frases (nº de fotos, quantas
  com patologia, assinatura feita ou não, responsável); aviso se faltar o nome em "Meus dados" (com campo
  ali mesmo); botão **"Gerar laudo"** → `gerarLaudo` → `compartilharArquivos`; botão "Gerando…" desativado
  enquanto gera. Remove o "chega na etapa 5".
- Documentação: estrutura do `CLAUDE.md` do repositório; spec do Drive (Telas, Laudo PDF, Exportar/Backup).
- [ ] Testes (RED): "Meus dados" grava e volta preenchido; aba Laudo gera e "baixa" no Edge de teste
  (interceptar download ou espiar `compartilharArquivos`); botão desativado durante a geração; offline: aba
  Laudo abre e gera sem servidor.
- [ ] Implementar; prints 390×844 claro/escuro conferidos; `npm test` OK; commit `feat: aba Laudo e meus dados (etapa 5)`.
