# Foto da fachada + miniatura na lista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campo "Foto da fachada" na aba Dados (reduzida, carimbada) e miniatura dela em cada cartão da lista.

**Architecture:** `js/foto.js` faz redução/carimbo/miniatura em canvas (sem dependências). `js/db.js` ganha o depósito `fotos` (banco versão 2) e funções da fachada. As telas `tela-imovel.js` e `tela-lista.js` só chamam essas funções. Testes de navegador com puppeteer-core + Edge contra um servidor estático em Node.

**Tech Stack:** JavaScript puro (módulos ES), IndexedDB via `vendor/idb`, Canvas/`createImageBitmap`, puppeteer-core (só desenvolvimento).

**Spec:** `docs/superpowers/specs/2026-11-18-foto-fachada-design.md`

## Global Constraints
- Foto: lado maior **1600 px**, JPEG qualidade **0.75**. Miniatura: **240 × 240**, recorte central, JPEG **0.7**.
- Carimbo: `IM-001 · 18/11/2026 14:05 · -1,443600, -48,473200 ±6 m`; sem GPS → `IM-001 · 18/11/2026 14:05 · sem GPS`.
- `VERSAO_BANCO` 1 → 2 com novo bloco `if (versaoAntiga < 2)`; bloco `< 1` não muda.
- `service-worker.js`: `VERSAO = '0.2.0'` e `js/foto.js` em `ARQUIVOS`.
- Nada de CDN; puppeteer-core só em `devDependencies`; `node_modules/` no `.gitignore` (já está).
- Textos da interface em português simples; código e comentários em português.

## Review Focus
1. Celular que já tem imóveis da versão 1 abre a versão 2: imóveis continuam lá, `fachada` ausente é tratada como sem foto (Task 2, teste `migracao`).
2. Foto em pé (retrato) sai em pé, 1200×1600 → reduzida para ~1067 de largura × 1600 (Task 1, teste `retrato`).
3. Arquivo que não é imagem escolhido no computador: aviso "Não foi possível ler essa imagem", nada gravado (Task 3, teste `arquivo-invalido`).
4. Trocar a foto apaga a antiga do depósito `fotos` (sem fotos órfãs ocupando espaço) (Task 2, teste `trocar`).
5. Cancelar a câmera (nenhum arquivo) não altera nada — `change` com `files.length === 0` é ignorado (Task 3, coberto no código; verificar manualmente).

---

### Task 1: Processamento da foto + estrutura de testes

**Files:**
- Create: `js/foto.js`
- Create: `package.json` (`"type": "module"`, devDependency `puppeteer-core@23.11.1`, script `"test": "node tests/rodar.mjs"`)
- Create: `tests/rodar.mjs` (sobe servidor estático Node na porta 8766 servindo a raiz do repo, abre Edge headless `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` com perfil temporário novo, roda cada arquivo `tests/*.teste.mjs` exportando `default async (page, base) => void`, imprime OK/FALHA, sai com código ≠ 0 se algo falhar)
- Create: `tests/foto.teste.mjs`

**Interfaces:**
- Produces:
  - `textoCarimbo(imovel: {id, gps}, data: Date) -> string`
  - `processarFoto(arquivo: Blob, carimbo: string) -> Promise<{ foto: Blob, miniatura: Blob }>` — lança `Error('Não foi possível ler essa imagem.')` se não decodificar.

- [ ] **Step 1: Testes** em `tests/foto.teste.mjs` (via `page.evaluate` importando `/js/foto.js`):
  - `paisagem`: canvas 3000×2000 → `foto` é `image/jpeg` com 1600×1067 (ler com `createImageBitmap`); `miniatura` 240×240.
  - `retrato`: canvas 1200×1600 → foto 1200×1600 (não amplia); canvas 2000×3000 → 1067×1600.
  - `carimbo`: `textoCarimbo({id:'IM-001', gps:{lat:-1.4436, lon:-48.4732, precisao:6}}, new Date(2026,10,18,14,5))` === `'IM-001 · 18/11/2026 14:05 · -1,443600, -48,473200 ±6 m'`; com `gps: null` termina em `' · sem GPS'`.
  - `invalido`: `processarFoto(new Blob(['texto'], {type:'text/plain'}), 'x')` rejeita com a mensagem acima.
  - `faixa`: pixel em (10, altura−5) da foto processada de um canvas todo branco é escuro (R < 80).
- [ ] **Step 2:** `npm install` e `npm test` → FALHA (módulo `js/foto.js` não existe).
- [ ] **Step 3: Implementar `js/foto.js`.** Decodificar com `createImageBitmap(arquivo, { imageOrientation: 'from-image' })` (corrige rotação EXIF); escala `min(1, 1600 / ladoMaior)`; faixa preta 70% de opacidade no rodapé com altura `max(28, round(altura*0.035))`, texto branco em `bold` com fonte de ~60% da faixa; `canvas.toBlob(..., 'image/jpeg', 0.75)`. Miniatura: recorte quadrado central da imagem original (sem carimbo) para 240×240, qualidade 0.7. Datas com `toLocaleString('pt-BR')` sem vírgula entre data e hora; coordenadas via `numeroBr(n, 6)` de `util.js`.
- [ ] **Step 4:** `npm test` → todos OK.
- [ ] **Step 5: Commit** `feat: processamento da foto (redução, carimbo, miniatura) + testes de navegador`

### Task 2: Banco versão 2 — depósito de fotos

