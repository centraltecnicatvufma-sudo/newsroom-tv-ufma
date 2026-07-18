const express = require('express');
const router = express.Router();
const db = require('./banco');

// GET /materia?pauta_id=1 -> lista os itens da matéria de uma pauta, na ordem
router.get('/', (req, res) => {
  const pautaId = req.query.pauta_id;

  if (!pautaId) {
    return res.status(400).json({ erro: "Informe o pauta_id" });
  }

  const itens = db.prepare(
    'SELECT * FROM materia_itens WHERE pauta_id = ? ORDER BY ordem ASC'
  ).all(pautaId);

  res.json(itens);
});

// POST /materia -> adiciona um novo item (OFF, SONORA ou PASSAGEM) à matéria
router.post('/', (req, res) => {
  const { pauta_id, tipo, texto } = req.body;

  const ultimo = db.prepare(
    'SELECT MAX(ordem) AS maior FROM materia_itens WHERE pauta_id = ?'
  ).get(pauta_id);
  const novaOrdem = (ultimo.maior || 0) + 1;

  const resultado = db.prepare(`
    INSERT INTO materia_itens (pauta_id, ordem, tipo, texto)
    VALUES (?, ?, ?, ?)
  `).run(pauta_id, novaOrdem, tipo, texto || '');

  const novoItem = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoItem);
});

// PATCH /materia/:id -> edita o texto de um item
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const novoTexto = req.body.texto !== undefined ? req.body.texto : item.texto;

  db.prepare('UPDATE materia_itens SET texto = ? WHERE id = ?').run(novoTexto, id);

  const itemAtualizado = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);
  res.json(itemAtualizado);
});

// DELETE /materia/:id -> remove um item
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM materia_itens WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  res.status(204).send();
});

module.exports = router;