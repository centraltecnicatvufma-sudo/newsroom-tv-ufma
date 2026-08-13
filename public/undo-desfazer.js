// Desfazer/Refazer — HORUS Newsroom.
//
// Duas fontes de ação, um só Ctrl+Z/toast pras duas:
// 1) EXCLUSÕES dos 7 tipos que já têm Lixeira (soft delete) — Pautas,
//    Sugestões, Agenda, Programas & Quadros, Equipe, Escala (turnos) e
//    Calendário. Desfazer = chamar o PATCH .../restaurar que cada rota
//    já tinha; Refazer = excluir de novo (DELETE). Fica no localStorage
//    (sobrevive à navegação).
// 2) Ações LOCAIS que ainda não foram salvas no servidor — ex. remover
//    uma caixa de texto extra ("Informações"/"Sugestão de Imagens") na
//    edição da Pauta antes de clicar Salvar. Fica só em memória (não
//    sobrevive a F5, porque o que ela desfaz também não sobreviveria).
//
// Não cobre ainda edição de texto já SALVA, mudança de status, nem
// exclusão de item do Espelho/Lauda (essas usam DELETE físico, sem
// Lixeira — ficaria pra uma etapa futura, precisaria guardar o registro
// inteiro antes de apagar, não só restaurar).
//
// Escopo é POR USUÁRIO (decisão do usuário: "só as minhas próprias
// ações") — a pilha fica no localStorage do navegador, não no servidor,
// então cada pessoa só desfaz o que ela mesma excluiu nesta máquina.
//
// Uso (exclusão via API, com Lixeira): incluir este script em qualquer
// tela (ver auth-guard.js) e, logo depois de um DELETE dar certo, chamar:
//   window.HorusUndo.registrar({ tipo: 'Pauta', titulo: p.titulo, urlBase: '/pautas/' + id });
// urlBase é a URL SEM o /restaurar no final — o módulo completa sozinho
// (.../restaurar pra desfazer, a própria urlBase de novo com DELETE pra
// refazer). A tela deve escutar o evento 'horus-undo-mudou' pra recarregar
// a lista depois de um desfazer/refazer (o item pode ter voltado a
// aparecer ou sumido de novo).
//
// Uso (ação local, sem API — ex. remover uma caixa de texto extra ainda
// não salva): logo depois da remoção, chamar:
//   window.HorusUndo.registrarAcaoLocal({ tipo: 'Caixa', titulo: 'Informações', aoDesfazer: () => { ...devolve o item... } });
// aoDesfazer é chamada quando o usuário desfizer (Ctrl+Z ou toast) — só
// precisa devolver o estado local ao que era antes e re-renderizar; não
// tem Refazer pra esse tipo (reaproveitar o mesmo botão de remover de
// novo já resolve).
(function () {
  const CHAVE_PILHA = 'horus_undo_pilha';
  const CHAVE_REFAZER = 'horus_undo_pilha_refazer';
  const VALIDADE_MS = 30 * 60 * 1000; // entradas mais velhas que isso somem sozinhas
  const TAMANHO_MAXIMO = 15;

  function lerPilha(chave) {
    let bruto;
    try { bruto = JSON.parse(localStorage.getItem(chave) || '[]'); } catch (e) { return []; }
    if (!Array.isArray(bruto)) return [];
    const agora = Date.now();
    return bruto.filter(item => item && (agora - item.quando) < VALIDADE_MS);
  }

  function salvarPilha(chave, pilha) {
    localStorage.setItem(chave, JSON.stringify(pilha));
  }

  function empilhar(chave, item) {
    const pilha = lerPilha(chave);
    pilha.push(item);
    if (pilha.length > TAMANHO_MAXIMO) pilha.shift();
    salvarPilha(chave, pilha);
  }

  function desempilhar(chave) {
    const pilha = lerPilha(chave);
    const item = pilha.pop();
    salvarPilha(chave, pilha);
    return item;
  }

  // ---- Toast ----
  function injetarEstilo() {
    if (document.getElementById('horus-undo-estilo')) return;
    const estilo = document.createElement('style');
    estilo.id = 'horus-undo-estilo';
    estilo.textContent = `
      .horus-undo-toast {
        position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(20px);
        background: #1b2430; color: #fff; padding: 12px 18px; border-radius: 8px;
        display: flex; align-items: center; gap: 14px; font-family: Arial, sans-serif; font-size: 13px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 9999; opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease; pointer-events: none; max-width: 90vw;
      }
      .horus-undo-toast.visivel { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
      .horus-undo-toast button {
        background: #336699; color: #fff; border: none; border-radius: 6px; padding: 6px 12px;
        cursor: pointer; font-size: 12px; font-weight: bold; white-space: nowrap; flex-shrink: 0;
      }
      .horus-undo-toast button:hover { background: #4d7fb3; }
    `;
    document.head.appendChild(estilo);
  }

  let toastTimeoutId = null;

  function mostrarToast(mensagem, rotuloBotao, aoClicarBotao) {
    injetarEstilo();
    let toast = document.getElementById('horus-undo-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'horus-undo-toast';
      toast.className = 'horus-undo-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>${mensagem}</span>` +
      (rotuloBotao ? `<button type="button">${rotuloBotao}</button>` : '');
    if (rotuloBotao) {
      toast.querySelector('button').addEventListener('click', () => {
        aoClicarBotao();
        esconderToast();
      });
    }
    toast.classList.add('visivel');
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(esconderToast, 8000);
  }

  function esconderToast() {
    document.getElementById('horus-undo-toast')?.classList.remove('visivel');
  }

  function avisarMudanca() {
    window.dispatchEvent(new CustomEvent('horus-undo-mudou'));
  }

  // ---- API pública ----

  // Chamado pela tela logo depois de um DELETE dar certo.
  function registrar({ tipo, titulo, urlBase }) {
    if (!urlBase) return;
    empilhar(CHAVE_PILHA, { tipo, titulo, urlBase, quando: Date.now() });
    salvarPilha(CHAVE_REFAZER, []); // uma exclusão nova invalida qualquer refazer pendente
    mostrarToast(
      `${tipo} "${escaparHtmlUndo(titulo)}" excluída.`,
      'Desfazer (Ctrl+Z)',
      desfazer
    );
  }

  // Pilha de ações "locais" (removeu uma caixa de texto extra, por
  // exemplo) — não vira uma chamada de API, então não dá pra descrever
  // como uma URL de restaurar/excluir. Fica só em MEMÓRIA (não
  // localStorage): o que ela desfaz também só existe na página atual
  // (um campo ainda não salvo), não sobreviveria a um F5 de qualquer
  // jeito. Ao desfazer(), decide entre esta pilha e a de exclusões pela
  // que tiver a ação mais recente das duas — um só Ctrl+Z pros dois
  // tipos de ação, na ordem certa em que aconteceram.
  let pilhaLocal = [];

  function registrarAcaoLocal({ tipo, titulo, aoDesfazer }) {
    pilhaLocal.push({ tipo, titulo, aoDesfazer, quando: Date.now() });
    if (pilhaLocal.length > TAMANHO_MAXIMO) pilhaLocal.shift();
    mostrarToast(
      `${tipo} "${escaparHtmlUndo(titulo)}" removida.`,
      'Desfazer (Ctrl+Z)',
      desfazer
    );
  }

  function escaparHtmlUndo(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function desfazer() {
    const itemRest = lerPilha(CHAVE_PILHA).slice(-1)[0];
    const itemLocal = pilhaLocal[pilhaLocal.length - 1];

    if (!itemRest && !itemLocal) { mostrarToast('Nada pra desfazer.', null); return; }

    // A ação local só "ganha" se for mais recente que o topo da pilha de exclusões
    const usarLocal = itemLocal && (!itemRest || itemLocal.quando > itemRest.quando);

    if (usarLocal) {
      pilhaLocal.pop();
      try {
        await itemLocal.aoDesfazer();
        mostrarToast(`${itemLocal.tipo} "${escaparHtmlUndo(itemLocal.titulo)}" restaurada.`, null);
      } catch (e) {
        pilhaLocal.push(itemLocal);
        alert('Não foi possível desfazer essa ação.');
      }
      return;
    }

    const item = desempilhar(CHAVE_PILHA);
    try {
      const resp = await fetch(item.urlBase + '/restaurar', { method: 'PATCH' });
      if (!resp.ok) throw new Error();
      empilhar(CHAVE_REFAZER, item);
      mostrarToast(
        `${item.tipo} "${escaparHtmlUndo(item.titulo)}" restaurada.`,
        'Refazer (Ctrl+Y)',
        refazer
      );
      avisarMudanca();
    } catch (e) {
      // Devolve pro topo da pilha — a tentativa falhou, não foi consumida de verdade
      empilhar(CHAVE_PILHA, item);
      alert('Não foi possível desfazer a exclusão. Tente restaurar pela Lixeira.');
    }
  }

  async function refazer() {
    const item = desempilhar(CHAVE_REFAZER);
    if (!item) { mostrarToast('Nada pra refazer.', null); return; }

    try {
      const resp = await fetch(item.urlBase, { method: 'DELETE' });
      if (!resp.ok) throw new Error();
      empilhar(CHAVE_PILHA, item);
      mostrarToast(
        `${item.tipo} "${escaparHtmlUndo(item.titulo)}" excluída de novo.`,
        'Desfazer (Ctrl+Z)',
        desfazer
      );
      avisarMudanca();
    } catch (e) {
      empilhar(CHAVE_REFAZER, item);
      alert('Não foi possível refazer a exclusão.');
    }
  }

  // ---- Atalho de teclado global (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) ----
  // Nunca dispara enquanto o foco está num campo de texto/editável — ali
  // quem manda é o desfazer nativo do navegador (ou do Quill), sem
  // disputa com este atalho global de AÇÃO.
  document.addEventListener('keydown', (e) => {
    const alvo = e.target;
    const editandoTexto = alvo && (
      alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable
    );
    if (editandoTexto) return;

    const ctrlOuCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOuCmd) return;

    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) {
      e.preventDefault();
      desfazer();
    } else if ((tecla === 'z' && e.shiftKey) || tecla === 'y') {
      e.preventDefault();
      refazer();
    }
  });

  window.HorusUndo = { registrar, registrarAcaoLocal, desfazer, refazer };
})();
