// Compartilha arquivos pela folha de compartilhamento do celular; se não houver, baixa.
export async function compartilharArquivos(arquivos, titulo) {
  if (navigator.canShare && navigator.share && navigator.canShare({ files: arquivos })) {
    try {
      await navigator.share({ files: arquivos, title: titulo });
      return 'compartilhado';
    } catch (erro) {
      if (erro.name === 'AbortError') return 'cancelado';
      // qualquer outra falha: cai para o download
    }
  }
  for (const arquivo of arquivos) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return 'baixado';
}
