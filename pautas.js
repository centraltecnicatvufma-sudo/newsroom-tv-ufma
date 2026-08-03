const express = require('express');
const router = express.Router();
const db = require('./banco');

function buscarFontes(pautaId) {
  return db.prepare('SELECT * FROM pauta_fontes WHERE pauta_id = ?').all(pautaId);
}

// GET /pautas -> lista com filtros opcionais: programa_id, status, data_fato, busca (por título)
router.get('/', (req, res) => {
  const { programa_id, status, data_fato, busca } = req.query;

  let query = 'SELECT * FROM pautas WHERE 1=1';
  const params = [];

  if (programa_id) { query += ' AND programa_id = ?'; params.push(programa_id); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (data_fato) { query += ' AND data_fato = ?'; params.push(data_fato); }
  if (busca) { query += ' AND titulo LIKE ?'; params.push('%' + busca + '%'); }

  query += ' ORDER BY id DESC';

  const lista = db.prepare(query).all(...params);
  res.json(lista);
});

// GET /pautas/:id -> detalhe + fontes
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  if (!pauta) return res.status(404).json({ erro: 'Pauta não encontrada' });
  pauta.fontes = buscarFontes(id);
  res.json(pauta);
});

// POST /pautas -> cria pauta (+ fontes, se enviadas)
router.post('/', (req, res) => {
  const {
    sugestao_id, titulo, programa_id,
    destino_tv, destino_instagram, destino_youtube, destino_site,
    orientacao, roteiro, local, anexos,
    reporter, cinegrafista, motorista,
    equip_lapela, equip_iluminacao, equip_mochilink,
    data_fato, hora_fato, status, fontes
  } = req.body;

  if (!titulo) return res.status(400).json({ erro: 'Título é obrigatório' });

  const resultado = db.prepare(`
    INSERT INTO pautas (
      sugestao_id, titulo, programa_id,
      destino_tv, destino_instagram, destino_youtube, destino_site,
      orientacao, roteiro, local, anexos,
      reporter, cinegrafista, motorista,
      equip_lapela, equip_iluminacao, equip_mochilink,
      data_fato, hora_fato, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sugestao_id || null, titulo, programa_id || null,
    destino_tv ? 1 : 0, destino_instagram ? 1 : 0, destino_youtube ? 1 : 0, destino_site ? 1 : 0,
    orientacao || '', roteiro || '', local || '', anexos || '',
    reporter || '', cinegrafista || '', motorista || '',
    equip_lapela ? 1 : 0, equip_iluminacao ? 1 : 0, equip_mochilink ? 1 : 0,
    data_fato || '', hora_fato || '', status || 'em_producao'
  );

  const novaId = resultado.lastInsertRowid;

  if (Array.isArray(fontes)) {
    const inserirFonte = db.prepare(`
      INSERT INTO pauta_fontes (pauta_id, nome, cargo, contato, horario_confirmado)
      VALUES (?, ?, ?, ?, ?)
    `);
    fontes.forEach(f => {
      inserirFonte.run(novaId, f.nome || '', f.cargo || '', f.contato || '', f.horario_confirmado || '');
    });
  }

  const nova = db.prepare('SELECT * FROM pautas WHERE id = ?').get(novaId);
  nova.fontes = buscarFontes(novaId);
  res.status(201).json(nova);
});

// PATCH /pautas/:id -> edita campos (+ substitui fontes, se enviadas)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: 'Pauta não encontrada' });

  const campos = [
    'sugestao_id', 'titulo', 'programa_id',
    'destino_tv', 'destino_instagram', 'destino_youtube', 'destino_site',
    'orientacao', 'roteiro', 'local', 'anexos',
    'reporter', 'cinegrafista', 'motorista',
    'equip_lapela', 'equip_iluminacao', 'equip_mochilink',
    'data_fato', 'hora_fato', 'status'
  ];

  const atualizado = {};
  campos.forEach(c => {
    atualizado[c] = req.body[c] !== undefined ? req.body[c] : item[c];
  });

  db.prepare(`
    UPDATE pautas SET
      sugestao_id=?, titulo=?, programa_id=?,
      destino_tv=?, destino_instagram=?, destino_youtube=?, destino_site=?,
      orientacao=?, roteiro=?, local=?, anexos=?,
      reporter=?, cinegrafista=?, motorista=?,
      equip_lapela=?, equip_iluminacao=?, equip_mochilink=?,
      data_fato=?, hora_fato=?, status=?
    WHERE id = ?
  `).run(
    atualizado.sugestao_id, atualizado.titulo, atualizado.programa_id,
    atualizado.destino_tv ? 1 : 0, atualizado.destino_instagram ? 1 : 0,
    atualizado.destino_youtube ? 1 : 0, atualizado.destino_site ? 1 : 0,
    atualizado.orientacao, atualizado.roteiro, atualizado.local, atualizado.anexos,
    atualizado.reporter, atualizado.cinegrafista, atualizado.motorista,
    atualizado.equip_lapela ? 1 : 0, atualizado.equip_iluminacao ? 1 : 0, atualizado.equip_mochilink ? 1 : 0,
    atualizado.data_fato, atualizado.hora_fato, atualizado.status,
    id
  );

  if (Array.isArray(req.body.fontes)) {
    db.prepare('DELETE FROM pauta_fontes WHERE pauta_id = ?').run(id);
    const inserirFonte = db.prepare(`
      INSERT INTO pauta_fontes (pauta_id, nome, cargo, contato, horario_confirmado)
      VALUES (?, ?, ?, ?, ?)
    `);
    req.body.fontes.forEach(f => {
      inserirFonte.run(id, f.nome || '', f.cargo || '', f.contato || '', f.horario_confirmado || '');
    });
  }

  const item_atualizado = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  item_atualizado.fontes = buscarFontes(id);
  res.json(item_atualizado);
});

// DELETE /pautas/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM pauta_fontes WHERE pauta_id = ?').run(id);
  const resultado = db.prepare('DELETE FROM pautas WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: 'Pauta não encontrada' });
  }

  res.status(204).send();
});

module.exports = router;