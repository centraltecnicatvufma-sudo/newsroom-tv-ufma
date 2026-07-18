const express = require('express');
const router = express.Router();
const db = require('./banco');

// Fluxo de status na ordem correta
const ORDEM_STATUS = [
  'producao', 'chefia', 'externa', 'produzindo_vt', 'edicao', 'revisao', 'pronto'
];

// GET /blocos?espelho_id=1 -> lista blocos de um espelho, ordenados
router.get('/', (req, res) => {
  const espelhoId = req.query.espelho_id;

  if (!espelhoId) {
    return res.status(400).json({ erro: "Informe o espelho_id" });
  }

  const blocos = db.prepare(
    'SELECT * FROM blocos WHERE espelho_id = ? ORDER BY ordem ASC'
  ).all(espelhoId);

  res.json(blocos);
});

// POST /blocos -> cria um novo bloco dentro de um espelho
router.post('/', (req, res) => {
  const { espelho_id, pauta_id, tipo, titulo, responsavel, duracao_estimada, duracao_alvo_vt, texto_script } = req.body;

  // Descobre a próxima posição (ordem) dentro do espelho
  const ultimo = db.prepare(
    'SELECT MAX(ordem) AS maior FROM blocos WHERE espelho_id = ?'
  ).get(espelho_id);
  const novaOrdem = (ultimo.maior || 0) + 1;

  const resultado = db.prepare(`
    INSERT INTO blocos (espelho_id, pauta_id, ordem, tipo, titulo, responsavel, duracao_estimada, duracao_alvo_vt, status, editor_atual, texto_script)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'producao', '', ?)
  `).run(espelho_id, pauta_id || null, novaOrdem, tipo, titulo, responsavel, duracao_estimada, duracao_alvo_vt || null, texto_script || '');

  const novoBloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoBloco);
});

// PATCH /blocos/:id/ordem -> reordena um bloco (recebe a nova ordem)
router.patch('/:id/ordem', (req, res) => {
  const id = Number(req.params.id);
  const { nova_ordem } = req.body;

  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  if (!bloco) {
    return res.status(404).json({ erro: "Bloco não encontrado" });
  }

  db.prepare('UPDATE blocos SET ordem = ? WHERE id = ?').run(nova_ordem, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

// PATCH /blocos/:id/status -> muda o status, respeitando as regras de permissão
router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { novo_status, perfil } = req.body; // perfil: 'editor', 'produtor', 'chefe_redacao', etc.

  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  if (!bloco) {
    return res.status(404).json({ erro: "Bloco não encontrado" });
  }

  if (!ORDEM_STATUS.includes(novo_status)) {
    return res.status(400).json({ erro: "Status inválido" });
  }

  // Regra de permissão: editor só pode mover para "revisao"
  if (perfil === 'editor' && novo_status !== 'revisao') {
    return res.status(403).json({ erro: "Editor só pode mudar o status para 'aguardando revisão'" });
  }

  // Se o novo status for "edicao", registra quem é o editor atual
  let editorAtual = bloco.editor_atual;
  if (novo_status === 'edicao' && !editorAtual) {
    editorAtual = req.body.usuario || 'Editor não informado';
  }
  if (novo_status !== 'edicao') {
    editorAtual = bloco.tipo === 'vt' ? editorAtual : ''; // mantém histórico simples por enquanto
  }

  db.prepare('UPDATE blocos SET status = ?, editor_atual = ? WHERE id = ?')
    .run(novo_status, editorAtual, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

// PATCH /blocos/:id -> edita campos gerais do bloco (título, texto, duração-alvo, etc.)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);

  if (!bloco) {
    return res.status(404).json({ erro: "Bloco não encontrado" });
  }

  const atualizado = {
    titulo: req.body.titulo !== undefined ? req.body.titulo : bloco.titulo,
    responsavel: req.body.responsavel !== undefined ? req.body.responsavel : bloco.responsavel,
    duracao_estimada: req.body.duracao_estimada !== undefined ? req.body.duracao_estimada : bloco.duracao_estimada,
    duracao_alvo_vt: req.body.duracao_alvo_vt !== undefined ? req.body.duracao_alvo_vt : bloco.duracao_alvo_vt,
    texto_script: req.body.texto_script !== undefined ? req.body.texto_script : bloco.texto_script,
  };

  db.prepare(`
    UPDATE blocos SET titulo = ?, responsavel = ?, duracao_estimada = ?, duracao_alvo_vt = ?, texto_script = ?
    WHERE id = ?
  `).run(atualizado.titulo, atualizado.responsavel, atualizado.duracao_estimada, atualizado.duracao_alvo_vt, atualizado.texto_script, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

// DELETE /blocos/:id -> remove um bloco
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM blocos WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Bloco não encontrado" });
  }

  res.status(204).send();
});
// PATCH /blocos/:id/duracao-alvo-vt -> ajusta ou trava a duração-alvo do VT
router.patch('/:id/duracao-alvo-vt', (req, res) => {
  const id = Number(req.params.id);
  const { nova_duracao, travar, perfil } = req.body;

  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  if (!bloco) {
    return res.status(404).json({ erro: "Bloco não encontrado" });
  }

  if (bloco.tipo !== 'vt') {
    return res.status(400).json({ erro: "Duração-alvo só se aplica a blocos do tipo VT" });
  }

  // Se o bloco já está travado, só diretor ou chefe de redação podem alterar
  if (bloco.duracao_alvo_travada === 1 && perfil !== 'diretor' && perfil !== 'chefe_redacao') {
    return res.status(403).json({ erro: "Duração-alvo já travada — só diretor ou chefe de redação podem alterar" });
  }

  // Só diretor ou chefe de redação podem travar o valor
  if (travar && perfil !== 'diretor' && perfil !== 'chefe_redacao') {
    return res.status(403).json({ erro: "Só diretor ou chefe de redação podem travar a duração-alvo" });
  }

  db.prepare(`
    UPDATE blocos SET duracao_alvo_vt = ?, duracao_alvo_travada = ?
    WHERE id = ?
  `).run(nova_duracao, travar ? 1 : 0, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});
module.exports = router;