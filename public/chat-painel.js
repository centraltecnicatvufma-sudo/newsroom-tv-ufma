// Painel de Chat — HORUS Chat.
//
// v1 era só chat contextual por Pauta/Lauda; v2 adicionou o canal geral
// #redacao-geral e @menções com deep-link de #pautaN (modo NO AR continua
// de fora — ver memória do projeto pra decisões de escopo). O painel
// mostra um "contexto" por vez:
// { tipo: 'pauta', pautaId, titulo } ou { tipo: 'geral' }. Reaproveita o
// mesmo WebSocket de tempo real já usado pelo Breaking News/Mapa de
// Produções (tempo_real.js), só que agora carregando o conteúdo da
// mensagem no payload — os outros usos daquele canal só mandam um sinal de
// "algo mudou" e o cliente refaz o fetch.
//
// Autor da mensagem vem sempre da sessão logada (GET /auth/me) — v1 do
// Chat, antes do login real existir, deixava escolher livremente um nome
// numa lista, guardado no localStorage, com um botão "Trocar" pra virar
// qualquer outra pessoa a qualquer momento. Isso parou de fazer sentido
// assim que o login real (JWT) passou a existir: ninguém deveria
// conseguir mandar mensagem se passando por outro colega só clicando
// num botão. Backend também não confia mais em nenhum "autor" mandado
// pelo cliente (ver chat.js) — aqui é só espelho da mesma trava.
//
// Uso: incluir este script na página e chamar window.ChatPauta.abrir(id, titulo)
// pra abrir o chat de uma pauta, ou window.ChatPauta.abrirGeral() pro canal geral.
(function () {
  let painelInjetado = false;
  let socket = null;
  let contexto = null; // { tipo: 'pauta', pautaId, titulo } | { tipo: 'geral' } | null
  let equipeCache = null;
  let nomeUsuarioLogado = null;

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
      .horus-chat-header .chat-title { font-size: 14px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .horus-chat-header .chat-header-botoes { display: flex; gap: 6px; flex-shrink: 0; }
      .horus-chat-header button { background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
      .horus-chat-header button:hover { background: rgba(255,255,255,0.35); }

      .horus-chat-historico-menu {
        display: none; position: absolute; top: 48px; right: 16px; background: #fff;
        border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
        z-index: 901; min-width: 220px; max-width: 280px; max-height: 240px; overflow-y: auto;
      }
      .horus-chat-historico-menu.aberto { display: block; }
      .horus-chat-historico-menu button { display: block; width: 100%; text-align: left; padding: 9px 12px; background: #fff; color: #1b2430; border: none; border-bottom: 1px solid #f0f0f0; font-size: 12px; cursor: pointer; white-space: normal; height: auto; border-radius: 0; }
      .horus-chat-historico-menu button:last-child { border-bottom: none; }
      .horus-chat-historico-menu button:hover { background: #eef1f5; }
      .horus-chat-historico-menu button.atual { font-weight: bold; color: #336699; }
      .horus-chat-historico-menu .horus-chat-historico-vazio { padding: 14px 12px; font-size: 12px; color: #999; text-align: center; }

      .horus-chat-quemsou { padding: 6px 16px; font-size: 11px; color: #5b6472; background: #eef1f5; border-bottom: 1px solid #e2e2e2; display: flex; align-items: center; flex-shrink: 0; }
      .horus-chat-quemsou strong { color: #1b2430; }

      .horus-chat-mensagens { flex: 1; overflow-y: auto; padding: 12px; background: #f4f5f7; display: flex; flex-direction: column; gap: 8px; }
      .horus-chat-vazio { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
      .horus-chat-msg { background: #fff; border-radius: 8px; padding: 8px 10px; font-size: 13px; max-width: 88%; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
      .horus-chat-msg.minha { align-self: flex-end; background: #d9e8f5; }
      .horus-chat-msg.mencionado { box-shadow: 0 0 0 2px #C98A1F; }
      .horus-chat-msg .msg-autor { font-weight: bold; font-size: 11px; color: #336699; display: block; margin-bottom: 2px; }
      .horus-chat-msg .msg-hora { font-size: 10px; color: #999; float: right; margin-left: 8px; }
      .horus-chat-msg .msg-texto { white-space: pre-wrap; word-break: break-word; }
      .horus-chat-msg .mencao { background: #fff3b0; color: #7a5b00; font-weight: bold; padding: 0 3px; border-radius: 3px; }
      .horus-chat-msg .chat-link-pauta { color: #336699; font-weight: bold; text-decoration: underline; }

      /* Aviso de sistema (autor "HORUS") — mudança automática de status,
         por exemplo — não é bolha de conversa: centralizado, sem "de
         quem", sem lado esquerda/direita. */
      .horus-chat-sistema { align-self: center; max-width: 96%; background: #eef1f5; color: #444; border-radius: 8px; padding: 6px 10px; font-size: 12px; text-align: center; }
      .horus-chat-sistema.mencionado { box-shadow: 0 0 0 2px #C98A1F; }
      .horus-chat-sistema .msg-hora { float: none; color: #999; margin-right: 6px; }
      .horus-chat-sistema .msg-texto { white-space: pre-wrap; word-break: break-word; }
      .horus-chat-sistema .mencao { background: #fff3b0; color: #7a5b00; font-weight: bold; padding: 0 3px; border-radius: 3px; }
      .horus-chat-sistema .chat-link-pauta { color: #336699; font-weight: bold; text-decoration: underline; }

      .horus-chat-footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #eee; flex-shrink: 0; }
      .horus-chat-footer input { flex: 1; padding: 9px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; }
      .horus-chat-footer button { background: #8D0333; color: #fff; border: none; border-radius: 6px; padding: 9px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; }
    `;
    document.head.appendChild(estilo);
  }

  function injetarPainel() {
    if (painelInjetado) return;
    injetarEstilo();
    pedirPermissaoNotificacao();

    const div = document.createElement('div');
    div.className = 'horus-chat-painel';
    div.id = 'horus-chat-painel';
    div.innerHTML = `
      <div class="horus-chat-header">
        <span class="chat-title" id="horus-chat-titulo">💬 Chat</span>
        <div class="chat-header-botoes">
          <button type="button" id="horus-chat-historico-btn" title="Chats abertos anteriormente">🕐</button>
          <button type="button" id="horus-chat-fechar" title="Fechar">✕</button>
        </div>
      </div>
      <div class="horus-chat-historico-menu" id="horus-chat-historico-menu"></div>
      <div class="horus-chat-quemsou" id="horus-chat-quemsou" style="display:none">
        <span>Você: <strong id="horus-chat-nome-atual"></strong></span>
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
    document.getElementById('horus-chat-enviar').addEventListener('click', enviarMensagem);
    document.getElementById('horus-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enviarMensagem();
    });
    document.getElementById('horus-chat-historico-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('horus-chat-historico-menu');
      const jaAberto = menu.classList.contains('aberto');
      fecharMenuHistorico();
      if (!jaAberto) { renderHistorico(); menu.classList.add('aberto'); }
    });
    document.addEventListener('click', fecharMenuHistorico);
  }

  // Chats de Pauta já abertos nesta sessão do navegador (em memória, não
  // persiste entre reloads) — mais recente primeiro, sem duplicar pauta
  // (reabrir uma que já estava na lista só sobe ela pro topo de novo).
  let historico = [];
  const MAX_HISTORICO = 8;

  function registrarHistorico(pautaId, titulo) {
    historico = historico.filter(h => h.pautaId !== pautaId);
    historico.unshift({ pautaId, titulo: titulo || ('Pauta #P-' + pautaId) });
    if (historico.length > MAX_HISTORICO) historico.length = MAX_HISTORICO;
  }

  function fecharMenuHistorico() {
    document.getElementById('horus-chat-historico-menu')?.classList.remove('aberto');
  }

  function renderHistorico() {
    const menu = document.getElementById('horus-chat-historico-menu');

    // #redacao-geral fica sempre fixo no topo — não é "histórico" (não
    // some, não precisa ter sido aberto antes), é o único canal geral
    // que existe, então sempre tem que estar ali pra entrar direto.
    const geralAtual = contexto?.tipo === 'geral';
    menu.innerHTML =
      `<button type="button" id="horus-chat-item-geral" class="${geralAtual ? 'atual' : ''}">🏛️ Redação Geral</button>` +
      (historico.length ? '' : '<div class="horus-chat-historico-vazio">Nenhum chat de pauta aberto ainda nesta sessão.</div>') +
      historico.map(h => `
        <button type="button" class="${contexto?.tipo === 'pauta' && h.pautaId === contexto.pautaId ? 'atual' : ''}"></button>
      `).join('');

    document.getElementById('horus-chat-item-geral').addEventListener('click', () => {
      fecharMenuHistorico();
      abrirGeral();
    });

    const botoesPauta = menu.querySelectorAll('button:not(#horus-chat-item-geral)');
    botoesPauta.forEach((btn, i) => { btn.textContent = historico[i].titulo; });
    botoesPauta.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        fecharMenuHistorico();
        const h = historico[i];
        abrir(h.pautaId, h.titulo);
      });
    });
  }

  function nomeAutorAtual() {
    return nomeUsuarioLogado || '';
  }

  // Carregada uma vez (sessão logada não muda de nome durante o uso) —
  // mesma fonte de verdade usada em todo o resto do app (GET /auth/me),
  // nunca duplicada/guardada em localStorage.
  async function carregarUsuarioAtual() {
    if (nomeUsuarioLogado) return nomeUsuarioLogado;
    const resp = await fetch('/auth/me');
    if (resp.ok) {
      const usuario = await resp.json();
      nomeUsuarioLogado = usuario.nome;
    }
    return nomeUsuarioLogado;
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

  function formatarHora(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escaparHtmlTexto(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // @Menção só reconhece nomes de verdade da Agenda, não qualquer
  // "@palavra" solta — evita marcar coisa por engano e permite nome com
  // espaço ("@ANA THEREZA VIEGAS"). Ordenado do
  // nome mais longo pro mais curto pra "ANA THEREZA VIEGAS" não parar em
  // só "ANA" no meio do caminho.
  function regexMencoes() {
    if (!equipeCache || !equipeCache.length) return null;
    const nomes = equipeCache.map(m => m.nome).sort((a, b) => b.length - a.length).map(escapeRegex);
    return new RegExp('@(' + nomes.join('|') + ')\\b', 'g');
  }

  function mencionaAutorAtual(texto) {
    const autor = nomeAutorAtual();
    if (!autor) return false;
    return new RegExp('@' + escapeRegex(autor) + '\\b').test(texto);
  }

  // #pauta15 vira link pro mesmo deep-link ?abrir= já usado pela Busca
  // Geral (pautas.html) — o id vem só de dígitos capturados pela regex,
  // então é seguro interpolar direto, sem escapar de novo.
  function formatarTextoMensagem(texto) {
    let html = escaparHtmlTexto(texto);
    html = html.replace(/#pauta(\d+)/gi, (m, id) =>
      `<a href="pautas.html?abrir=${id}" target="_blank" class="chat-link-pauta">#pauta${id}</a>`);
    const re = regexMencoes();
    if (re) html = html.replace(re, '<span class="mencao">@$1</span>');
    return html;
  }

  function renderMensagens(lista) {
    const container = document.getElementById('horus-chat-mensagens');
    const autor = nomeAutorAtual();

    if (!lista.length) {
      container.innerHTML = '<div class="horus-chat-vazio">Nenhuma mensagem ainda — comece a conversa.</div>';
      return;
    }

    container.innerHTML = lista.map(m => {
      const mencionado = mencionaAutorAtual(m.texto) ? 'mencionado' : '';
      // "HORUS" é o autor usado pelo backend pra avisos automáticos (ex.:
      // mudança de status do rundown) — vira um aviso de sistema
      // centralizado, sem nome/bolha de conversa (ver notificarMudancaStatus
      // em pautas.js).
      if (m.autor === 'HORUS') {
        return `
          <div class="horus-chat-sistema ${mencionado}">
            <span class="msg-hora">${formatarHora(m.criado_em)}</span>
            <span class="msg-texto"></span>
          </div>
        `;
      }
      return `
        <div class="horus-chat-msg ${m.autor === autor ? 'minha' : ''} ${mencionado}">
          <span class="msg-hora">${formatarHora(m.criado_em)}</span>
          <span class="msg-autor">${m.autor}</span>
          <span class="msg-texto"></span>
        </div>
      `;
    }).join('');

    // texto formatado (menção/link) vai por innerHTML, mas só depois de
    // escapar o texto cru — formatarTextoMensagem() garante isso, nunca
    // interpola o texto da mensagem sem escapar primeiro.
    container.querySelectorAll('.msg-texto').forEach((el, i) => { el.innerHTML = formatarTextoMensagem(lista[i].texto); });

    container.scrollTop = container.scrollHeight;
  }

  let mensagensAtuais = [];

  // Endpoint muda conforme o contexto — resto do fluxo (fetch, POST,
  // filtro do WebSocket) é idêntico pros dois casos.
  function endpointAtual() {
    return contexto.tipo === 'geral' ? '/chat/geral' : '/chat/pauta/' + contexto.pautaId;
  }

  async function mostrarChat() {
    document.getElementById('horus-chat-mensagens').style.display = 'flex';
    document.getElementById('horus-chat-footer').style.display = 'flex';
    document.getElementById('horus-chat-quemsou').style.display = 'flex';

    // Precisa da lista da Agenda carregada ANTES de renderizar, senão a
    // primeira leva de mensagens abre sem reconhecer nenhuma @menção.
    await Promise.all([carregarUsuarioAtual(), carregarEquipe()]);
    document.getElementById('horus-chat-nome-atual').textContent = nomeAutorAtual();

    const resp = await fetch(endpointAtual());
    mensagensAtuais = await resp.json();
    renderMensagens(mensagensAtuais);
    conectarSocket();
  }

  async function enviarMensagem() {
    const input = document.getElementById('horus-chat-input');
    const texto = input.value.trim();
    if (!texto || !contexto) return;

    input.value = '';
    // Autor não vai mais no corpo — o backend identifica quem está
    // mandando pela própria sessão logada (ver chat.js), não confia em
    // nada que o cliente diga sobre "quem eu sou".
    await fetch(endpointAtual(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto })
    });
    // não adiciona otimisticamente na tela — a mensagem volta pelo próprio
    // WebSocket (mesmo caminho pra todo mundo, sem duplicar lógica)
  }

  function mensagemEhDoContextoAtual(msg) {
    if (!contexto) return false;
    if (contexto.tipo === 'geral') return msg.tipo === 'chat_geral';
    return msg.tipo === 'chat' && msg.pauta_id === contexto.pautaId;
  }

  // Pede permissão uma vez (não bloqueia nada se o usuário recusar — o
  // destaque visual da menção continua funcionando de qualquer jeito).
  function pedirPermissaoNotificacao() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') Notification.requestPermission();
  }

  // Só notifica quando ALGUÉM MENCIONA VOCÊ numa mensagem alheia — nunca
  // pela sua própria mensagem. Vale só pro contexto de chat aberto no
  // momento (o WebSocket só conecta quando um chat está sendo mostrado),
  // não é um "alerta de menção em qualquer pauta o tempo todo".
  function notificarSeMencionado(mensagem) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (mensagem.autor === nomeAutorAtual()) return;
    if (!mencionaAutorAtual(mensagem.texto)) return;
    new Notification('💬 ' + mensagem.autor + ' te mencionou', { body: mensagem.texto });
  }

  function conectarSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocolo}//${location.host}/ws/tempo-real`);
    socket.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (mensagemEhDoContextoAtual(msg)) {
        mensagensAtuais.push(msg.mensagem);
        renderMensagens(mensagensAtuais);
        notificarSeMencionado(msg.mensagem);
      }
    });
    socket.addEventListener('close', () => { socket = null; setTimeout(() => { if (contexto) conectarSocket(); }, 3000); });
    socket.addEventListener('error', () => socket.close());
  }

  async function abrir(pautaId, tituloPauta) {
    if (!pautaId) return;
    injetarPainel();
    contexto = { tipo: 'pauta', pautaId, titulo: tituloPauta || ('Pauta #P-' + pautaId) };
    registrarHistorico(pautaId, tituloPauta);
    document.getElementById('horus-chat-titulo').textContent = '💬 ' + contexto.titulo;
    document.getElementById('horus-chat-painel').classList.add('aberto');
    fecharMenuHistorico();

    await mostrarChat();
  }

  async function abrirGeral() {
    injetarPainel();
    contexto = { tipo: 'geral' };
    document.getElementById('horus-chat-titulo').textContent = '🏛️ Redação Geral';
    document.getElementById('horus-chat-painel').classList.add('aberto');
    fecharMenuHistorico();

    await mostrarChat();
  }

  function fechar() {
    const painel = document.getElementById('horus-chat-painel');
    if (painel) painel.classList.remove('aberto');
    contexto = null;
  }

  window.ChatPauta = { abrir, abrirGeral, fechar };
})();
