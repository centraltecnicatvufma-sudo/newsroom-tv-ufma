const express = require('express');
const router = express.Router();
const db = require('./banco');

// Se a tabela estiver vazia, insere as duas pautas de exemplo
const contagem = db.prepare('SELECT COUNT(*) AS total FROM pautas').get();
if (contagem.total === 0) {
  const inserir = db.prepare(`
    INSERT INTO pautas (retranca, editoria, produtor, reporter, editor, status, data, prazo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  inserir.run("CHUVAS-COHAMA", "Geral", "Ana Kelly", "Pedro Reis", "Marcos Lima", "em_producao", "2026-07-17", "hoje 16h");
  inserir.run("VACINA-UFMA", "Geral", "Ana Kelly", "Carla Dias", "", "aprovada", "2026-07-17", "hoje 17h");
}

// GET /pautas -> lista todas as pautas
router.get('/', (req, res) => {
  const pautas = db.prepare('SELECT * FROM pautas').all();
  res.json(pautas);
});

// GET /pautas/buscar?retranca=NOME -> busca pauta pela retranca
router.get('/buscar', (req, res) => {
  const retrancaBuscada = req.query.retranca;

  if (!retrancaBuscada) {
    return res.status(400).json({ erro: "Informe a retranca na busca" });
  }

  const encontrada = db.prepare(
    'SELECT * FROM pautas WHERE UPPER(retranca) = UPPER(?)'
  ).get(retrancaBuscada);

  if (!encontrada) {
    return res.status(404).json({ erro: "Nenhuma pauta encontrada com essa retranca" });
  }

  res.json(encontrada);
});

// POST /pautas -> cria uma nova pauta
router.post('/', (req, res) => {
  const { retranca, editoria, produtor, reporter, editor, data, prazo } = req.body;

  const resultado = db.prepare(`
    INSERT INTO pautas (retranca, editoria, produtor, reporter, editor, status, data, prazo)
    VALUES (?, ?, ?, ?, ?, 'sugerida', ?, ?)
  `).run(retranca, editoria, produtor, reporter, editor, data, prazo);

  const novaPauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novaPauta);
});

// PATCH /pautas/:id -> atualiza uma pauta existente
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);

  if (!pauta) {
    return res.status(404).json({ erro: "Pauta não encontrada" });
  }

const atualizada = {
    retranca: req.body.retranca !== undefined ? req.body.retranca : pauta.retranca,
    editoria: req.body.editoria !== undefined ? req.body.editoria : pauta.editoria,
    produtor: req.body.produtor !== undefined ? req.body.produtor : pauta.produtor,
    reporter: req.body.reporter !== undefined ? req.body.reporter : pauta.reporter,
    editor: req.body.editor !== undefined ? req.body.editor : pauta.editor,
    status: req.body.status !== undefined ? req.body.status : pauta.status,
    data: req.body.data !== undefined ? req.body.data : pauta.data,
    prazo: req.body.prazo !== undefined ? req.body.prazo : pauta.prazo,
  };

  db.prepare(`
    UPDATE pautas SET retranca = ?, editoria = ?, produtor = ?, reporter = ?, editor = ?, status = ?, data = ?, prazo = ?
    WHERE id = ?
  `).run(atualizada.retranca, atualizada.editoria, atualizada.produtor, atualizada.reporter, atualizada.editor, atualizada.status, atualizada.data, atualizada.prazo, id);

  const pautaAtualizada = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  res.json(pautaAtualizada);
});

// DELETE /pautas/:id -> remove uma pauta
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM pautas WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Pauta não encontrada" });
  }

  res.status(204).send();
});

module.exports = router;