**Files:**
- Modify: `js/db.js` (upgrade, novas funções, `excluirImovel`)
- Create: `tests/banco.teste.mjs`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `salvarFotoFachada(imovelId: string, { foto: Blob, miniatura: Blob }) -> Promise<imovel>` — grava `{ id: 'FOTO-' + crypto.randomUUID(), imovelId, tipo: 'fachada', blob: foto, tiradaEm }` em `fotos`, apaga a fachada anterior do imóvel (se houver) e põe `imovel.fachada = { fotoId, miniatura, tiradaEm }`, tudo numa transação `['imoveis','fotos']`.
  - `apagarFotoFachada(imovelId: string) -> Promise<imovel>` — remove a foto e põe `fachada: null`.
  - `obterFoto(fotoId: string) -> Promise<{id, imovelId, tipo, blob, tiradaEm} | undefined>`
  - `excluirImovel(id)` passa a apagar também todos os registros de `fotos` com aquele `imovelId` (índice `imovelId`).

- [ ] **Step 1: Testes** em `tests/banco.teste.mjs`:
  - `migracao`: antes de carregar o app, criar via `indexedDB.open('vistoria-cautelar', 1)` o banco v1 com `imoveis` contendo `{id:'IM-001', status:'pendente', endereco:'Rua A'}` e `config.proximoNumero = 2`; depois abrir o app → lista mostra IM-001 "Rua A"; banco está na versão 2 com depósito `fotos`; `criarImovel()` devolve `IM-002`.
  - `salvar`: `salvarFotoFachada('IM-001', {foto, miniatura})` → imóvel tem `fachada.fotoId`; `obterFoto(fotoId).blob.size === foto.size`.
  - `trocar`: salvar duas vezes → depósito `fotos` tem 1 registro para IM-001 e é o novo.
  - `apagar`: `apagarFotoFachada` → `fachada === null` e `fotos` sem registros do imóvel.
  - `excluir`: imóvel com fachada → `excluirImovel` → zero registros em `fotos` com aquele `imovelId`.
- [ ] **Step 2:** `npm test` → FALHA nos novos testes.
- [ ] **Step 3: Implementar** em `js/db.js`: `VERSAO_BANCO = 2`; bloco `if (versaoAntiga < 2) { const fotos = db.createObjectStore('fotos', { keyPath: 'id' }); fotos.createIndex('imovelId', 'imovelId'); }`; funções acima. `imovelVazio` em `dominio.js` ganha `fachada: null`.
- [ ] **Step 4:** `npm test` → todos OK.
- [ ] **Step 5: Commit** `feat: banco v2 com depósito de fotos e foto da fachada`

### Task 3: Telas — campo na aba Dados e miniatura na lista

**Files:**
- Modify: `js/tela-imovel.js` (seção da fachada acima do `<form>`, visualização em tela cheia)
- Modify: `js/tela-lista.js` (miniatura no cartão, liberar URLs ao sair)
- Modify: `css/app.css` (`.fachada`, `.miniatura`, `.tela-cheia`)
- Modify: `service-worker.js` (`VERSAO = '0.2.0'`, `js/foto.js` em `ARQUIVOS`)
- Create: `tests/telas.teste.mjs`, `tests/fachada.jpg` (gerar 1600×1200 qualquer com Pillow ou canvas; arquivo de teste sem dados reais)

**Interfaces:**
- Consumes: `processarFoto`, `textoCarimbo` (Task 1); `salvarFotoFachada`, `apagarFotoFachada`, `obterFoto` (Task 2).
- Produces: nada para outras tasks.

**Comportamento (texto fixo):**
- Sem foto: `<label class="botao botao-largo">Tirar foto da fachada<input type="file" accept="image/*" capture="environment" hidden></label>` + ajuda "A foto ajuda a achar o imóvel na lista."
- Durante o processamento: texto "Preparando a foto…" e botão desabilitado.
- Com foto: `<img class="fachada-foto">` (object URL da foto completa) — toque abre `.tela-cheia` (fecha ao tocar); botões **Trocar foto** (confirm "Trocar a foto da fachada? A atual será apagada.") e **Apagar foto** (confirm "Apagar a foto da fachada?").
- Erro: `mostrarMensagem(erro.message, 'erro')`, nada gravado.
- Lista: `<img class="miniatura" alt="">` 64×64 à esquerda do piquete; sem foto → `<span class="miniatura miniatura-vazia">` com casinha em SVG inline cinza (`--borda`). A tela da lista devolve uma função de saída que revoga os object URLs criados.

- [ ] **Step 1: Testes** em `tests/telas.teste.mjs`:
  - `tirar`: criar imóvel, `uploadFile('tests/fachada.jpg')` no input → aparece `img.fachada-foto` com `naturalWidth === 1600`; voltar à lista → cartão IM-001 tem `img.miniatura` com `naturalWidth === 240`.
  - `sem-foto`: IM-002 sem foto → cartão tem `.miniatura-vazia`.
  - `arquivo-invalido`: enviar `README.md` pelo input → mensagem contém "Não foi possível ler essa imagem"; continua sem `img.fachada-foto`.
  - `trocar-apagar`: com foto, Trocar (aceitar confirm) + novo upload → ainda 1 foto; Apagar → volta o botão "Tirar foto da fachada".
  - `offline`: depois de tudo, servidor parado (`rodar.mjs` expõe `pararServidor()`), recarregar → lista abre do cache e mostra a miniatura.
- [ ] **Step 2:** `npm test` → FALHA nos novos testes.
- [ ] **Step 3: Implementar** conforme o comportamento acima; ignorar `change` com `input.files.length === 0`; limpar `input.value` depois de usar (permite escolher o mesmo arquivo de novo).
- [ ] **Step 4:** `npm test` → todos OK; abrir http://localhost:8000 no Chrome e tirar uma foto de verdade de um arquivo do PC, conferir o carimbo visualmente.
- [ ] **Step 5: Commit** `feat: foto da fachada na aba Dados e miniatura na lista`
