// Guarda de sessão compartilhada — incluída em toda tela com sidebar
// (`<script src="auth-guard.js"></script>`, ver public/*.html). Checa se
// existe sessão válida (cookie HTTP-only setado por /auth/login) e manda
// pra login.html se não tiver; se tiver, injeta o rodapé "Nome / Perfil /
// Trocar senha / Sair" no fim da .nr-sidebar de qualquer tela, sem precisar
// duplicar esse HTML em cada arquivo. NÃO é a proteção de verdade — essa
// vem do middleware exigirLogin no backend (index.js), que bloqueia toda a
// API sem sessão válida; isso aqui só evita a tela ficar exibida vazia/
// quebrada pra quem não está logado.

(function () {
  const ESTILO = `
    .nr-usuario-logado { margin-top: auto; padding: 14px 20px; border-top: 1px solid #4d7fb3; font-size: 12px; color: #cfe0f0; }
    .nr-usuario-logado .nr-usuario-nome { font-weight: bold; color: #fff; font-size: 13px; }
    .nr-usuario-logado .nr-usuario-perfil { margin: 2px 0 8px; }
    .nr-usuario-logado .nr-usuario-botoes { display: flex; gap: 6px; }
    .nr-usuario-logado button { flex: 1; background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 6px; padding: 6px 8px; font-size: 12px; cursor: pointer; }
    .nr-usuario-logado button:hover { background: rgba(255,255,255,0.28); }

    .nr-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000; }
    .nr-modal-overlay.aberto { display: flex; }
    .nr-modal-trocar-senha { background: #fff; border-radius: 10px; padding: 24px; width: 320px; color: #1b2430; font-family: Arial, sans-serif; }
    .nr-modal-trocar-senha h2 { font-size: 16px; margin: 0 0 16px; }
    .nr-modal-trocar-senha label { font-size: 12px; color: #5b6472; display: block; margin: 12px 0 4px; }
    .nr-modal-trocar-senha input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    .nr-modal-trocar-senha .nr-erro-senha { color: #8D0333; font-size: 12px; margin-top: 10px; min-height: 14px; }
    .nr-modal-trocar-senha .nr-sucesso-senha { color: #2e8b57; font-size: 12px; margin-top: 10px; min-height: 14px; }
    .nr-modal-trocar-senha .nr-botoes-modal { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .nr-modal-trocar-senha .nr-botoes-modal button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .nr-modal-trocar-senha .nr-botoes-modal button:first-child { background: #eee; color: #333; }
    .nr-modal-trocar-senha .nr-botoes-modal button:last-child { background: #8D0333; color: #fff; }
  `;

  function injetarEstilo() {
    const style = document.createElement('style');
    style.textContent = ESTILO;
    document.head.appendChild(style);
  }

  function injetarModalTrocarSenha() {
    const overlay = document.createElement('div');
    overlay.className = 'nr-modal-overlay';
    overlay.id = 'nr-modal-trocar-senha';
    overlay.innerHTML = `
      <div class="nr-modal-trocar-senha">
        <h2>Trocar senha</h2>
        <form id="nr-form-trocar-senha">
          <label>Senha atual</label>
          <input type="password" id="nr-senha-atual" autocomplete="current-password" required>
          <label>Nova senha</label>
          <input type="password" id="nr-senha-nova" autocomplete="new-password" placeholder="Mínimo de 6 caracteres" required>
          <label>Confirmar nova senha</label>
          <input type="password" id="nr-senha-nova-confirmar" autocomplete="new-password" required>
          <div class="nr-erro-senha" id="nr-erro-senha"></div>
          <div class="nr-botoes-modal">
            <button type="button" id="nr-cancelar-senha">Cancelar</button>
            <button type="submit" id="nr-salvar-senha">Salvar</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    function fechar() {
      overlay.classList.remove('aberto');
      overlay.querySelector('form').reset();
      document.getElementById('nr-erro-senha').textContent = '';
    }

    overlay.querySelector('#nr-cancelar-senha').addEventListener('click', fechar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });

    overlay.querySelector('#nr-form-trocar-senha').addEventListener('submit', async (e) => {
      e.preventDefault();
      const senhaAtual = document.getElementById('nr-senha-atual').value;
      const senhaNova = document.getElementById('nr-senha-nova').value;
      const senhaNovaConfirmar = document.getElementById('nr-senha-nova-confirmar').value;
      const erro = document.getElementById('nr-erro-senha');
      erro.textContent = '';

      if (senhaNova !== senhaNovaConfirmar) {
        erro.textContent = 'As senhas novas não conferem.';
        return;
      }

      const resp = await fetch('/auth/senha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual, senhaNova })
      });

      if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}));
        erro.textContent = corpo.erro || 'Não foi possível trocar a senha.';
        return;
      }

      fechar();
      alert('Senha alterada com sucesso.');
    });
  }

  function injetarBarraUsuario(usuario) {
    const sidebar = document.querySelector('.nr-sidebar');
    if (!sidebar) return;

    const bloco = document.createElement('div');
    bloco.className = 'nr-usuario-logado';
    bloco.innerHTML = `
      <div class="nr-usuario-nome"></div>
      <div class="nr-usuario-perfil"></div>
      <div class="nr-usuario-botoes">
        <button type="button" id="nr-btn-trocar-senha">Trocar senha</button>
        <button type="button" id="nr-btn-sair">Sair</button>
      </div>
    `;
    bloco.querySelector('.nr-usuario-nome').textContent = usuario.nome;
    bloco.querySelector('.nr-usuario-perfil').textContent = usuario.perfil || 'Perfil não definido';
    sidebar.appendChild(bloco);

    // Link de Histórico só aparece na sidebar pra quem é Administrador/TI
    // — não é a proteção de verdade (essa é a checagem de perfil dentro
    // de GET /historico-acoes, no backend), só evita mostrar um link que
    // ia dar 403 pra quase todo mundo.
    if (usuario.perfil === 'Administrador / TI' && !sidebar.querySelector('a[href="historico.html"]')) {
      const linkHistorico = document.createElement('a');
      linkHistorico.href = 'historico.html';
      linkHistorico.textContent = '📜 Histórico';
      if (location.pathname.endsWith('historico.html')) linkHistorico.classList.add('nr-ativo');
      sidebar.insertBefore(linkHistorico, bloco);
    }

    injetarModalTrocarSenha();
    bloco.querySelector('#nr-btn-trocar-senha').addEventListener('click', () => {
      document.getElementById('nr-modal-trocar-senha').classList.add('aberto');
    });

    bloco.querySelector('#nr-btn-sair').addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
  }

  injetarEstilo();

  fetch('/auth/me')
    .then(async (resp) => {
      if (!resp.ok) {
        window.location.href = 'login.html';
        return;
      }
      const usuario = await resp.json();
      window.usuarioLogado = usuario;
      const injetar = () => injetarBarraUsuario(usuario);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injetar);
      } else {
        injetar();
      }
    })
    .catch(() => {
      // Falha de rede não redireciona (evita loop se o servidor cair um
      // instante) — a tela simplesmente vai falhar nas próprias chamadas.
    });
})();
