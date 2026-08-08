const express = require('express');
const router = express.Router();
const db = require('./banco');

// --- Tipos de turno ---

router.get('/turnos', (req, res) => {
  res.json(db.prepare('SELECT * FROM turnos_tipo WHERE excluido_em IS NULL ORDER BY hora_inicio ASC').all());
});

// GET /escala/turnos/lixeira -> tipos de turno na lixeira (soft delete)
router.get('/turnos/lixeira', (req, res) => {
  res.json(db.prepare('SELECT * FROM turnos_tipo WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC').all());
});

router.post('/turnos', (req, res) => {
  const { nome, hora_inicio, hora_fim } = req.body;
  if (!nome || !hora_inicio || !hora_fim) return res.status(400).json({ erro: 'Nome, hora de início e hora de fim são obrigatórios' });

  const resultado = db.prepare('INSERT INTO turnos_tipo (nome, hora_inicio, hora_fim) VALUES (?, ?, ?)').run(nome, hora_inicio, hora_fim);
  res.status(201).json(db.prepare('SELECT * FROM turnos_tipo WHERE id = ?').get(resultado.lastInsertRowid));
});

router.patch('/turnos/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM turnos_tipo WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: 'Turno não encontrado' });

  const nome = req.body.nome !== undefined ? req.body.nome : item.nome;
  const hora_inicio = req.body.hora_inicio !== undefined ? req.body.hora_inicio : item.hora_inicio;
  const hora_fim = req.body.hora_fim !== undefined ? req.body.hora_fim : item.hora_fim;

  db.prepare('UPDATE turnos_tipo SET nome = ?, hora_inicio = ?, hora_fim = ? WHERE id = ?').run(nome, hora_inicio, hora_fim, id);
  res.json(db.prepare('SELECT * FROM turnos_tipo WHERE id = ?').get(id));
});

router.delete('/turnos/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE turnos_tipo SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL')
    .run(new Date().toISOString(), id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Turno não encontrado' });
  res.status(204).send();
});

router.patch('/turnos/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE turnos_tipo SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Turno não encontrado' });
  res.json(db.prepare('SELECT * FROM turnos_tipo WHERE id = ?').get(id));
});

router.delete('/turnos/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM turnos_tipo WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Turno não encontrado' });
  res.status(204).send();
});

// --- Escala (membro x dia) ---

// GET /escala?data_inicial=X&data_final=Y -> entradas no período, com nome/função
// do membro e horário do turno já resolvidos (evita N chamadas no front)
router.get('/', (req, res) => {
  const { data_inicial, data_final } = req.query;

  let query = `
    SELECT escala.*, equipe_agenda.nome AS membro_nome, equipe_agenda.funcao AS membro_funcao,
           turnos_tipo.nome AS turno_nome, turnos_tipo.hora_inicio AS turno_hora_inicio, turnos_tipo.hora_fim AS turno_hora_fim
    FROM escala
    JOIN equipe_agenda ON escala.membro_id = equipe_agenda.id
    LEFT JOIN turnos_tipo ON escala.turno_tipo_id = turnos_tipo.id
    WHERE 1=1
  `;
  const params = [];
  if (data_inicial) { query += ' AND escala.data >= ?'; params.push(data_inicial); }
  if (data_final) { query += ' AND escala.data <= ?'; params.push(data_final); }
  query += ' ORDER BY escala.data ASC';

  res.json(db.prepare(query).all(...params));
});

// POST /escala -> define a escala de um membro num dia (substitui se já existir
// uma entrada pra esse membro+data, pra célula do grid sempre "salvar" com uma
// chamada só, sem o front precisar saber se é criação ou edição)
router.post('/', (req, res) => {
  const { membro_id, data, status, turno_tipo_id } = req.body;
  if (!membro_id || !data || !status) return res.status(400).json({ erro: 'membro_id, data e status são obrigatórios' });

  const existente = db.prepare('SELECT id FROM escala WHERE membro_id = ? AND data = ?').get(membro_id, data);

  if (existente) {
    db.prepare('UPDATE escala SET status = ?, turno_tipo_id = ? WHERE id = ?').run(status, turno_tipo_id || null, existente.id);
    return res.json(db.prepare('SELECT * FROM escala WHERE id = ?').get(existente.id));
  }

  const resultado = db.prepare('INSERT INTO escala (membro_id, data, status, turno_tipo_id) VALUES (?, ?, ?, ?)')
    .run(membro_id, data, status, turno_tipo_id || null);
  res.status(201).json(db.prepare('SELECT * FROM escala WHERE id = ?').get(resultado.lastInsertRowid));
});

// DELETE /escala/:id -> limpa uma célula da escala
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM escala WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Entrada de escala não encontrada' });
  res.status(204).send();
});

// --- Vínculos de dupla ---

router.get('/duplas', (req, res) => {
  const lista = db.prepare(`
    SELECT vinculos_equipe.*, a.nome AS membro_a_nome, b.nome AS membro_b_nome
    FROM vinculos_equipe
    JOIN equipe_agenda a ON vinculos_equipe.membro_a_id = a.id
    JOIN equipe_agenda b ON vinculos_equipe.membro_b_id = b.id
    ORDER BY vinculos_equipe.id ASC
  `).all();
  res.json(lista);
});

router.post('/duplas', (req, res) => {
  const { nome, membro_a_id, membro_b_id } = req.body;
  if (!membro_a_id || !membro_b_id) return res.status(400).json({ erro: 'membro_a_id e membro_b_id são obrigatórios' });

  const resultado = db.prepare('INSERT INTO vinculos_equipe (nome, membro_a_id, membro_b_id) VALUES (?, ?, ?)')
    .run(nome || '', membro_a_id, membro_b_id);
  res.status(201).json(db.prepare('SELECT * FROM vinculos_equipe WHERE id = ?').get(resultado.lastInsertRowid));
});

router.delete('/duplas/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM vinculos_equipe WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Vínculo não encontrado' });
  res.status(204).send();
});

module.exports = router;
