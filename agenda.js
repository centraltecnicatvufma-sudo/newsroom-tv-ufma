const express = require('express');
const router = express.Router();
const db = require('./banco');

// GET /agenda?data=2026-08-28 -> lista agendamentos de um dia específico
router.get('/', (req, res) => {
  const dataFiltro = req.query.data;

  let query = `
    SELECT agendamentos.*, programas_quadros.nome AS programa_nome
    FROM agendamentos
    LEFT JOIN programas_quadros ON agendamentos.programa_quadro_id = programas_quadros.id
  `;
  const params = [];

  if (dataFiltro) {
    query += ' WHERE agendamentos.data = ?';
    params.push(dataFiltro);
  }

  query += ' ORDER BY agendamentos.data ASC, agendamentos.hora ASC';

  const agendamentos = db.prepare(query).all(...params);
  res.json(agendamentos);
});

// POST /agenda -> cria um novo agendamento
router.post('/', (req, res) => {
  const { programa_quadro_id, data, hora, local, equipe, observacao } = req.body;

  const resultado = db.prepare(`
    INSERT INTO agendamentos (programa_quadro_id, data, hora, local, equipe, observacao, status)
    VALUES (?, ?, ?, ?, ?, ?, 'agendado')
  `).run(programa_quadro_id, data, hora, local, equipe, observacao || '');

  const novo = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

// PATCH /agenda/:id -> edita um agendamento (inclui mudar status)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Agendamento não encontrado" });
  }

  const atualizado = {
    programa_quadro_id: req.body.programa_quadro_id !== undefined ? req.body.programa_quadro_id : item.programa_quadro_id,
    data: req.body.data !== undefined ? req.body.data : item.data,
    hora: req.body.hora !== undefined ? req.body.hora : item.hora,
    local: req.body.local !== undefined ? req.body.local : item.local,
    equipe: req.body.equipe !== undefined ? req.body.equipe : item.equipe,
    observacao: req.body.observacao !== undefined ? req.body.observacao : item.observacao,
    status: req.body.status !== undefined ? req.body.status : item.status,
  };

  db.prepare(`
    UPDATE agendamentos SET programa_quadro_id = ?, data = ?, hora = ?, local = ?, equipe = ?, observacao = ?, status = ?
    WHERE id = ?
  `).run(atualizado.programa_quadro_id, atualizado.data, atualizado.hora, atualizado.local, atualizado.equipe, atualizado.observacao, atualizado.status, id);

  const item_atualizado = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
  res.json(item_atualizado);
});

// DELETE /agenda/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM agendamentos WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Agendamento não encontrado" });
  }

  res.status(204).send();
});

// --- Programas e Quadros ---

router.get('/programas', (req, res) => {
  const lista = db.prepare('SELECT * FROM programas_quadros ORDER BY nome ASC').all();
  res.json(lista);
});

router.post('/programas', (req, res) => {
  const { tipo, nome } = req.body;
  const resultado = db.prepare('INSERT INTO programas_quadros (tipo, nome) VALUES (?, ?)').run(tipo, nome);
  const novo = db.prepare('SELECT * FROM programas_quadros WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

// --- Equipe ---

router.get('/equipe', (req, res) => {
  const lista = db.prepare('SELECT * FROM equipe_agenda ORDER BY nome ASC').all();
  res.json(lista);
});

router.post('/equipe', (req, res) => {
  const { nome, funcao } = req.body;
  const resultado = db.prepare('INSERT INTO equipe_agenda (nome, funcao) VALUES (?, ?)').run(nome, funcao);
  const novo = db.prepare('SELECT * FROM equipe_agenda WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

module.exports = router;