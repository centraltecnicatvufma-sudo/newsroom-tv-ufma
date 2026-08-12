const express = require('express');
const router = express.Router();
const db = require('./banco');

// Rótulo legível por prefixo de rota — cai no próprio prefixo (capitalizado)
// se não estiver mapeado, então rotas novas nunca ficam "invisíveis" no
// histórico, só menos bonitas até alguém adicionar aqui.
const ROTULOS_RECURSO = {
  pautas: 'Pauta',
  blocos: 'Bloco do Espelho',
  espelhos: 'Espelho',
  materia: 'Lauda',
  sugestoes: 'Sugestão',
  alertas: 'Alerta de Breaking News',
  calendario: 'Evento do Calendário',
  escala: 'Escala de Equipe'
};

const ROTULOS_ACAO = { POST: 'Criou', PATCH: 'Editou', DELETE: 'Excluiu', PUT: 'Editou' };

// Caminhos que existem mas não interessam pro histórico de "ações de
// conteúdo" — housekeeping técnico (bloqueio de edição, tick de leitura)
// que dispara toda hora e só faria ruído; chat tem histórico próprio
// (chat_mensagens), não precisa duplicar aqui.
function rotaIgnorada(caminho) {
  return /\/bloquear(\/forcar)?$/.test(caminho) || caminho.startsWith('/chat');
}

// Monta uma descrição legível a partir do método + caminho, sem precisar
// de código dedicado em cada rota — funciona pra qualquer rota nova que
// apareça no futuro, só menos "bonita" (cai no segmento cru) se não
// estiver na tabela de rótulos.
function descreverAcao(metodo, caminho) {
  const segmentos = caminho.split('/').filter(Boolean);
  let recursoChave = segmentos[0] || '';
  let consumidos = 1;
  let id = segmentos[1] && /^\d+$/.test(segmentos[1]) ? segmentos[1] : null;
  if (id) consumidos = 2;

  // /agenda/equipe/:id é um recurso diferente de /agenda/:id (agendamento)
  if (recursoChave === 'agenda' && segmentos[1] === 'equipe') {
    recursoChave = 'agenda/equipe';
    consumidos = 2;
    id = segmentos[2] && /^\d+$/.test(segmentos[2]) ? segmentos[2] : null;
    if (id) consumidos = 3;
  }

  const rotulos = { ...ROTULOS_RECURSO, 'agenda/equipe': 'Membro da Equipe', agenda: 'Agendamento' };
  const rotuloRecurso = rotulos[recursoChave] || (recursoChave.charAt(0).toUpperCase() + recursoChave.slice(1));
  const rotuloAcao = ROTULOS_ACAO[metodo] || metodo;

  // Ações que não são criar/editar/excluir de um :id direto (ex.
  // /pautas/:id/restaurar, /pautas/:id/definitivo) ficam com o caminho
  // completo depois do id, pra não perder a informação.
  const restoDoCaminho = segmentos.slice(consumidos).join('/');
  const sufixo = restoDoCaminho ? ` (${restoDoCaminho})` : '';

  return `${rotuloAcao} ${rotuloRecurso}${id ? ' #' + id : ''}${sufixo}`;
}

// Middleware genérico — regsitra automaticamente toda requisição que
// muda dado (POST/PATCH/PUT/DELETE) feita por um usuário autenticado.
// Roda DEPOIS que a resposta já foi enviada (res.on('finish')), então
// nunca atrasa nem quebra a requisição original mesmo se o registro
// falhar por algum motivo.
function registrarAcoes(req, res, next) {
  const metodosAuditados = ['POST', 'PATCH', 'PUT', 'DELETE'];
  // Captura o caminho AGORA, antes de next() — Express reescreve req.url
  // (e por tabela req.path) conforme a requisição desce pelos
  // sub-roteadores montados com app.use('/prefixo', ...), então lido de
  // dentro do listener 'finish' (que dispara depois de tudo) já vinha
  // errado (só o pedaço relativo ao último roteador, ex. "/33" em vez de
  // "/pautas/33"). req.originalUrl nunca é reescrito, é sempre o caminho
  // completo pedido — por isso usa ele, não req.path.
  const caminho = req.originalUrl.split('?')[0];

  if (metodosAuditados.includes(req.method) && !rotaIgnorada(caminho) && req.usuario) {
    const usuarioId = req.usuario.id;
    const usuarioNome = req.usuario.nome;
    const metodo = req.method;
    res.on('finish', () => {
      try {
        db.prepare(`
          INSERT INTO historico_acoes (usuario_id, usuario_nome, metodo, rota, descricao, status_http, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          usuarioId, usuarioNome, metodo, caminho,
          descreverAcao(metodo, caminho), res.statusCode, new Date().toISOString()
        );
      } catch (e) {
        console.error('Falha ao registrar histórico de ação:', e.message);
      }
    });
  }
  next();
}

function exigirAdministrador(req, res, next) {
  if (req.usuario?.perfil !== 'Administrador / TI') {
    return res.status(403).json({ erro: 'Só um Administrador pode ver o histórico' });
  }
  next();
}

// GET /historico-acoes -> lista (mais recente primeiro), com filtros
// opcionais por usuário e por período. Só Administrador/TI.
router.get('/', exigirAdministrador, (req, res) => {
  const { usuario_id, data_inicio, data_fim } = req.query;

  let query = 'SELECT * FROM historico_acoes WHERE 1=1';
  const params = [];

  if (usuario_id) { query += ' AND usuario_id = ?'; params.push(Number(usuario_id)); }
  if (data_inicio) { query += ' AND criado_em >= ?'; params.push(data_inicio); }
  if (data_fim) { query += ' AND criado_em <= ?'; params.push(data_fim + 'T23:59:59'); }

  query += ' ORDER BY id DESC LIMIT 1000';

  res.json(db.prepare(query).all(...params));
});

module.exports = router;
module.exports.registrarAcoes = registrarAcoes;
