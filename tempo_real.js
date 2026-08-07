const { WebSocketServer } = require('ws');

// Canal de tempo real bem simples: quando uma pauta ou sugestão muda, avisa
// todo mundo conectado SEM mandar os dados junto — o cliente só recebe um
// sinal ("algo mudou em pautas/sugestões") e refaz o fetch que ele já faz
// normalmente. Evita ter que manter os dois lados (servidor/cliente) de
// acordo sobre um formato de diff; o preço é um refetch a mais por evento,
// que numa redação é raro o suficiente pra não pesar.
function criarServidorTempoReal(servidorHttp) {
  const wss = new WebSocketServer({ server: servidorHttp, path: '/ws/tempo-real' });

  function broadcast(dados) {
    const mensagem = JSON.stringify(dados);
    wss.clients.forEach(cliente => {
      if (cliente.readyState === cliente.OPEN) cliente.send(mensagem);
    });
  }

  return { broadcast };
}

module.exports = { criarServidorTempoReal };
