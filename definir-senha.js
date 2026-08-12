// Script de bootstrap: define/redefine a senha de um membro da Equipe
// direto no banco, sem passar pela API (que agora exige login pra tudo —
// ver auth.js/index.js). Necessário pra definir a PRIMEIRA senha de um
// Nível 6, já que dali em diante ele consegue definir senha dos demais
// pela própria tela de Equipe (Agenda). Também serve pra qualquer reset
// de senha feito direto no servidor, sem precisar reabrir o cadastro.
//
// Uso: node definir-senha.js "email@ufma.br" "senha-nova"

const bcrypt = require('bcryptjs');
const db = require('./banco');

const [, , email, senha] = process.argv;

if (!email || !senha) {
  console.error('Uso: node definir-senha.js "email@ufma.br" "senha-nova"');
  process.exit(1);
}

const membro = db.prepare(
  'SELECT * FROM equipe_agenda WHERE email = ? COLLATE NOCASE AND excluido_em IS NULL'
).get(email.trim());

if (!membro) {
  console.error(`Nenhum membro da Equipe encontrado com o e-mail "${email}".`);
  console.error('Cadastre o membro (com esse e-mail) em Agenda > Equipe antes de rodar este script.');
  process.exit(1);
}

const hash = bcrypt.hashSync(senha, 10);
db.prepare('UPDATE equipe_agenda SET senha_hash = ? WHERE id = ?').run(hash, membro.id);

console.log(`Senha definida com sucesso para ${membro.nome} (${membro.email}), perfil: ${membro.perfil || 'sem perfil definido'}.`);
