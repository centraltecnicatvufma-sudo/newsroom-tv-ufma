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
//
// Autor vem SEMPRE da sessão logada (req.usuario.nome), nunca do corpo da
// requisição — antes do login real existir, o Chat confiava num "autor"
// escolhido livremente pelo cliente (qualquer nome da Equipe, sem provar
// que era aquela pessoa), o que deixava qualquer usuário logado mandar
// mensagem se passando por outro colega. Agora que existe sessão de
// verdade (JWT), não faz sentido mais confiar em nada que o front mande
// pra dizer "quem eu sou".
router.post('/pauta/:pautaId', (req, res) => {
  const pautaId = Number(req.params.pautaId);
  const { texto } = req.body;
  const autor = req.usuario.nome;

  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Mensagem vazia' });

  const resultado = db.prepare(`
    INSERT INTO chat_mensagens (pauta_id, autor, texto, criado_em)
    VALUES (?, ?, ?, ?)
  `).run(pautaId, autor, texto.trim(), new Date().toISOString());

  const nova = db.prepare('SELECT * FROM chat_mensagens WHERE id = ?').get(resultado.lastInsertRowid);
  avisarMensagemNova(req, nova);
  res.status(201).json(nova);
});

// Canal geral (#redacao-geral) — mesma lógica do chat por pauta, tabela
// própria (chat_geral_mensagens) e tipo de broadcast próprio ('chat_geral',
// não 'chat') pra não ter jeito de um painel de pauta confundir mensagem
// geral com mensagem de alguma pauta.
function avisarMensagemGeralNova(req, mensagem) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'chat_geral', mensagem });
}

// GET /chat/geral -> histórico completo do canal geral, mais antiga primeiro
router.get('/geral', (req, res) => {
  const mensagens = db.prepare('SELECT * FROM chat_geral_mensagens ORDER BY id ASC').all();
  res.json(mensagens);
});

// POST /chat/geral -> nova mensagem no canal geral (autor sempre da sessão
// logada — ver comentário em POST /pauta/:pautaId acima)
router.post('/geral', (req, res) => {
  const { texto } = req.body;
  const autor = req.usuario.nome;

  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Mensagem vazia' });

  const resultado = db.prepare(`
    INSERT INTO chat_geral_mensagens (autor, texto, criado_em)
    VALUES (?, ?, ?)
  `).run(autor, texto.trim(), new Date().toISOString());

  const nova = db.prepare('SELECT * FROM chat_geral_mensagens WHERE id = ?').get(resultado.lastInsertRowid);
  avisarMensagemGeralNova(req, nova);
  res.status(201).json(nova);
});

module.exports = router;
