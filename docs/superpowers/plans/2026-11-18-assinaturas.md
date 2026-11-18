# Etapa 4 — Assinaturas e hora real da foto — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Assinaturas (morador, vistoriador, testemunha da recusa) que tranca só as fotos assinadas,
e carimbo/registro das fotos com a hora real em que foram tiradas.

**Architecture:** Módulos ES puros, um por responsabilidade: `exif.js` (lê a hora do JPEG),
`area-assinatura.js` (desenho com o dedo), `tela-assinaturas.js` (aba). O banco sobe para a versão 3
com a tabela `assinaturas`; as travas ficam no `db.js`, para valer em qualquer tela.

**Tech Stack:** HTML/CSS/JS puro, IndexedDB via `vendor/idb`, testes puppeteer-core + Edge (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-18-assinaturas-design.md`

## Global Constraints
- Sem biblioteca nova (assinatura feita do zero; leitor EXIF próprio).
- A cada mudança: `VERSAO` em `service-worker.js` → `'0.3.0'`; todo arquivo novo entra em `ARQUIVOS`.
- Banco: `VERSAO_BANCO = 3` e novo bloco `if (versaoAntiga < 3)`; não tocar nos blocos 1 e 2.
- Interface em português simples; blocos abrem fechados, resumo na linha do título, botão "OK, próximo".
- Rodar `npm test` antes de cada commit; commits `tipo: descrição` em português, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nenhum dado real nos testes ou fixtures (repositório público).

## Review Focus
1. Toque acidental ou risquinho na área de assinatura → não conta como assinatura (Task 3).
2. Foto da galeria sem EXIF (print, foto recebida pelo WhatsApp) → usa a data do arquivo, origem `arquivo` (Task 1).
3. EXIF em ordem de bytes `MM` (iPhone) e `II` (Android), e EXIF truncado/corrompido → lê ou cai para o
   próximo critério, sem erro (Task 1).
4. Foto assinada apagada por outro caminho (editor, excluir ambiente, trocar fachada) → bloqueado nos três (Task 2).
5. Tentar concluir a assinatura sem fotos, sem nome ou sem traço → botão recusa com mensagem clara (Task 4).

---

### Task 1: Hora real da foto (EXIF) e carimbo com segundos

**Files:**
- Create: `js/exif.js`
- Modify: `js/foto.js`, `js/tela-ambientes.js:190`, `js/tela-imovel.js:286`, `service-worker.js`
- Test: `tests/foto.teste.mjs`

**Interfaces:**
- Produces:
  - `lerHoraExif(blob: Blob): Promise<Date|null>` — `DateTimeOriginal` (tag 0x9003 no sub-IFD 0x8769);
    se faltar, `DateTime` (0x0132) do IFD0; lê só os primeiros 128 KB; qualquer erro → `null`.
  - `horaDaFoto(arquivo: File|Blob): Promise<{ data: Date, origem: 'exif'|'arquivo'|'app' }>` — EXIF,
    senão `arquivo.lastModified` (se existir e não for no futuro), senão agora.
  - `textoCarimbo(imovel, data)` passa a ter segundos: `IM-001 · 18/11/2026 14:05:32 · …`.
  - `prepararFoto(arquivo, imovel): Promise<{ foto, miniatura, hash, tiradaEm: string(ISO), origemHora }>`
    em `foto.js` = `horaDaFoto` + `textoCarimbo(imovel, data)` + `processarFoto`.

- [ ] **Step 1: Testes que falham** (em `tests/foto.teste.mjs`, dentro do `page.evaluate`)
  - Helper no teste `comExif(jpegBlob, texto, ordem)` que insere um segmento APP1 logo após o SOI com
    IFD0 → ponteiro 0x8769 → sub-IFD com 0x9003 ASCII `texto`, na ordem `'II'` ou `'MM'`.
  - `lerHoraExif(comExif(j, '2026:11:10 08:15:42', 'II'))` → `2026-11-10 08:15:42` (hora local).
  - Mesmo com `'MM'` → mesma data.
  - JPEG sem EXIF → `null`; EXIF cortado no meio (`blob.slice(0, 30)`) → `null`, sem exceção.
  - `horaDaFoto(new File([jpegSemExif], 'a.jpg', { lastModified: new Date(2026,10,9,7,0,0).getTime() }))`
    → origem `'arquivo'`, data 09/11/2026 07:00:00.
  - `textoCarimbo(..., new Date(2026,10,18,14,5,32))` → `'IM-001 · 18/11/2026 14:05:32 · -1,443600, -48,473200 ±6 m'`
    (atualizar as duas asserções de carimbo existentes para os segundos `:00`).
  - `prepararFoto(comExif(...), imovel)` → `tiradaEm` igual à hora do EXIF e `origemHora === 'exif'`.
- [ ] **Step 2:** `npm test -- foto` → FALHA (módulo `exif.js` não existe).
- [ ] **Step 3:** Implementar `js/exif.js`, os segundos no carimbo e `prepararFoto`. Trocar as duas
  chamadas `processarFoto(arquivo, textoCarimbo(imovel))` das telas por `prepararFoto(arquivo, imovel)`.
  Incluir `js/exif.js` em `ARQUIVOS`.
- [ ] **Step 4:** `npm test` → tudo OK.
- [ ] **Step 5:** Commit `feat: foto carimbada com a hora em que foi tirada (EXIF)`.

### Task 2: Banco v3 — horas da foto, tabela de assinaturas e travas

**Files:**
- Modify: `js/db.js`, `js/dominio.js`
- Create: `tests/assinaturas.teste.mjs`

**Interfaces:**
- Consumes: `prepararFoto` (Task 1) — o objeto `processada` agora traz `tiradaEm` e `origemHora`.
- Produces (todas em `db.js`):
  - Registro de foto ganha `tiradaEm` (da `processada`, ou agora), `entrouEm` (agora), `origemHora`.
  - Migração `< 3`: cria `assinaturas` (keyPath `id`, índice `imovelId`); em cada foto sem `entrouEm`,
    `entrouEm = tiradaEm` e `origemHora = 'app'`.
  - `listarFotosDoImovel(imovelId): Promise<Foto[]>` ordenadas por `tiradaEm`.
  - `obterConfig(chave)`, `gravarConfig(chave, valor)` (chave `'vistoriadorNome'`).
  - `gravarAssinatura(imovelId, dados): Promise<Assinatura>` — `dados = { tipo: 'ciencia'|'recusa', texto,
    inicio, ocupante?: {nome, documento, assinatura: Blob}, testemunha?: {nome, assinatura: Blob},
    vistoriador: {nome, assinatura: Blob}, motivoRecusa? }`. Grava `{ id: 'ASS-uuid', imovelId,
    assinadoEm, fotos: [{id, hash}] (todas as fotos do imóvel no momento), ...dados, codigo }`.
    `codigo` = SHA-256 (`impressaoDigital`) de `JSON.stringify` dos campos acima, com cada PNG trocado
    pelo seu próprio SHA-256. No `tipo: 'ciencia'`, se o status for `pendente|ausente|revisitar`,
    passa para `vistoriado` (decisão do construtor, anotada no design).
  - `listarAssinaturas(imovelId)` (mais nova primeiro); `idsFotosAssinadas(imovelId): Promise<Set<string>>`
    = união das `fotos` de todas as assinaturas.
  - Travas: `excluirFoto`, `excluirAmbiente` (se tiver foto assinada) e `definirFachada` (se a fachada
    atual for assinada) lançam `Error(FOTO_ASSINADA)`, com
    `FOTO_ASSINADA = 'Esta foto foi assinada pelo morador e não pode ser apagada.'` exportado de `dominio.js`.
  - `excluirImovel` apaga também as assinaturas.
  - `dominio.js`: `textoTermoCiencia({ id, data: Date, totalFotos })` →
    `'Declaro que acompanhei a vistoria cautelar do meu imóvel (IM-001) em 18/11/2026 e que as 32 fotos registradas mostram o estado do imóvel nesta data.'`;
    `textoTermoRecusa({ id, data, motivo })` →
    `'Declaro que presenciei, em 18/11/2026, a recusa do ocupante do imóvel IM-001 em permitir a vistoria cautelar. Motivo informado: <motivo>.'`
    (ambos rascunho, a revisar pela Raquel/jurídico).

- [ ] **Step 1: Testes que falham** (`tests/assinaturas.teste.mjs`, padrão do `banco.teste.mjs`)
  - Cria banco **v2** à mão com um imóvel e uma foto sem `entrouEm`; abre o app; versão = 3; depósito
    `assinaturas` existe; a foto antiga tem `entrouEm === tiradaEm` e `origemHora === 'app'`.
  - `gravarAssinatura` com 2 fotos → `fotos.length === 2`, `codigo` com 64 hex, status vira `vistoriado`.
  - `excluirFoto` de foto assinada → rejeita com `FOTO_ASSINADA`; foto continua lá.
  - `excluirAmbiente` com foto assinada → rejeita; `definirFachada` com fachada assinada → rejeita.
  - Foto adicionada depois da assinatura → pode ser excluída; não está em `idsFotosAssinadas`.
  - Segunda assinatura → `listarAssinaturas` devolve 2, a mais nova primeiro; a primeira continua igual.
  - `excluirImovel` → zero assinaturas restantes.
  - `textoTermoCiencia({ id: 'IM-001', data: new Date(2026,10,18), totalFotos: 32 })` igual ao texto acima.
- [ ] **Step 2:** `npm test -- assinaturas` → FALHA.
- [ ] **Step 3:** Implementar. Atualizar `banco.teste.mjs`: versão esperada 3.
- [ ] **Step 4:** `npm test` → tudo OK.
- [ ] **Step 5:** Commit `feat: banco v3 com assinaturas e trava das fotos assinadas`.

### Task 3: Área de assinatura (desenho com o dedo)

**Files:**
- Create: `js/area-assinatura.js`
- Modify: `css/app.css`, `service-worker.js`
- Test: `tests/assinaturas.teste.mjs`

**Interfaces:**
- Produces: `criarAreaAssinatura(container: HTMLElement, { aoMudar?: () => void })` →
  `{ vazia(): boolean, limpar(): void, paraPng(): Promise<Blob>, destruir(): void }`.
  - Canvas na largura do container, proporção 2:1, fundo branco, traço preto 2,5 px (× `devicePixelRatio`),
    suavizado com curvas quadráticas entre pontos médios; Pointer Events com `setPointerCapture`;
    CSS `touch-action: none` (a página não rola enquanto assina).
  - `vazia()` é verdadeiro enquanto o comprimento total desenhado for < 80 px CSS (toque ou risquinho não conta).
  - Botão "Limpar" fica fora deste módulo (a tela chama `limpar()`).
  - O tamanho do canvas é fixado na criação; girar o celular não apaga o traço (só reescala via CSS).

- [ ] **Step 1: Testes que falham** (página de teste vazia, `import('/js/area-assinatura.js')`, mouse do puppeteer)
  - Clique único → `vazia() === true`.
  - Arrasto de 200 px → `vazia() === false`; `paraPng()` → `image/png` com largura = canvas.
  - `limpar()` → `vazia() === true`.
- [ ] **Step 2:** `npm test -- assinaturas` → FALHA.
- [ ] **Step 3:** Implementar; incluir em `ARQUIVOS`; estilo `.area-assinatura` (borda grossa, linha-guia
  "Assine aqui" em cinza no rodapé, desenhada no CSS e não no PNG).
- [ ] **Step 4:** `npm test` → OK.
- [ ] **Step 5:** Commit `feat: área de assinatura com o dedo`.

### Task 4: Aba Assinaturas e marcas nas fotos

**Files:**
- Create: `js/tela-assinaturas.js`
- Modify: `js/tela-imovel.js` (aba, remover `EM_BREVE.assinaturas`, trava da troca de fachada,
  texto de ajuda da recusa), `js/tela-ambientes.js` (marcas e travas), `css/app.css`, `service-worker.js`
- Test: `tests/telas.teste.mjs`

**Interfaces:**
- Consumes: Task 2 (`gravarAssinatura`, `listarAssinaturas`, `idsFotosAssinadas`, `listarFotosDoImovel`,
  `obterConfig`/`gravarConfig`, textos do termo, `FOTO_ASSINADA`); Task 3 (`criarAreaAssinatura`).
- Produces: `telaAssinaturas(conteudo, imovel, { mostrarEstado }) → Promise<sair>`.

Comportamento:
- Tipo do termo: `recusa` se `imovel.status === 'recusado'`, senão `ciencia`.
- **Ciência**, blocos fechados com resumo:
  1. "Fotos que o morador confere" — miniaturas por ambiente, sem patologias; resumo `32 fotos em 6 ambientes`.
  2. "Morador" — nome (pré-preenchido com `ocupanteNome`), documento (opcional), texto do termo, área,
     "Limpar"; resumo `Falta assinar` / `Assinado` (antes de concluir: `Pronto para concluir`).
  3. "Vistoriador" — nome (pré-preenchido com `obterConfig('vistoriadorNome')`, gravado ao concluir), área.
- **Recusa**: motivo (somente leitura, de Dados), testemunha (nome pré-preenchido com
  `recusaTestemunha`, área), vistoriador. Exige foto da fachada e motivo; se faltar, mensagem dizendo
  onde preencher.
- Botão **"Concluir assinaturas"**. Recusa com mensagem se faltar foto (ciência), nome ou traço;
  `inicio` = menor `tiradaEm` das fotos dos ambientes. Os traços não são gravados antes de concluir
  (aviso em `.ajuda`).
- Depois de concluída: quadro "Assinado em 18/11/2026 15:42 por Fulano · 32 fotos · código `ab12…`"
  com miniaturas das assinaturas; "Histórico" com as anteriores; botão "Colher nova assinatura"
  (abre o formulário de novo, avisando que a anterior fica guardada).
- **Ambientes:** miniatura assinada ganha cadeado `🔒`; foto nova depois de uma assinatura ganha
  marca "Depois da assinatura". No editor de foto assinada: some "Excluir esta foto", aparece
  "Assinada pelo morador em …". O editor mostra "Tirada em … (hora da câmera)" e "Entrou no app em …"
  (quando a origem for `app`, só a segunda).
  "Excluir este ambiente" com foto assinada → mensagem `FOTO_ASSINADA`.
- **Capa:** fachada assinada → "Trocar foto" mostra a mensagem em vez de abrir a câmera.
- Ajuda da recusa em Dados: "O Termo de Recusa é assinado na aba Assinaturas."

- [ ] **Step 1: Testes que falham** (`tests/telas.teste.mjs`, ao fim do fluxo existente)
  - Aba Assinaturas sem fotos → "Concluir assinaturas" mostra mensagem e não grava.
  - Com fotos: preencher nome, arrastar nas duas áreas, concluir → aparece "Assinado em",
    selo da capa vira "Vistoriado".
  - Ambientes: a foto assinada tem a marca de cadeado; no editor dela não há botão "Excluir esta foto".
  - Nova foto da galeria → marca "Depois da assinatura" e pode ser excluída.
  - Imóvel recusado: sem traço da testemunha → não conclui; com traço → conclui com tipo recusa.
  - Offline: a aba Assinaturas abre (o arquivo novo está no cache).
- [ ] **Step 2:** `npm test -- telas` → FALHA.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → tudo OK; tirar prints (lista de blocos, assinatura feita, editor travado,
  modo escuro) e conferir visualmente.
- [ ] **Step 5:** Atualizar `app_vistoria/CLAUDE.md` (Drive) e o `CLAUDE.md` do repositório
  (tabela `assinaturas`, `exif.js`, `area-assinatura.js`). Commit `feat: aba Assinaturas (etapa 4)`.
