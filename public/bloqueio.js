// Módulo compartilhado de bloqueio cooperativo de edição — inclua via
// <script src="bloqueio.js"></script> em qualquer tela que abra uma
// Pauta ou a Lauda dela pra edição (pautas.html, materia.html). Ver
// pautas.js (rotas POST/DELETE /pautas/:id/bloquear) e tempo_real.js
// (libera sozinho se a conexão cair, sem precisar de ação explícita).
//
// Cada ABA/tela que abre é uma "conexão" própria (id gerado uma vez por
// carregamento de página, não por sessão) — assim a MESMA pessoa pode
// ter a Pauta e a Lauda abertas ao mesmo tempo em telas diferentes sem
// se autobloquear.

window.Bloqueio = (function () {
  function gerarConexaoId() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }
  const conexaoId = gerarConexaoId();

  let ws = null;
  let aoMudarCallback = null;

  function conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocolo}//${location.host}/ws/tempo-real`);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ tipo: 'registrar_conexao', conexaoId }));
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.tipo === 'bloqueio' && aoMudarCallback) aoMudarCallback(msg);
    });
    ws.addEventListener('close', () => setTimeout(conectar, 3000));
    ws.addEventListener('error', () => ws.close());
  }
  conectar();

  // Tenta reservar a edição de uma Pauta pra essa conexão. Retorna
  // {ok:true} se conseguiu (ou já era dono), {ok:false, bloqueadoPor}
  // se outra pessoa já está editando.
  async function tentarBloquear(pautaId) {
    try {
      const resp = await fetch(`/pautas/${pautaId}/bloquear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexaoId })
      });
      if (resp.ok) return { ok: true };
      const corpo = await resp.json().catch(() => ({}));
      return { ok: false, bloqueadoPor: corpo.bloqueado_por };
    } catch (e) {
      // Sem conexão com o servidor — não trava a edição por causa
      // disso (o backend continua sendo a garantia real).
      return { ok: true };
    }
  }

  // Libera a visão desta conexão (ex. fechou a aba da Pauta) — usa
  // keepalive pra ter chance de completar mesmo com a página fechando.
  function liberar(pautaId) {
    fetch(`/pautas/${pautaId}/bloquear?conexaoId=${encodeURIComponent(conexaoId)}`, {
      method: 'DELETE',
      keepalive: true
    }).catch(() => {});
  }

  async function forcarDestravamento(pautaId) {
    const resp = await fetch(`/pautas/${pautaId}/bloquear/forcar`, { method: 'DELETE' });
    return resp.ok;
  }

  // Callback chamado toda vez que o bloqueio de QUALQUER pauta muda em
  // tempo real (outra pessoa começou ou terminou de editar) — útil pra
  // atualizar um selo "🔒 Fulano" numa lista sem precisar recarregar.
  function aoMudar(callback) {
    aoMudarCallback = callback;
  }

  return { tentarBloquear, liberar, forcarDestravamento, aoMudar };
})();
