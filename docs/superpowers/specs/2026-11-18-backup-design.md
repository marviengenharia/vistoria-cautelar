# Backup por imóvel e restauração — design curto

**Data:** 2026-11-18 · Etapa 6 antecipada (antes do laudo), a pedido do Leonardo.

## Por quê
As fotos tiradas no app existem só dentro do app. Se o celular quebrar, for roubado ou o app for
apagado, perde-se a prova. O backup tira cada imóvel do celular e permite restaurar em outro.

## Abordagens consideradas
- **Escolhida: um arquivo por imóvel (A)**, enviado pelo botão Compartilhar do celular (Drive, WhatsApp, e-mail).
- Descartadas: um arquivo único com tudo (cresce até ~2 GB, ninguém manda pelo 4G); um arquivo por dia
  só com o que mudou (para restaurar precisa de todos, na ordem; faltou um, restaura errado sem avisar).
- Envio automático para o Drive da Marvi: **fica para depois**. Exige cadastro no Google Cloud e
  login no app; mandará exatamente estes mesmos arquivos.

## O que fica decidido
- **Arquivo** `IM-012_2026-11-18.zip` com:
  - `imovel.json`: dados do imóvel, ambientes, fotos (sem a imagem), assinaturas (sem os PNG), versão do
    formato (1), versão do app e data do backup;
  - `fotos/<id>.jpg` (foto carimbada), `miniaturas/<id>.jpg`, `assinaturas/<id>-<pessoa>.png`.
  - Abre no computador do escritório: as fotos carimbadas ficam visíveis numa pasta.
- **ZIP feito no próprio app**, sem biblioteca: modo "guardar" (sem compressão, JPEG e PNG já são
  comprimidos), com CRC32. Lê só ZIPs feitos pelo app.
- **Onde fica o botão:**
  - na tela do imóvel: "Fazer backup deste imóvel";
  - na tela inicial: aviso "3 imóveis sem backup" com botão "Fazer backup dos 3" (compartilha os
    arquivos juntos); o aviso fica vermelho se algum estiver sem backup há mais de 2 dias;
  - "Restaurar backup" num lugar discreto da tela inicial (uso raro).
- **Sem o botão Compartilhar** (ex.: computador): o arquivo é baixado.
- **"Sem backup"** = imóvel com alguma mudança (dados, ambientes, fotos, patologias ou assinaturas)
  depois do último backup dele. Cada mudança marca a hora no imóvel; a data do último backup de cada
  imóvel fica na configuração.
- **Restaurar:**
  - escolhe um ou vários arquivos;
  - confere o código de verificação de cada foto e de cada assinatura; se algo não bater, aquele imóvel
    **não** é restaurado e o app diz qual arquivo e por quê;
  - se o imóvel já existe no celular, pergunta se substitui, mostrando qual dos dois é mais recente;
  - a numeração dos imóveis novos continua depois do maior número restaurado.
- **Banco:** sem tabela nova.

## Fora desta etapa
- Envio automático para o Drive; planilha CSV e KML (continuam na etapa 6, depois).

## A cargo de quem constrói
- Texto e posição exatos dos botões e do aviso, seguindo o visual atual.
- Limite de arquivos por compartilhamento (alguns celulares limitam): dividir em lotes se precisar.
