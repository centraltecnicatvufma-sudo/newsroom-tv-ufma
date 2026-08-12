const { WebSocketServer } = require('ws');
const db = require('./banco');

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

  // Libera todo bloqueio de Pauta/Lauda (ver pautas.js) amarrado a essa
  // conexão — chamado quando a conexão WebSocket cai por qualquer motivo
  // (fechar aba, navegar pra outro lugar, queda de rede, navegador
  // travar). É esse mecanismo que evita um bloqueio ficar "preso" pra
  // sempre sem precisar de expiração por tempo nem de destravamento manual.
  function liberarBloqueiosDaConexao(conexaoId) {
    if (!conexaoId) return;

    const pautasAfetadas = db.prepare(
      'SELECT DISTINCT pauta_id FROM pautas_bloqueios WHERE conexao_id = ?'
    ).all(conexaoId).map(r => r.pauta_id);

    if (pautasAfetadas.length === 0) return;

    db.prepare('DELETE FROM pautas_bloqueios WHERE conexao_id = ?').run(conexaoId);

    pautasAfetadas.forEach(pautaId => {
      const restante = db.prepare('SELECT COUNT(*) AS c FROM pautas_bloqueios WHERE pauta_id = ?').get(pautaId).c;
      if (restante === 0) broadcast({ tipo: 'bloqueio', pauta_id: pautaId, bloqueado: false });
    });
  }

  wss.on('connection', (ws) => {
    ws.on('message', (dados) => {
      try {
        const msg = JSON.parse(dados);
        // Primeira mensagem que o cliente manda ao abrir a conexão —
        // registra o conexaoId que ele vai usar em POST /pautas/:id/bloquear,
        // pra essa conexão específica poder ser identificada quando cair
        // (ver 'close' abaixo).
        if (msg.tipo === 'registrar_conexao' && msg.conexaoId) {
          ws.conexaoId = msg.conexaoId;
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      liberarBloqueiosDaConexao(ws.conexaoId);
    });
  });

  return { broadcast };
}

module.exports = { criarServidorTempoReal };
