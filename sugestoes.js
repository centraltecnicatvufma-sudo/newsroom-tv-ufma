const express = require('express');
const router = express.Router();
const db = require('./banco');
const { nivelDoUsuario } = require('./permissoes');

// Aprovar, arquivar ou colocar em análise é decisão editorial — só
// Produtor(4)/Editor-Chefe(5)/Administrador(6). Qualquer perfil pode
// CRIAR uma sugestão (POST, sem checagem) e continuar editando os
// próprios dados dela; só a mudança de status pra essas 3 etapas é
// restrita.
const STATUS_RESTRITOS_A_NIVEL_4 = ['em_analise', 'aprovada', 'arquivada'];

// Avisa quem estiver com o Mapa de Produções aberto que uma sugestão mudou
// (ver tempo_real.js)
function avisarMudanca(req) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'sugestoes' });
}

// GET /sugestoes?status=nova -> lista sugestões, opcionalmente filtradas por status
router.get('/', (req, res) => {
  const statusFiltro = req.query.status;

  let query = 'SELECT * FROM sugestoes WHERE excluido_em IS NULL';
  const params = [];

  if (statusFiltro) {
    query += ' AND status = ?';
    params.push(statusFiltro);
  }

  query += ' ORDER BY id DESC';

  const lista = db.prepare(query).all(...params);
  res.json(lista);
});

// GET /sugestoes/lixeira -> sugestões na lixeira (soft delete)
router.get('/lixeira', (req, res) => {
  const lista = db.prepare('SELECT * FROM sugestoes WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC').all();
  res.json(lista);
});

// POST /sugestoes -> cria uma nova sugestão
router.post('/', (req, res) => {
  const {
    titulo, editoria, resumo, data_prevista, hora_prevista, local, fontes,
    destino_tv, destino_instagram, destino_youtube, destino_site,
    urgencia, enviado_por
  } = req.body;

  const resultado = db.prepare(`
    INSERT INTO sugestoes (
      titulo, editoria, resumo, data_prevista, hora_prevista, local, fontes,
      destino_tv, destino_instagram, destino_youtube, destino_site,
      urgencia, enviado_por, status, criado_em
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nova', ?)
  `).run(
    titulo, editoria, resumo, data_prevista, hora_prevista, local, fontes || '',
    destino_tv ? 1 : 0, destino_instagram ? 1 : 0, destino_youtube ? 1 : 0, destino_site ? 1 : 0,
    urgencia || 'rotina', enviado_por || '', new Date().toISOString()
  );

  const nova = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(resultado.lastInsertRowid);
  avisarMudanca(req);
  res.status(201).json(nova);
});

// PATCH /sugestoes/:id -> edita/atualiza status
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Sugestão não encontrada" });
  }

  const campos = [
    'titulo', 'editoria', 'resumo', 'data_prevista', 'hora_prevista', 'local', 'fontes',
    'destino_tv', 'destino_instagram', 'destino_youtube', 'destino_site',
    'urgencia', 'status', 'pauta_id'
  ];
  const atualizado = {};
  campos.forEach(c => {
    atualizado[c] = req.body[c] !== undefined ? req.body[c] : item[c];
  });

  if (
    atualizado.status !== item.status &&
    STATUS_RESTRITOS_A_NIVEL_4.includes(atualizado.status) &&
    nivelDoUsuario(req.usuario) < 4
  ) {
    return res.status(403).json({ erro: 'Seu perfil não pode aprovar, arquivar ou colocar em análise uma sugestão' });
  }

  // Marca a data da decisão só na primeira vez que a sugestão sai de
  // nova/em_analise pra aprovada/arquivada — não sobrescreve se ela já
  // tinha sido decidida antes (ex.: reaberta e decidida de novo)
  const statusDecidido = ['aprovada', 'arquivada'];
  const decidido_em = (statusDecidido.includes(atualizado.status) && !item.decidido_em)
    ? new Date().toISOString()
    : item.decidido_em;

  db.prepare(`
    UPDATE sugestoes SET
      titulo=?, editoria=?, resumo=?, data_prevista=?, hora_prevista=?, local=?, fontes=?,
      destino_tv=?, destino_instagram=?, destino_youtube=?, destino_site=?,
      urgencia=?, status=?, pauta_id=?, decidido_em=?
    WHERE id = ?
  `).run(
    atualizado.titulo, atualizado.editoria, atualizado.resumo, atualizado.data_prevista,
    atualizado.hora_prevista, atualizado.local, atualizado.fontes,
    atualizado.destino_tv ? 1 : 0, atualizado.destino_instagram ? 1 : 0,
    atualizado.destino_youtube ? 1 : 0, atualizado.destino_site ? 1 : 0,
    atualizado.urgencia, atualizado.status, atualizado.pauta_id, decidido_em, id
  );

  const item_atualizado = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(id);
  avisarMudanca(req);
  res.json(item_atualizado);
});

// DELETE /sugestoes/:id -> manda pra lixeira (soft delete)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE sugestoes SET excluido_em = ? WHERE id = ? AND excluido_em IS NULL')
    .run(new Date().toISOString(), id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Sugestão não encontrada" });
  }

  avisarMudanca(req);
  res.status(204).send();
});

// PATCH /sugestoes/:id/restaurar -> tira da lixeira
router.patch('/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE sugestoes SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Sugestão não encontrada" });
  avisarMudanca(req);
  res.json(db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(id));
});

// DELETE /sugestoes/:id/definitivo -> apaga de vez (só a partir da Lixeira)
router.delete('/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM sugestoes WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: "Sugestão não encontrada" });
  res.status(204).send();
});

module.exports = router;