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
    WHERE agendamentos.excluido_em IS NULL
  `;
  const params = [];

  if (dataFiltro) {
    query += ' AND agendamentos.data = ?';
    params.push(dataFiltro);
  }

  query += ' ORDER BY agendamentos.data ASC, agendamentos.hora ASC';

  const agendamentos = db.prepare(query).all(...params);
  res.json(agendamentos);
});

// GET /agenda/lixeira -> agendamentos na lixeira (soft delete)
router.get('/lixeira', (req, res) => {
  const lista = db.prepare(`
    SELECT agendamentos.*, programas_quadros.nome AS programa_nome
    FROM agendamentos
    LEFT JOIN programas_quadros ON agendamentos.programa_quadro_id = programas_quadros.id
    WHERE agendamentos.excluido_em IS NOT NULL
    ORDER BY agendamentos.excluido_em DESC
  `).all();
  res.json(lista);
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

// DELETE /agenda/:id -> manda pra lixeira (soft delete)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE agendamentos SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL')
    .run(new Date().toISOString(), id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Agendamento não encontrado" });
  }

  res.status(204).send();
});

// PATCH /agenda/:id/restaurar -> tira da lixeira
router.patch('/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE agendamentos SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Agendamento não encontrado" });
  res.json(db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id));
});

// DELETE /agenda/:id/definitivo -> apaga de vez (só a partir da Lixeira)
router.delete('/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM agendamentos WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Agendamento não encontrado" });
  res.status(204).send();
});

// --- Programas e Quadros ---

router.get('/programas', (req, res) => {
  const lista = db.prepare('SELECT * FROM programas_quadros WHERE excluido_em IS NULL ORDER BY nome ASC').all();
  res.json(lista);
});

router.get('/programas/lixeira', (req, res) => {
  const lista = db.prepare('SELECT * FROM programas_quadros WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC').all();
  res.json(lista);
});

router.post('/programas', (req, res) => {
  const { tipo, nome } = req.body;
  const resultado = db.prepare('INSERT INTO programas_quadros (tipo, nome) VALUES (?, ?)').run(tipo, nome);
  const novo = db.prepare('SELECT * FROM programas_quadros WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

router.patch('/programas/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM programas_quadros WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const tipo = req.body.tipo !== undefined ? req.body.tipo : item.tipo;
  const nome = req.body.nome !== undefined ? req.body.nome : item.nome;

  db.prepare('UPDATE programas_quadros SET tipo = ?, nome = ? WHERE id = ?').run(tipo, nome, id);

  const atualizado = db.prepare('SELECT * FROM programas_quadros WHERE id = ?').get(id);
  res.json(atualizado);
});

router.delete('/programas/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE programas_quadros SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL')
    .run(new Date().toISOString(), id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  res.status(204).send();
});

router.patch('/programas/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE programas_quadros SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Item não encontrado" });
  res.json(db.prepare('SELECT * FROM programas_quadros WHERE id = ?').get(id));
});

router.delete('/programas/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM programas_quadros WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Item não encontrado" });
  res.status(204).send();
});

// --- Equipe ---

router.get('/equipe', (req, res) => {
  const lista = db.prepare('SELECT * FROM equipe_agenda WHERE excluido_em IS NULL ORDER BY nome ASC').all();
  res.json(lista);
});

router.get('/equipe/lixeira', (req, res) => {
  const lista = db.prepare('SELECT * FROM equipe_agenda WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC').all();
  res.json(lista);
});

router.post('/equipe', (req, res) => {
  const { nome, funcao } = req.body;
  const resultado = db.prepare('INSERT INTO equipe_agenda (nome, funcao) VALUES (?, ?)').run(nome, funcao);
  const novo = db.prepare('SELECT * FROM equipe_agenda WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});
router.patch('/equipe/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM equipe_agenda WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Membro não encontrado" });
  }

  const nome = req.body.nome !== undefined ? req.body.nome : item.nome;
  const funcao = req.body.funcao !== undefined ? req.body.funcao : item.funcao;

  db.prepare('UPDATE equipe_agenda SET nome = ?, funcao = ? WHERE id = ?').run(nome, funcao, id);

  const atualizado = db.prepare('SELECT * FROM equipe_agenda WHERE id = ?').get(id);
  res.json(atualizado);
});

router.delete('/equipe/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE equipe_agenda SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL')
    .run(new Date().toISOString(), id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Membro não encontrado" });
  }

  res.status(204).send();
});

router.patch('/equipe/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE equipe_agenda SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Membro não encontrado" });
  res.json(db.prepare('SELECT * FROM equipe_agenda WHERE id = ?').get(id));
});

router.delete('/equipe/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM equipe_agenda WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Membro não encontrado" });
  res.status(204).send();
});

module.exports = router;
