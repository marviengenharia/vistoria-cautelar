# Layout novo + ambientes com patologias nas fotos — design curto

**Data:** 2026-11-18 · Inclui o design da foto da fachada (`2026-11-18-foto-fachada-design.md`).

## Pedidos do Leonardo
- Lista "só com a foto das casas" e um filtro de onde a equipe vai estar; a maior parte do trabalho
  será no **lado esquerdo**.
- Parâmetros de patologia que defendam a empresa num sinistro: usar as principais patologias e o
  vistoriador marca/descreve nas fotos em que aparecem.
- Filtro: "trecho das estacas próximas".

## Decisões
- **Lista:** grade 2×N de fotos (quadradas), número e situação numa faixa colorida embaixo, estaca
  numa etiqueta no canto. Filtro de lado (LE padrão / LD / os dois) e "Perto da estaca" com − e +
  (±5 estacas = ±100 m). Busca e situação recolhidas em "Buscar e filtrar". Imóvel sem estaca ou
  sem lado sempre aparece no topo (senão some ao ser criado).
  - Descartado: trechos fixos da galeria (E42–E79 tem ~750 m, grande demais); "avenida" com LE e LD
    lado a lado (o trabalho é quase todo num lado só).
- **Visual:** sinalização de obra — papel branco, tinta preta, asfalto `#262B30`, laranja de cone
  `#F26A1B` com texto preto nos botões de ação; fonte Barlow (placas de rodovia) e Barlow Condensed
  nos números; embutidas em `vendor/fontes` (offline). Modo escuro automático.
- **Imóvel:** foto da fachada no topo (capa) com número, situação e "Estaca X, lado esquerdo".
  Resumos dos blocos em frase (sem "·").
- **Patologias:** marcadas por foto (várias), mais "Sem patologia aparente" exclusiva; local, abertura
  opcional (só fissura/trinca/rachadura) e descrição. Sem faixas de mm "conforme norma" até termos a
  NBR 13752:2024.
- **Defesa:** SHA-256 de cada foto gravado e mostrado como "código de verificação".
- **Fotos em lote:** botão "Da galeria" (várias de uma vez) substitui por ora a câmera rápida.
- Foto da câmera abre direto o editor para classificar; da galeria, não (marca "Classificar").
