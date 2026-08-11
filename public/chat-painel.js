// Painel de Chat por Pauta — HORUS Chat v1.
//
// Escopo desta primeira versão (ver memória do projeto pra decisões):
// só chat contextual por Pauta/Lauda, sem canais gerais/por programa, sem
// @menções, sem modo NO AR. Reaproveita o mesmo WebSocket de tempo real já
// usado pelo Breaking News/Mapa de Produções (tempo_real.js), só que agora
// carregando o conteúdo da mensagem no payload — os outros usos daquele
// canal só mandam um sinal de "algo mudou" e o cliente refaz o fetch.
//
// Não existe login no HORUS v1 ainda — "autor" é o nome escolhido numa
// lista (mesma da Agenda) e guardado no localStorage do navegador. Quando
// o sistema de login for implementado, é só trocar nomeAutorAtual()/
// pedirAutor() por dado de sessão real; o resto (mensagens, WS) não muda.
//
// Uso: incluir este script na página e chamar window.ChatPauta.abrir(id, titulo).
(function () {
  const CHAVE_AUTOR = 'horus_chat_autor';
  let painelInjetado = false;
  let socket = null;
  let pautaAtual = null;
  let equipeCache = null;

  function injetarEstilo() {
    if (document.getElementById('chat-painel-estilo')) return;
    const estilo = document.createElement('style');
    estilo.id = 'chat-painel-estilo';
    estilo.textContent = `
      .horus-chat-painel {
        position: fixed; top: 0; right: 0; bottom: 0; width: 340px; max-width: 90vw;
        background: #fff; box-shadow: -2px 0 14px rgba(0,0,0,0.15);
        display: flex; flex-direction: column; z-index: 900;
        transform: translateX(100%); transition: transform 0.2s ease;
        font-family: Arial, sans-serif;
      }
      .horus-chat-painel.aberto { transform: translateX(0); }
      .horus-chat-header {
        background: #336699; color: #fff; padding: 14px 16px; display: flex;
        align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0;
      }
      .horus-chat-header .chat-title { font-size: 14px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .horus-chat-header button { background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
      .horus-chat-header button:hover { background: rgba(255,255,255,0.35); }

      .horus-chat-autor-form { padding: 20px 16px; }
      .horus-chat-autor-form label { display: block; font-size: 12px; color: #5b6472; margin-bottom: 6px; }
      .horus-chat-autor-form select { width: 100%; padding: 9px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; margin-bottom: 10px; }
      .horus-chat-autor-form button { width: 100%; background: #336699; color: #fff; border: none; border-radius: 6px; padding: 9px; font-size: 13px; cursor: pointer; }

      .horus-chat-quemsou { padding: 6px 16px; font-size: 11px; color: #5b6472; background: #eef1f5; border-bottom: 1px solid #e2e2e2; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
      .horus-chat-quemsou strong { color: #1b2430; }
      .horus-chat-quemsou button { background: none; border: none; color: #336699; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0; }

      .horus-chat-mensagens { flex: 1; overflow-y: auto; padding: 12px; background: #f4f5f7; display: flex; flex-direction: column; gap: 8px; }
      .horus-chat-vazio { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
      .horus-chat-msg { background: #fff; border-radius: 8px; padding: 8px 10px; font-size: 13px; max-width: 88%; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
      .horus-chat-msg.minha { align-self: flex-end; background: #d9e8f5; }
      .horus-chat-msg .msg-autor { font-weight: bold; font-size: 11px; color: #336699; display: block; margin-bottom: 2px; }
      .horus-chat-msg .msg-hora { font-size: 10px; color: #999; float: right; margin-left: 8px; }
      .horus-chat-msg .msg-texto { white-space: pre-wrap; word-break: break-word; }

      .horus-chat-footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #eee; flex-shrink: 0; }
      .horus-chat-footer input { flex: 1; padding: 9px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; }
      .horus-chat-footer button { background: #8D0333; color: #fff; border: none; border-radius: 6px; padding: 9px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; }
    `;
    document.head.appendChild(estilo);
  }

  function injetarPainel() {
    if (painelInjetado) return;
    injetarEstilo();

    const div = document.createElement('div');
    div.className = 'horus-chat-painel';
    div.id = 'horus-chat-painel';
    div.innerHTML = `
      <div class="horus-chat-header">
        <span class="chat-title" id="horus-chat-titulo">💬 Chat</span>
        <button type="button" id="horus-chat-fechar" title="Fechar">✕</button>
      </div>
      <div class="horus-chat-autor-form" id="horus-chat-autor-form" style="display:none">
        <label>Quem é você?</label>
        <select id="horus-chat-select-autor"></select>
        <button type="button" id="horus-chat-confirmar-autor">Entrar no chat</button>
      </div>
      <div class="horus-chat-quemsou" id="horus-chat-quemsou" style="display:none">
        <span>Você: <strong id="horus-chat-nome-atual"></strong></span>
        <button type="button" id="horus-chat-trocar-autor">Trocar</button>
      </div>
      <div class="horus-chat-mensagens" id="horus-chat-mensagens" style="display:none"></div>
      <div class="horus-chat-footer" id="horus-chat-footer" style="display:none">
        <input type="text" id="horus-chat-input" placeholder="Escreva sua mensagem...">
        <button type="button" id="horus-chat-enviar">Enviar</button>
      </div>
    `;
    document.body.appendChild(div);
    painelInjetado = true;

    document.getElementById('horus-chat-fechar').addEventListener('click', fechar);
    document.getElementById('horus-chat-confirmar-autor').addEventListener('click', confirmarAutor);
    document.getElementById('horus-chat-trocar-autor').addEventListener('click', mostrarPassoAutor);
    document.getElementById('horus-chat-enviar').addEventListener('click', enviarMensagem);
    document.getElementById('horus-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enviarMensagem();
    });
  }

  function nomeAutorAtual() {
    return localStorage.getItem(CHAVE_AUTOR) || '';
  }

  async function carregarEquipe() {
    if (equipeCache) return equipeCache;
    const resp = await fetch('/agenda/equipe');
    const todos = await resp.json();
    const vistos = new Set();
    equipeCache = todos
      .filter(m => (vistos.has(m.nome) ? false : (vistos.add(m.nome), true)))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return equipeCache;
  }

  async function mostrarPassoAutor() {
    document.getElementById('horus-chat-mensagens').style.display = 'none';
    document.getElementById('horus-chat-footer').style.display = 'none';
    document.getElementById('horus-chat-quemsou').style.display = 'none';
    const form = document.getElementById('horus-chat-autor-form');
    form.style.display = 'block';

    const membros = await carregarEquipe();
    const select = document.getElementById('horus-chat-select-autor');
    select.innerHTML = '<option value="">Selecione...</option>' +
      membros.map(m => `<option value="${m.nome}">${m.nome} (${m.funcao})</option>`).join('');

    // pré-seleciona quem já estava conversando, pra "Trocar" não obrigar a
    // rolar a lista toda de novo caso seja só pra conferir/confirmar
    const atual = nomeAutorAtual();
    if (atual && membros.some(m => m.nome === atual)) select.value = atual;
  }

  function confirmarAutor() {
    const nome = document.getElementById('horus-chat-select-autor').value;
    if (!nome) return;
    localStorage.setItem(CHAVE_AUTOR, nome);
    document.getElementById('horus-chat-autor-form').style.display = 'none';
    mostrarChat();
  }

  function formatarHora(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderMensagens(lista) {
    const container = document.getElementById('horus-chat-mensagens');
    const autor = nomeAutorAtual();

    if (!lista.length) {
      container.innerHTML = '<div class="horus-chat-vazio">Nenhuma mensagem ainda — comece a conversa.</div>';
      return;
    }

    container.innerHTML = lista.map(m => `
      <div class="horus-chat-msg ${m.autor === autor ? 'minha' : ''}">
        <span class="msg-hora">${formatarHora(m.criado_em)}</span>
        <span class="msg-autor">${m.autor}</span>
        <span class="msg-texto"></span>
      </div>
    `).join('');

    // texto vai por textContent (não template literal) pra não virar HTML por engano
    container.querySelectorAll('.msg-texto').forEach((el, i) => { el.textContent = lista[i].texto; });

    container.scrollTop = container.scrollHeight;
  }

  let mensagensAtuais = [];

  async function mostrarChat() {
    document.getElementById('horus-chat-mensagens').style.display = 'flex';
    document.getElementById('horus-chat-footer').style.display = 'flex';
    document.getElementById('horus-chat-quemsou').style.display = 'flex';
    document.getElementById('horus-chat-nome-atual').textContent = nomeAutorAtual();

    const resp = await fetch('/chat/pauta/' + pautaAtual);
    mensagensAtuais = await resp.json();
    renderMensagens(mensagensAtuais);
    conectarSocket();
  }

  async function enviarMensagem() {
    const input = document.getElementById('horus-chat-input');
    const texto = input.value.trim();
    if (!texto || !pautaAtual) return;

    input.value = '';
    await fetch('/chat/pauta/' + pautaAtual, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: nomeAutorAtual(), texto })
    });
    // não adiciona otimisticamente na tela — a mensagem volta pelo próprio
    // WebSocket (mesmo caminho pra todo mundo, sem duplicar lógica)
  }

  function conectarSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocolo}//${location.host}/ws/tempo-real`);
    socket.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.tipo === 'chat' && msg.pauta_id === pautaAtual) {
        mensagensAtuais.push(msg.mensagem);
        renderMensagens(mensagensAtuais);
      }
    });
    socket.addEventListener('close', () => { socket = null; setTimeout(() => { if (pautaAtual) conectarSocket(); }, 3000); });
    socket.addEventListener('error', () => socket.close());
  }

  async function abrir(pautaId, tituloPauta) {
    if (!pautaId) return;
    injetarPainel();
    pautaAtual = pautaId;
    document.getElementById('horus-chat-titulo').textContent = '💬 ' + (tituloPauta || ('Pauta #P-' + pautaId));
    document.getElementById('horus-chat-painel').classList.add('aberto');

    if (!nomeAutorAtual()) await mostrarPassoAutor();
    else await mostrarChat();
  }

  function fechar() {
    const painel = document.getElementById('horus-chat-painel');
    if (painel) painel.classList.remove('aberto');
    pautaAtual = null;
  }

  window.ChatPauta = { abrir, fechar };
})();
