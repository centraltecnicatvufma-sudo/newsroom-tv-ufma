const express = require('express');
const router = express.Router();
const db = require('./banco');
const { exigirNivelMinimo } = require('./permissoes');

// Mesma regra do Espelho (ver blocos.js): Operador(1) e Técnico(2) só têm
// leitura — qualquer mudança na Lauda exige pelo menos Repórter/Redator(3).
const exigirEdicaoLauda = exigirNivelMinimo(3);

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

// POST /materia -> adiciona um novo item (OFF, SONORA, PASSAGEM, ARTE ou
// SOBE_SOM) à matéria. duracao_automatica começa ligada por padrão (o tempo
// é estimado a partir do texto até o repórter desligar manualmente).
router.post('/', exigirEdicaoLauda, (req, res) => {
  const { pauta_id, tipo, texto } = req.body;

  const ultimo = db.prepare(
    'SELECT MAX(ordem) AS maior FROM materia_itens WHERE pauta_id = ?'
  ).get(pauta_id);
  const novaOrdem = (ultimo.maior || 0) + 1;

  const resultado = db.prepare(`
    INSERT INTO materia_itens (pauta_id, ordem, tipo, texto, duracao_segundos, duracao_automatica, indicacoes)
    VALUES (?, ?, ?, ?, 0, 1, '')
  `).run(pauta_id, novaOrdem, tipo, texto || '');

  const novoItem = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoItem);
});

// PATCH /materia/:id -> edita o texto, as indicações ao editor e/ou a duração de um item
router.patch('/:id', exigirEdicaoLauda, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const novoTexto = req.body.texto !== undefined ? req.body.texto : item.texto;
  const novasIndicacoes = req.body.indicacoes !== undefined ? req.body.indicacoes : item.indicacoes;
  const duracaoSegundos = req.body.duracao_segundos !== undefined ? req.body.duracao_segundos : item.duracao_segundos;
  const duracaoAutomatica = req.body.duracao_automatica !== undefined ? (req.body.duracao_automatica ? 1 : 0) : item.duracao_automatica;

  db.prepare('UPDATE materia_itens SET texto = ?, indicacoes = ?, duracao_segundos = ?, duracao_automatica = ? WHERE id = ?')
    .run(novoTexto, novasIndicacoes, duracaoSegundos, duracaoAutomatica, id);

  const itemAtualizado = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);
  res.json(itemAtualizado);
});

// DELETE /materia/:id -> remove um item
router.delete('/:id', exigirEdicaoLauda, (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM materia_itens WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  res.status(204).send();
});

// PATCH /materia/:id/ordem -> move um item para uma nova posição, reorganizando os outros
router.patch('/:id/ordem', exigirEdicaoLauda, (req, res) => {
  const id = Number(req.params.id);
  const { nova_ordem } = req.body;

  const item = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const ordemAntiga = item.ordem;
  const pautaId = item.pauta_id;

  if (nova_ordem === ordemAntiga) {
    return res.json(item);
  }

  if (nova_ordem > ordemAntiga) {
    db.prepare(`
      UPDATE materia_itens SET ordem = ordem - 1
      WHERE pauta_id = ? AND ordem > ? AND ordem <= ?
    `).run(pautaId, ordemAntiga, nova_ordem);
  } else {
    db.prepare(`
      UPDATE materia_itens SET ordem = ordem + 1
      WHERE pauta_id = ? AND ordem >= ? AND ordem < ?
    `).run(pautaId, nova_ordem, ordemAntiga);
  }

  db.prepare('UPDATE materia_itens SET ordem = ? WHERE id = ?').run(nova_ordem, id);

  const itensAtualizados = db.prepare(
    'SELECT * FROM materia_itens WHERE pauta_id = ? ORDER BY ordem ASC'
  ).all(pautaId);

  res.json(itensAtualizados);
});

// GET /materia/gcs?pauta_id=1 -> lista os GCs de uma pauta
router.get('/gcs', (req, res) => {
  const pautaId = req.query.pauta_id;
  if (!pautaId) return res.status(400).json({ erro: "Informe o pauta_id" });

  const gcs = db.prepare(
    'SELECT * FROM materia_gcs WHERE pauta_id = ? ORDER BY id ASC'
  ).all(pautaId);

  res.json(gcs);
});

// POST /materia/gcs -> adiciona um GC novo
router.post('/gcs', exigirEdicaoLauda, (req, res) => {
  const { pauta_id, nome, cargo, tempo_entrada } = req.body;

  const resultado = db.prepare(`
    INSERT INTO materia_gcs (pauta_id, nome, cargo, tempo_entrada)
    VALUES (?, ?, ?, ?)
  `).run(pauta_id, nome || '', cargo || '', tempo_entrada || '');

  const novoGc = db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoGc);
});

// PATCH /materia/gcs/:id -> edita um GC
router.patch('/gcs/:id', exigirEdicaoLauda, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: "GC não encontrado" });

  const nome = req.body.nome !== undefined ? req.body.nome : item.nome;
  const cargo = req.body.cargo !== undefined ? req.body.cargo : item.cargo;
  const tempo_entrada = req.body.tempo_entrada !== undefined ? req.body.tempo_entrada : item.tempo_entrada;

  db.prepare('UPDATE materia_gcs SET nome = ?, cargo = ?, tempo_entrada = ? WHERE id = ?')
    .run(nome, cargo, tempo_entrada, id);

  res.json(db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(id));
});

// DELETE /materia/gcs/:id -> remove um GC
router.delete('/gcs/:id', exigirEdicaoLauda, (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM materia_gcs WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "GC não encontrado" });
  }

  res.status(204).send();
});

module.exports = router;