const express = require('express');
const router = express.Router();
const db = require('./banco');

// GET /espelhos -> lista todos os espelhos
router.get('/', (req, res) => {
  const espelhos = db.prepare('SELECT * FROM espelhos').all();
  res.json(espelhos);
});

// GET /espelhos/:id -> busca um espelho específico
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const espelho = db.prepare('SELECT * FROM espelhos WHERE id = ?').get(id);

  if (!espelho) {
    return res.status(404).json({ erro: "Espelho não encontrado" });
  }

  res.json(espelho);
});

// POST /espelhos -> cria um novo espelho
router.post('/', (req, res) => {
  const { programa, data, duracao_total_prevista } = req.body;

  const resultado = db.prepare(`
    INSERT INTO espelhos (programa, data, duracao_total_prevista, status_espelho)
    VALUES (?, ?, ?, 'em_montagem')
  `).run(programa, data, duracao_total_prevista);

  const novoEspelho = db.prepare('SELECT * FROM espelhos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoEspelho);
});

// PATCH /espelhos/:id -> atualiza um espelho (ex: mudar status)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const espelho = db.prepare('SELECT * FROM espelhos WHERE id = ?').get(id);

  if (!espelho) {
    return res.status(404).json({ erro: "Espelho não encontrado" });
  }

  const atualizado = {
    programa: req.body.programa !== undefined ? req.body.programa : espelho.programa,
    data: req.body.data !== undefined ? req.body.data : espelho.data,
    duracao_total_prevista: req.body.duracao_total_prevista !== undefined ? req.body.duracao_total_prevista : espelho.duracao_total_prevista,
    status_espelho: req.body.status_espelho !== undefined ? req.body.status_espelho : espelho.status_espelho,
  };

  db.prepare(`
    UPDATE espelhos SET programa = ?, data = ?, duracao_total_prevista = ?, status_espelho = ?
    WHERE id = ?
  `).run(atualizado.programa, atualizado.data, atualizado.duracao_total_prevista, atualizado.status_espelho, id);

  const espelhoAtualizado = db.prepare('SELECT * FROM espelhos WHERE id = ?').get(id);
  res.json(espelhoAtualizado);
});

// DELETE /espelhos/:id -> remove um espelho
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM espelhos WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Espelho não encontrado" });
  }

  res.status(204).send();
});

module.exports = router;