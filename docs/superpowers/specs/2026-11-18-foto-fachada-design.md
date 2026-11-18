# Foto da fachada + miniatura na lista — design curto

**Data:** 2026-11-18 · **Tamanho:** mudança pequena

## Por quê
Na lista de imóveis, identificar a casa pela foto é mais rápido que pelo endereço
(muitos imóveis sem número ou com endereço parecido). Pedido do Leonardo.

## Objetivo
- Campo **"Foto da fachada"** no topo da aba Dados (abaixo das abas, acima dos blocos).
- **Miniatura** da fachada em cada cartão da lista; sem foto → desenho de casinha cinza.

Fora do escopo: demais fotos, ambientes, anomalias, câmera rápida (etapa 3).

## Caminhos considerados
- **A) Campo próprio na aba Dados — escolhido.** A miniatura funciona já; serve também para a
  foto do Termo de Recusa (exigida na especificação); na etapa 3 vira a 1ª foto do ambiente "Fachada".
- B) Usar a 1ª foto do ambiente "Fachada" da etapa 3. Descartado: atrasa o recurso e imóvel
  recusado/ausente (sem ambientes) ficaria sem miniatura.

## Como funciona
- Botão grande "Tirar foto da fachada" → `<input type="file" accept="image/*" capture="environment">`
  (no computador abre o seletor de arquivos).
- Com foto: imagem mostrada no lugar do botão; tocar abre em tela cheia; botões "Trocar foto" e
  "Apagar foto" (ambos pedem confirmação).
- Tratamento no aparelho (conforme especificação): corrige a rotação, lado maior **1600 px**,
  JPEG **0,75**, **carimbo** numa faixa escura no rodapé: `IM-001 · 18/11/2026 14:05 · -1,443600, -48,473200 ±6 m`.
- Miniatura separada: **240 × 240 px**, recorte central, JPEG 0,7 — usada só na lista.

## Dados
- Novo depósito `fotos` no IndexedDB (`VERSAO_BANCO` 1 → 2): `{ id, imovelId, tipo: 'fachada', blob, tiradaEm }`,
  índice `imovelId`. Já é o lugar onde as fotos da etapa 3 vão morar.
- No imóvel: `fachada: { fotoId, miniatura (Blob), tiradaEm } | null`.
- "Excluir imóvel" passa a apagar também as fotos dele.

## Decisões minhas (para conferir)
- GPS do carimbo = GPS já gravado no imóvel; se não houver, o carimbo diz "sem GPS"
  (não dispara uma nova leitura de GPS na hora da foto).
- A miniatura fica dentro do registro do imóvel (~10–15 KB) para a lista abrir numa leitura só.
- Novo arquivo `js/foto.js` (redução, carimbo, miniatura); `VERSAO` do service worker sobe para 0.2.0.

## Risco a testar no celular
Em Android com pouca memória, o sistema pode fechar o Chrome enquanto a câmera está aberta e
a foto se perde (o resto do cadastro não, pois já está gravado). Se acontecer, avaliar câmera
dentro do app na etapa 3.
