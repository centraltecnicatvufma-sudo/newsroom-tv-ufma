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
db.exec(`
  CREATE TABLE IF NOT EXISTS espelhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    programa TEXT,
    data TEXT,
    duracao_total_prevista INTEGER,
    status_espelho TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blocos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    espelho_id INTEGER,
    pauta_id INTEGER,
    ordem INTEGER,
    tipo TEXT,
    titulo TEXT,
    responsavel TEXT,
    duracao_estimada INTEGER,
    duracao_alvo_vt INTEGER,
    status TEXT,
    editor_atual TEXT,
    texto_script TEXT,
    FOREIGN KEY (espelho_id) REFERENCES espelhos(id),
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);
module.exports = db;