const Database = require('better-sqlite3');
const db = new Database('newsroom.db'); // isso cria um arquivo chamado newsroom.db na pasta do projeto

// Cria a tabela de pautas, caso ainda não exista
db.exec(`
  CREATE TABLE IF NOT EXISTS pautas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retranca TEXT,
    editoria TEXT,
    produtor TEXT,
    reporter TEXT,
    editor TEXT,
    status TEXT,
    data TEXT,
    prazo TEXT
  )
`);
module.exports = db;