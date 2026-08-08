const express = require('express');
const router = express.Router();
const db = require('./banco');

function buscarFontes(pautaId) {
  return db.prepare('SELECT * FROM pauta_fontes WHERE pauta_id = ?').all(pautaId);
}

// Checklist de ativos multimídia: 10 colunas (necessario+pronto x 5 tipos,
// ver banco.js). Gerado por código pra não repetir os 5 nomes 4 vezes
// diferentes entre POST e PATCH.
const TIPOS_ATIVO = ['texto', 'foto', 'video', 'audio', 'infografico'];
function camposAtivos() {
  return TIPOS_ATIVO.flatMap(t => [`ativo_${t}_necessario`, `ativo_${t}_pronto`]);
}

// Avisa quem estiver com o Mapa de Produções aberto que uma pauta mudou,
// pra tela recarregar sozinha (ver tempo_real.js) — opcional porque tanto
// faz pra essa rota se tem alguém ouvindo ou não do outro lado
function avisarMudanca(req) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'pautas' });
}

// Registra uma transição no histórico — usada na criação (status_anterior
// null) e toda vez que o PATCH muda o status de fato. Alimenta os Gráficos
// Gerenciais (banco.js: pautas_historico_status).
function registrarHistoricoStatus(pautaId, statusAnterior, statusNovo) {
  db.prepare(`
    INSERT INTO pautas_historico_status (pauta_id, status_anterior, status_novo, mudado_em)
    VALUES (?, ?, ?, ?)
  `).run(pautaId, statusAnterior, statusNovo, new Date().toISOString());
}

// GET /pautas/historico-status -> histórico completo de transições (pros
// Gráficos Gerenciais). Precisa vir ANTES de /:id pra não ser engolida por
// ela (Express bateria "historico-status" como se fosse um :id)
router.get('/historico-status', (req, res) => {
  const lista = db.prepare('SELECT * FROM pautas_historico_status ORDER BY mudado_em ASC').all();
  res.json(lista);
});

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
    sugestao_id, agenda_id, titulo, programa_id,
    destino_tv, destino_instagram, destino_youtube, destino_site,
    orientacao, roteiro, local, anexos,
    produtor, reporter, cinegrafista, motorista, editor_imagens,
    equip_lapela, equip_iluminacao, equip_mochilink,
    data_fato, hora_fato, status, editoria, deadline, fontes
  } = req.body;

  if (!titulo) return res.status(400).json({ erro: 'Título é obrigatório' });

  const colunasAtivos = camposAtivos();
  const valoresAtivos = colunasAtivos.map(c => req.body[c] ? 1 : 0);

  const resultado = db.prepare(`
    INSERT INTO pautas (
      sugestao_id, agenda_id, titulo, programa_id,
      destino_tv, destino_instagram, destino_youtube, destino_site,
      orientacao, roteiro, local, anexos,
      produtor, reporter, cinegrafista, motorista, editor_imagens,
      equip_lapela, equip_iluminacao, equip_mochilink,
      data_fato, hora_fato, status, editoria, deadline,
      ${colunasAtivos.join(', ')}
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${colunasAtivos.map(() => '?').join(', ')})
  `).run(
    sugestao_id || null, agenda_id || null, titulo, programa_id || null,
    destino_tv ? 1 : 0, destino_instagram ? 1 : 0, destino_youtube ? 1 : 0, destino_site ? 1 : 0,
    orientacao || '', roteiro || '', local || '', anexos || '',
    produtor || '', reporter || '', cinegrafista || '', motorista || '', editor_imagens || '',
    equip_lapela ? 1 : 0, equip_iluminacao ? 1 : 0, equip_mochilink ? 1 : 0,
    data_fato || '', hora_fato || '', status || 'em_producao', editoria || '', deadline || '',
    ...valoresAtivos
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

  registrarHistoricoStatus(novaId, null, status || 'em_producao');

  const nova = db.prepare('SELECT * FROM pautas WHERE id = ?').get(novaId);
  nova.fontes = buscarFontes(novaId);
  avisarMudanca(req);
  res.status(201).json(nova);
});

