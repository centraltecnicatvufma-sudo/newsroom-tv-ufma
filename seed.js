// Rode uma vez com: node seed.js
// Isso insere Programas e Equipe de exemplo no banco.
// Edite os valores abaixo com os nomes reais da sua redação antes de rodar.

const db = require('./banco');

const programas = [
  { tipo: 'jornal', nome: 'JTVUFMA' },
  { tipo: 'quadro', nome: 'Semáforo Cultural' },
];

const equipe = [
  { nome: 'Jhon Rayan', funcao: 'Repórter' },
  { nome: 'Cledilson', funcao: 'Cinegrafista' },
  { nome: 'Eduardo Santos', funcao: 'Produtor' },
];

const inserirPrograma = db.prepare('INSERT INTO programas_quadros (tipo, nome) VALUES (?, ?)');
const inserirEquipe = db.prepare('INSERT INTO equipe_agenda (nome, funcao) VALUES (?, ?)');

programas.forEach(p => {
  inserirPrograma.run(p.tipo, p.nome);
  console.log('Programa inserido:', p.nome);
});

equipe.forEach(m => {
  inserirEquipe.run(m.nome, m.funcao);
  console.log('Membro da equipe inserido:', m.nome, '-', m.funcao);
});

console.log('Concluído! Agora você pode apagar este arquivo (seed.js) se quiser.');
