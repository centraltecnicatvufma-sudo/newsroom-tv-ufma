const express = require('express');
const router = express.Router();
const db = require('./banco');

// GET /calendario/eventos?ano=2026 -> eventos fixos do ano, incluindo
// recorrentes anuais salvos com outro ano (o front reescreve a data pro
// ano pedido antes de exibir)
router.get('/eventos', (req, res) => {
  const lista = db.prepare('SELECT * FROM eventos_calendario ORDER BY data ASC').all();
  res.json(lista);
});

// POST /calendario/eventos -> cria um evento fixo/efeméride
router.post('/eventos', (req, res) => {
  const { titulo, data, recorrente_anual, observacao } = req.body;
  if (!titulo || !data) return res.status(400).json({ erro: 'Título e data são obrigatórios' });

  const resultado = db.prepare(`
    INSERT INTO eventos_calendario (titulo, data, recorrente_anual, observacao)
    VALUES (?, ?, ?, ?)
  `).run(titulo, data, recorrente_anual ? 1 : 0, observacao || '');

  const novo = db.prepare('SELECT * FROM eventos_calendario WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

// PATCH /calendario/eventos/:id
router.patch('/eventos/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM eventos_calendario WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: 'Evento não encontrado' });

  const atualizado = {
    titulo: req.body.titulo !== undefined ? req.body.titulo : item.titulo,
    data: req.body.data !== undefined ? req.body.data : item.data,
    recorrente_anual: req.body.recorrente_anual !== undefined ? (req.body.recorrente_anual ? 1 : 0) : item.recorrente_anual,
    observacao: req.body.observacao !== undefined ? req.body.observacao : item.observacao,
  };

  db.prepare(`
    UPDATE eventos_calendario SET titulo = ?, data = ?, recorrente_anual = ?, observacao = ?
    WHERE id = ?
  `).run(atualizado.titulo, atualizado.data, atualizado.recorrente_anual, atualizado.observacao, id);

  res.json(db.prepare('SELECT * FROM eventos_calendario WHERE id = ?').get(id));
});

// DELETE /calendario/eventos/:id
router.delete('/eventos/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM eventos_calendario WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Evento não encontrado' });
  res.status(204).send();
});

module.exports = router;
