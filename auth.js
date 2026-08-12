const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./banco');
const { nivelDoUsuario } = require('./permissoes');

// Segredo do JWT: usa JWT_SECRET do ambiente se existir; senão gera um
// segredo aleatório na primeira vez que o servidor sobe e guarda num
// arquivo local (nunca commitado, ver .gitignore) — persiste entre
// reinícios do servidor sem exigir configuração manual nesta fase do
// projeto.
const CAMINHO_SEGREDO = path.join(__dirname, '.jwt_secret');
function obterSegredoJwt() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return fs.readFileSync(CAMINHO_SEGREDO, 'utf8').trim();
  } catch (e) {
    const novo = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(CAMINHO_SEGREDO, novo);
    return novo;
  }
}
const SEGREDO_JWT = obterSegredoJwt();
const NOME_COOKIE = 'horus_token';
const VALIDADE_TOKEN = '30d';

// Middleware que protege qualquer rota registrada depois dele em
// index.js — sem cookie válido, a API inteira responde 401. As telas
// estáticas (public/*.html) continuam servidas sem exigir login (senão
// login.html não carregaria pra ninguém poder logar), mas nenhuma
// tela consegue buscar dado nenhum sem sessão válida, porque toda rota
// de API passa por aqui.
function exigirLogin(req, res, next) {
  const token = req.cookies && req.cookies[NOME_COOKIE];
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });

  try {
    req.usuario = jwt.verify(token, SEGREDO_JWT);
    next();
  } catch (e) {
    res.clearCookie(NOME_COOKIE);
    return res.status(401).json({ erro: 'Sessão expirada ou inválida' });
  }
}

function logarComoMembro(res, membro) {
  const token = jwt.sign(
    { id: membro.id, nome: membro.nome, perfil: membro.perfil },
    SEGREDO_JWT,
    { expiresIn: VALIDADE_TOKEN }
  );

  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.json({ id: membro.id, nome: membro.nome, perfil: membro.perfil });
}

router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });

  const membro = db.prepare(
    'SELECT * FROM equipe_agenda WHERE email = ? COLLATE NOCASE AND excluido_em IS NULL'
  ).get(email.trim());

  if (!membro || !membro.senha_hash || !bcrypt.compareSync(senha, membro.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  }

  logarComoMembro(res, membro);
});

router.post('/logout', (req, res) => {
  res.clearCookie(NOME_COOKIE);
  res.status(204).send();
});

// POST /auth/primeiro-acesso -> quem já tem e-mail cadastrado na Equipe
// mas ainda NÃO tem senha pode criar a própria senha aqui — só funciona
// enquanto senha_hash estiver vazio (ver comentário abaixo). Substitui,
// por enquanto, o convite por e-mail combinado como etapa futura: sem
// envio de e-mail de verificação, a "prova" de que é a pessoa certa é
// só conhecer o próprio e-mail cadastrado — aceitável pro tamanho da
// equipe hoje, mas não é uma verificação de identidade de verdade.
router.post('/primeiro-acesso', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });
  if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres' });

  const membro = db.prepare(
    'SELECT * FROM equipe_agenda WHERE email = ? COLLATE NOCASE AND excluido_em IS NULL'
  ).get(email.trim());

  if (!membro) return res.status(404).json({ erro: 'E-mail não encontrado. Peça pra um administrador te cadastrar na Equipe primeiro.' });

  // Trava central: só deixa criar senha por aqui se AINDA não existe
  // nenhuma. Se já existe, essa rota não pode virar um jeito de
  // sequestrar a conta de outra pessoa só sabendo o e-mail dela — quem
  // esqueceu a senha precisa pedir pra um administrador redefinir.
  if (membro.senha_hash) {
    return res.status(409).json({ erro: 'Este e-mail já tem senha cadastrada. Peça pra um administrador redefinir, se você esqueceu a senha.' });
  }

  const senhaHash = bcrypt.hashSync(senha, 10);
  db.prepare('UPDATE equipe_agenda SET senha_hash = ? WHERE id = ?').run(senhaHash, membro.id);

  logarComoMembro(res, { ...membro, senha_hash: senhaHash });
});

// PATCH /auth/senha -> troca de senha pelo próprio usuário logado,
// exige a senha atual (diferente do /primeiro-acesso, que só serve pra
// quem ainda não tem nenhuma).
router.patch('/senha', exigirLogin, (req, res) => {
  const { senhaAtual, senhaNova } = req.body;
  if (!senhaAtual || !senhaNova) return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });
  if (senhaNova.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres' });

  const membro = db.prepare('SELECT * FROM equipe_agenda WHERE id = ? AND excluido_em IS NULL').get(req.usuario.id);
  if (!membro || !membro.senha_hash || !bcrypt.compareSync(senhaAtual, membro.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta' });
  }

  const novoHash = bcrypt.hashSync(senhaNova, 10);
  db.prepare('UPDATE equipe_agenda SET senha_hash = ? WHERE id = ?').run(novoHash, membro.id);
  res.status(204).send();
});

// GET /auth/me -> quem está logado agora (busca fresca no banco pelo id
// do token, não confia só no payload antigo — se o Perfil de alguém
// mudar, a sessão já aberta reflete a mudança na próxima checagem, sem
// precisar relogar).
router.get('/me', exigirLogin, (req, res) => {
  const membro = db.prepare('SELECT id, nome, perfil, email FROM equipe_agenda WHERE id = ? AND excluido_em IS NULL').get(req.usuario.id);
  if (!membro) return res.status(401).json({ erro: 'Usuário não encontrado' });
  // nivel calculado aqui (não guardado na tabela) — fonte única de
  // verdade é permissoes.js, o front nunca duplica esse mapeamento.
  membro.nivel = nivelDoUsuario(membro.perfil);
  res.json(membro);
});

module.exports = router;
module.exports.exigirLogin = exigirLogin;
