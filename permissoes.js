// Fonte única de verdade do mapeamento Perfil -> Nível (1-6), usado tanto
// no backend (checagens de permissão em cada rota) quanto exposto ao
// front via GET /auth/me (campo `nivel`) — assim o front nunca precisa
// duplicar essa tabela pra decidir o que mostrar/esconder na tela.
// Especificação ditada pelo usuário, ver memória de projeto
// project_perfil_equipe_permissoes.
const NIVEL_POR_PERFIL = {
  'Administrador / TI': 6,
  'Editor-Chefe / Chefe de Redação': 5,
  'Produtor': 4,
  'Repórter / Redator': 3,
  'Técnico': 2,
  'Operador': 1
};

// Aceita tanto um objeto {perfil} (ex. req.usuario) quanto a string do
// perfil direto. Perfil não reconhecido (ou ninguém logado) vira nível 0
// — sempre o nível mais baixo possível, nunca um acesso indevido por
// erro de digitação/typo no cadastro.
function nivelDoUsuario(usuarioOuPerfil) {
  const perfil = typeof usuarioOuPerfil === 'string' ? usuarioOuPerfil : usuarioOuPerfil?.perfil;
  return NIVEL_POR_PERFIL[perfil] || 0;
}

// Middleware pronto pra proteger rota inteira ("só nível 4+"). Pra
// checagens condicionais dentro de uma rota (ex. "só se for a própria
// pauta"), use nivelDoUsuario(req.usuario) direto.
function exigirNivelMinimo(nivelMinimo) {
  return (req, res, next) => {
    if (nivelDoUsuario(req.usuario) < nivelMinimo) {
      return res.status(403).json({ erro: 'Seu perfil não tem permissão pra essa ação' });
    }
    next();
  };
}

module.exports = { NIVEL_POR_PERFIL, nivelDoUsuario, exigirNivelMinimo };
