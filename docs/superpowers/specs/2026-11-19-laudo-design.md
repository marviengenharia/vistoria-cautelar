# Laudo PDF por imóvel — design curto

**Data:** 2026-11-19 · Etapa 5. Prévia aprovada pelo Leonardo:
`app_vistoria/previa-laudo-IM-012.pdf` (Drive) e o HTML dela em `docs/mockups/2026-11-19-previa-laudo.html`.

## Por quê
Entregar, por imóvel, o documento que defende o consórcio num sinistro: estado do imóvel antes da obra,
fotos carimbadas com códigos de verificação e o termo assinado.

## Abordagens consideradas
- **Escolhida: jsPDF** gerando o PDF no próprio celular, sem internet (prevista na especificação),
  empacotada em `vendor/jspdf` com a licença MIT.
- Descartada: montar HTML e usar "Imprimir → salvar PDF" do navegador (no celular o resultado varia
  de aparelho para aparelho e não dá para compartilhar o arquivo direto).

## O que fica decidido
- **Só esta obra:** dados fixos no app (`js/obra.js`), sem tela de configuração de obra:
  - obra: "Macrodrenagem e Duplicação da Avenida Bernardo Sayão – Fase III e execução do sistema de
    comportas da Sub-bacia 2 — Belém/PA";
  - consórcio: Consórcio Bernardo Sayão, CNPJ 70.098.809/0001-83, Av. Júlio César, 65 — Souza —
    Belém/PA — CEP 66.613-010, (91) 3131-9800 (cartão CNPJ; e-mail do cartão fica de fora);
  - contratante: Município de Belém — PROMABEN (CE nº 07/2026) (edital, p. 1);
  - logo: `img/logo-cbs.png` (versão transparente de maior resolução, reduzida a 1400 px).
- **Responsável técnico = o vistoriador do celular:** cada celular tem "Meus dados" (nome, CREA e ART,
  estes dois opcionais), gravados na configuração do aparelho. O nome já usado nas assinaturas
  (`vistoriadorNome`) é o mesmo campo. Sem CREA/ART, a capa mostra só o nome.
- **Conteúdo e ordem** (como a prévia): 1 capa (logo, título, IM, obra, foto da fachada, endereço,
  estaca/lado, data e horário da vistoria, situação, responsável, contratante, rodapé com dados do
  consórcio); 2 objetivo; 3 método; 4 identificação e localização; 5 características e conservação;
  6 relatório fotográfico por ambiente, 2 fotos por linha, **foto inteira com o carimbo visível**,
  legenda (nº, ambiente, local, patologias ou "Sem patologia aparente", abertura, descrição, hora,
  código curto); 7 quadro-resumo das patologias; 8 conclusão; 9 termo (texto assinado, assinaturas,
  nomes, documento, início/fim, código da assinatura, lista das fotos com códigos completos).
  Cabeçalho com logo e "Laudo de Vistoria Cautelar — IM-xxx" a partir da página 2; rodapé
  "Vistoria cautelar – CBS Fase III · página X de Y".
- **Recusa:** termo vira "Termo de Recusa" com motivo, testemunha e vistoriador; relatório
  fotográfico só com o que houver (normalmente a fachada).
- **Sem assinatura:** gera assim mesmo, com a faixa "RASCUNHO — termo ainda não assinado" em todas as
  páginas.
- **Fotos depois da última assinatura** entram no relatório marcadas "depois da assinatura".
- **Textos padrão** (objetivo, método, conclusão) ficam em `js/obra.js`, marcados como rascunho a
  revisar pela Raquel/jurídico; no PDF saem sem marcação.
- **Arquivo:** `IM-012_Passagem-Exemplo-115_2026-11-19.pdf`; sai pelo mesmo Compartilhar do backup
  (sem Compartilhar, baixa).
- **Fonte:** Helvetica do jsPDF (acentos do português funcionam; a Barlow só existe em woff2).
- **Aba Laudo:** resumo do que vai no laudo (nº de fotos, patologias, assinatura sim/não), botão
  "Gerar laudo". "Meus dados" fica na tela inicial, num lugar discreto, e é pedido na primeira vez que
  gerar um laudo sem nome.

## Fora desta etapa
- Mapa no laudo; laudos em lote.
