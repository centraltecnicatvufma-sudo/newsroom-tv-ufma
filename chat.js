const express = require('express');
const router = express.Router();
const db = require('./banco');

function avisarMensagemNova(req, mensagem) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'chat', pauta_id: mensagem.pauta_id, mensagem });
}

// GET /chat/pauta/:pautaId -> histórico completo daquela pauta, mais antiga primeiro
router.get('/pauta/:pautaId', (req, res) => {
  const pautaId = Number(req.params.pautaId);
  const mensagens = db.prepare(
    'SELECT * FROM chat_mensagens WHERE pauta_id = ? ORDER BY id ASC'
  ).all(pautaId);
  res.json(mensagens);
});

// POST /chat/pauta/:pautaId -> nova mensagem, avisada em tempo real pra quem
// estiver com o mesmo painel de chat aberto (ver tempo_real.js)
router.post('/pauta/:pautaId', (req, res) => {
  const pautaId = Number(req.params.pautaId);
  const { autor, texto } = req.body;

  if (!autor || !autor.trim()) return res.status(400).json({ erro: 'Autor é obrigatório' });
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Mensagem vazia' });

  const resultado = db.prepare(`
    INSERT INTO chat_mensagens (pauta_id, autor, texto, criado_em)
    VALUES (?, ?, ?, ?)
  `).run(pautaId, autor.trim(), texto.trim(), new Date().toISOString());

  const nova = db.prepare('SELECT * FROM chat_mensagens WHERE id = ?').get(resultado.lastInsertRowid);
  avisarMensagemNova(req, nova);
  res.status(201).json(nova);
});

module.exports = router;
