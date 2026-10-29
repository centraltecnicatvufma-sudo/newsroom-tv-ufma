const express = require('express');
const router = express.Router();
const db = require('./banco');

const CAMPOS_ENVOLVIDOS = ['produtor', 'reporter', 'editor_imagens', 'cinegrafista', 'motorista'];

function usuariosEnvolvidos(pautaId) {
  const pauta = db.prepare(`
    SELECT ${CAMPOS_ENVOLVIDOS.map(c => `pautas.${c}`).join(', ')},
      pautas.equipe_extra, sugestoes.enviado_por AS sugestao_autor
    FROM pautas
    LEFT JOIN sugestoes ON sugestoes.id = pautas.sugestao_id
    WHERE pautas.id = ?
  `).get(pautaId);
  if (!pauta) return [];

  const nomes = new Set(CAMPOS_ENVOLVIDOS.map(c => pauta[c]).filter(Boolean).map(n => n.trim().toLocaleLowerCase('pt-BR')));
  if (pauta.sugestao_autor) nomes.add(pauta.sugestao_autor.trim().toLocaleLowerCase('pt-BR'));
  String(pauta.equipe_extra || '').split(',').map(n => n.trim().toLocaleLowerCase('pt-BR')).filter(Boolean).forEach(n => nomes.add(n));
  if (!nomes.size) return [];

  return db.prepare('SELECT id, nome FROM equipe_agenda WHERE excluido_em IS NULL').all()
    .filter(m => nomes.has(String(m.nome || '').trim().toLocaleLowerCase('pt-BR')));
}

function notificarEnvolvidos(req, pautaId, autorId, tipo, mensagem) {
  const destinatarios = usuariosEnvolvidos(pautaId).filter(u => u.id !== autorId);
  if (!destinatarios.length) return;

  const criadoEm = new Date().toISOString();
  const inserir = db.prepare(`
    INSERT INTO notificacoes (usuario_id, pauta_id, tipo, titulo, mensagem, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const salvar = db.transaction(() => {
    destinatarios.forEach(u => inserir.run(u.id, pautaId, tipo, mensagem, mensagem, criadoEm));
  });
  salvar();

  destinatarios.forEach(u => {
    req.app.get('tempoReal')?.broadcast({ tipo: 'notificacoes', usuario_id: u.id });
  });
}

router.get('/', (req, res) => {
  const notificacoes = db.prepare(`
    SELECT n.*, p.titulo AS pauta_titulo
    FROM notificacoes n
    LEFT JOIN pautas p ON p.id = n.pauta_id
    WHERE n.usuario_id = ?
    ORDER BY n.id DESC
    LIMIT 100
  `).all(req.usuario.id);
  res.json(notificacoes);
});

router.patch('/lidas', (req, res) => {
  const resultado = db.prepare(`
    UPDATE notificacoes SET lida_em = ?
    WHERE usuario_id = ? AND lida_em IS NULL
  `).run(new Date().toISOString(), req.usuario.id);
  res.json({ atualizadas: resultado.changes });
});

router.patch('/:id/lida', (req, res) => {
  const resultado = db.prepare(`
    UPDATE notificacoes SET lida_em = ?
    WHERE id = ? AND usuario_id = ? AND lida_em IS NULL
  `).run(new Date().toISOString(), Number(req.params.id), req.usuario.id);
  if (!resultado.changes) return res.status(404).json({ erro: 'Notificação não encontrada ou já lida' });
  res.status(204).send();
});

module.exports = router;
module.exports.notificarEnvolvidos = notificarEnvolvidos;