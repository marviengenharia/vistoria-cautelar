// Captura do GPS: fica ouvindo o sinal por alguns segundos e guarda a leitura
// mais precisa. Para sozinho quando chega na precisão desejada ou no tempo máximo.

/**
 * @param {object} opcoes
 * @param {number} opcoes.precisaoAlvo  para quando a precisão for menor ou igual (m)
 * @param {number} opcoes.tempoMax      tempo máximo de espera (ms)
 * @param {(leitura) => void} opcoes.aoMelhorar  chamada a cada leitura melhor
 * @returns {{ resultado: Promise<{lat, lon, precisao, capturadoEm}>, parar: () => void }}
 */
export function capturarGps({ precisaoAlvo = 10, tempoMax = 30000, aoMelhorar } = {}) {
  let parar = () => {};

  const resultado = new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este aparelho não oferece GPS ao navegador.'));
      return;
    }

    let melhor = null;
    let terminado = false;
    let idObservador = null;

    const terminar = (erro) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      if (idObservador !== null) navigator.geolocation.clearWatch(idObservador);
      if (melhor) resolve(melhor);
      else reject(erro ?? new Error('Sem sinal de GPS. Vá para um lugar aberto e tente de novo.'));
    };

    parar = () => terminar();
    const temporizador = setTimeout(() => terminar(), tempoMax);

    idObservador = navigator.geolocation.watchPosition(
      (pos) => {
        const leitura = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          precisao: Math.round(pos.coords.accuracy),
          capturadoEm: new Date(pos.timestamp).toISOString(),
        };
        if (!melhor || leitura.precisao < melhor.precisao) {
          melhor = leitura;
          aoMelhorar?.(leitura);
        }
        if (leitura.precisao <= precisaoAlvo) terminar();
      },
      (erro) => {
        if (erro.code === erro.PERMISSION_DENIED) {
          terminar(new Error(
            'O GPS está bloqueado para este app. Toque no cadeado ao lado do endereço '
            + '(ou em Configurações > Apps > Chrome > Permissões) e libere a Localização.'
          ));
        }
        // outros erros (sem sinal, demora): continua tentando até o tempo máximo
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: tempoMax }
    );
  });

  return { resultado, parar: () => parar() };
}