// PATCH /pautas/:id -> edita campos (+ substitui fontes, se enviadas)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: 'Pauta não encontrada' });

  const campos = [
    'sugestao_id', 'agenda_id', 'titulo', 'programa_id',
    'destino_tv', 'destino_instagram', 'destino_youtube', 'destino_site',
    'orientacao', 'roteiro', 'local', 'anexos',
    'produtor', 'reporter', 'cinegrafista', 'motorista', 'editor_imagens',
    'equip_lapela', 'equip_iluminacao', 'equip_mochilink',
    'data_fato', 'hora_fato', 'status', 'editoria', 'deadline',
    'cabeca_texto', 'texto_web',
    ...camposAtivos()
  ];

  const atualizado = {};
  campos.forEach(c => {
    atualizado[c] = req.body[c] !== undefined ? req.body[c] : item[c];
  });

  db.prepare(`
    UPDATE pautas SET
      sugestao_id=?, agenda_id=?, titulo=?, programa_id=?,
      destino_tv=?, destino_instagram=?, destino_youtube=?, destino_site=?,
      orientacao=?, roteiro=?, local=?, anexos=?,
      produtor=?, reporter=?, cinegrafista=?, motorista=?, editor_imagens=?,
      equip_lapela=?, equip_iluminacao=?, equip_mochilink=?,
      data_fato=?, hora_fato=?, status=?, editoria=?, deadline=?,
      cabeca_texto=?, texto_web=?,
      ${camposAtivos().map(c => c + '=?').join(', ')}
    WHERE id = ?
  `).run(
    atualizado.sugestao_id, atualizado.agenda_id, atualizado.titulo, atualizado.programa_id,
    atualizado.destino_tv ? 1 : 0, atualizado.destino_instagram ? 1 : 0,
    atualizado.destino_youtube ? 1 : 0, atualizado.destino_site ? 1 : 0,
    atualizado.orientacao, atualizado.roteiro, atualizado.local, atualizado.anexos,
    atualizado.produtor, atualizado.reporter, atualizado.cinegrafista, atualizado.motorista, atualizado.editor_imagens,
    atualizado.equip_lapela ? 1 : 0, atualizado.equip_iluminacao ? 1 : 0, atualizado.equip_mochilink ? 1 : 0,
    atualizado.data_fato, atualizado.hora_fato, atualizado.status, atualizado.editoria, atualizado.deadline,
    atualizado.cabeca_texto, atualizado.texto_web,
    ...camposAtivos().map(c => atualizado[c] ? 1 : 0),
    id
  );

  if (atualizado.status !== item.status) {
    registrarHistoricoStatus(id, item.status, atualizado.status);
  }

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
  avisarMudanca(req);
  res.json(item_atualizado);
});

// DELETE /pautas/:id
// DELETE /pautas/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare('SELECT agenda_id FROM pautas WHERE id = ?').get(id);

  const apagar = db.transaction((id) => {
    db.prepare('DELETE FROM blocos WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM materia_itens WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM pauta_fontes WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM pautas_historico_status WHERE pauta_id = ?').run(id);
    db.prepare('UPDATE sugestoes SET pauta_id = NULL WHERE pauta_id = ?').run(id);

    if (pauta && pauta.agenda_id) {
      db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run('cancelado', pauta.agenda_id);
    }

    return db.prepare('DELETE FROM pautas WHERE id = ?').run(id);
  });

  try {
    const resultado = apagar(id);
    if (resultado.changes === 0) {
      return res.status(404).json({ erro: 'Pauta não encontrada' });
    }
    avisarMudanca(req);
    res.status(204).send();
  } catch (erro) {
    console.error('Erro ao excluir pauta:', erro);
    res.status(500).json({ erro: 'Não foi possível excluir a pauta', detalhe: erro.message });
  }
});

module.exports = router;
