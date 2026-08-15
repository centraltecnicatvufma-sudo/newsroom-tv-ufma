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

// ---- Restrição por Setor (Jornalismo / Produção / Mídias Sociais) ----
// Só Níveis 3, 4 e 5 (Repórter, Produtor, Editor-Chefe) são restritos ao
// próprio Setor — Níveis 1 e 2 continuam vendo tudo (regra já existente,
// mantida) e Nível 6 (Administrador) tem acesso total, sem restrição de
// setor nenhuma. Decisão do usuário, ver memória de projeto
// project_perfil_equipe_permissoes.
const NIVEIS_RESTRITOS_POR_SETOR = [3, 4, 5];

// Setores "Técnica", "Mídias Sociais" e "Programação" são transversais de
// propósito — enxergam Jornalismo, Produção e Mídias Sociais ao mesmo
// tempo, mesmo em nível 3/4/5 que normalmente seria restrito ao próprio
// Setor. Só Jornalismo e Produção continuam de fato restritos um ao
// outro. Pedido do usuário.
const SETORES_SEM_FILTRO = ['Técnica', 'Mídias Sociais', 'Programação'];

function precisaFiltrarPorSetor(usuario) {
  if (!NIVEIS_RESTRITOS_POR_SETOR.includes(nivelDoUsuario(usuario))) return false;
  const id = typeof usuario === 'object' ? usuario?.id : null;
  return id ? !SETORES_SEM_FILTRO.includes(setorDoUsuario(id)) : true;
}

// Busca fresca no banco (não confia em nada guardado no JWT/sessão) — o
// Setor de alguém pode mudar a qualquer momento sem precisar relogar.
function setorDoUsuario(usuarioId) {
  const db = require('./banco');
  const membro = db.prepare('SELECT setor FROM equipe_agenda WHERE id = ?').get(usuarioId);
  return membro ? membro.setor : null;
}

module.exports = {
  NIVEL_POR_PERFIL, nivelDoUsuario, exigirNivelMinimo,
  NIVEIS_RESTRITOS_POR_SETOR, precisaFiltrarPorSetor, setorDoUsuario
};
