# Etapa 4 — Assinaturas na tela — design curto

**Data:** 2026-11-18

## Pedido do Leonardo
- O morador assina **só que as fotos mostram o estado do imóvel**. Ele não confere as patologias:
  não tem conhecimento técnico para isso.
- O vistoriador precisa **continuar mexendo na vistoria depois** para completar as informações.
- Área de assinatura feita no próprio app (sem biblioteca de fora).

## Objetivo
Num sinistro, provar que o morador viu e aceitou aquelas fotos naquela data e que elas não foram
trocadas depois. A classificação técnica (patologias, descrição) fica com o vistoriador e pode ser
completada a qualquer momento.

## Abordagens consideradas
1. Biblioteca `signature_pad`: traço mais parecido com caneta, mas é código de terceiros.
2. **Área de desenho própria (escolhida pelo Leonardo):** cerca de 60 linhas, sem dependência; traço de
   espessura fixa, suavizado.
- Trava da vistoria inteira (tudo fica bloqueado ao assinar): descartada, porque o vistoriador
  precisa completar depois.

## O que fica decidido
- **Aba Assinaturas**, em blocos que abrem fechados, com resumo no título:
  1. **Fotos que o morador confere:** miniaturas por ambiente, sem patologias, com o total.
  2. **Morador:** nome legível, documento (opcional), texto do termo e área para assinar com
     o botão "Limpar".
  3. **Vistoriador:** nome (lembrado pelo app para os próximos imóveis) e área para assinar,
     em todo imóvel.
  4. **Recusa** (só aparece se a situação for "Recusado"): mostra o motivo, pede o nome e a assinatura
     da testemunha e a assinatura do vistoriador. Exige a foto da fachada.
- **Texto do termo (rascunho, a revisar pela Raquel ou pelo jurídico):** "Declaro que acompanhei a
  vistoria cautelar do meu imóvel em DATA e que as N fotos registradas mostram o estado do imóvel
  nesta data." O texto exato que aparece na tela é gravado junto com a assinatura.
- **O que a assinatura tranca:** só as fotos assinadas.
  - As fotos assinadas não podem ser apagadas. A foto da fachada assinada não pode ser trocada.
  - Patologias, local, abertura, descrição e a aba Dados continuam editáveis.
  - Pode-se tirar foto nova depois; ela aparece marcada "depois da assinatura".
  - O vistoriador pode colher uma assinatura nova, que cobre todas as fotos. A anterior fica guardada
    no histórico e nunca é apagada.
- **Registro da assinatura:** data e hora, tipo (ciência ou recusa), lista das fotos com os códigos
  de verificação, texto do termo, nomes, documento e imagens das assinaturas (PNG). Inclui também um
  código de verificação do conjunto (SHA-256).
- **Início da vistoria:** hora da primeira foto de um ambiente. **Fim:** hora da assinatura.
- **Banco:** versão 3, nova tabela `assinaturas` (por imóvel). Nenhuma mudança nas tabelas antigas.

## Hora da foto (pedido do Leonardo na aprovação)
- Hoje o carimbo e o `tiradaEm` usam a hora em que a foto **entra no app**. Para foto da galeria
  tirada antes, essa hora está errada.
- Passa a valer a **hora em que a foto foi tirada**, lida dos dados internos do JPEG (EXIF
  `DateTimeOriginal`, com leitor próprio de ~50 linhas, sem biblioteca). Se não houver EXIF, usa a data
  do arquivo (`lastModified`). Se nem isso houver, usa a hora da entrada no app.
- O carimbo na imagem mostra a hora **com segundos**: `IM-001 · 18/11/2026 14:05:32 · …`.
- O registro guarda as duas horas: `tiradaEm` (quando foi tirada) e `entrouEm` (quando entrou no app),
  além da origem da hora (`exif`, `arquivo` ou `app`). A tela da foto mostra as duas.
  Motivo: a hora do EXIF vem do relógio do celular; a hora de entrada mostra quando o app recebeu a foto.
- Fotos antigas (sem `entrouEm`) continuam funcionando; a migração do banco v3 copia `tiradaEm` para
  `entrouEm` e marca a origem `app`.

## Decisões do construtor (a conferir)
- Ao concluir o termo de ciência, a situação passa sozinha para "Vistoriado" (se estava pendente,
  ausente ou a revisitar).
- Os traços só são gravados ao tocar em "Concluir assinaturas"; sair da aba antes disso perde os traços.
- Excluir o imóvel inteiro continua possível (com confirmação) e apaga também as assinaturas.

## Fica a cargo de quem constrói
- Suavização do traço, tamanho da área (largura toda, proporção 2:1) e o traço mínimo para aceitar
  a assinatura (evitar que um toque acidental vire assinatura).
- Como mostrar o histórico de assinaturas.

## Fora desta etapa
- PDF do termo de ciência e do Termo de Recusa: etapa 5.
