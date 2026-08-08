const express = require('express');
const router = express.Router();
const db = require('./banco');

function avisarMudanca(req) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'alerta' });
}

// GET /alertas/ativo -> o alerta de Breaking News em vigor agora, ou null
router.get('/ativo', (req, res) => {
  const alerta = db.prepare('SELECT * FROM alertas_breaking WHERE ativo = 1 ORDER BY id DESC LIMIT 1').get();
  res.json(alerta || null);
});

// POST /alertas -> dispara um alerta novo (encerra qualquer um que já esteja ativo)
router.post('/', (req, res) => {
  const { mensagem, criado_por } = req.body;
  if (!mensagem || !mensagem.trim()) return res.status(400).json({ erro: 'Mensagem é obrigatória' });

  db.prepare('UPDATE alertas_breaking SET ativo = 0 WHERE ativo = 1').run();
  const resultado = db.prepare(`
    INSERT INTO alertas_breaking (mensagem, ativo, criado_por, criado_em)
    VALUES (?, 1, ?, ?)
  `).run(mensagem.trim(), criado_por || '', new Date().toISOString());

  const novo = db.prepare('SELECT * FROM alertas_breaking WHERE id = ?').get(resultado.lastInsertRowid);
  avisarMudanca(req);
  res.status(201).json(novo);
});

// PATCH /alertas/encerrar -> desativa o alerta em vigor (se houver)
router.patch('/encerrar', (req, res) => {
  db.prepare('UPDATE alertas_breaking SET ativo = 0 WHERE ativo = 1').run();
  avisarMudanca(req);
  res.status(204).send();
});

module.exports = router;
