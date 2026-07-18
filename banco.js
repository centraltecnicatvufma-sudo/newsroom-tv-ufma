const Database = require('better-sqlite3');
const db = new Database('newsroom.db');

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

// Adiciona a coluna duracao_alvo_travada, caso ainda não exista (evita erro se já rodou antes)
try {
  db.exec(`ALTER TABLE blocos ADD COLUMN duracao_alvo_travada INTEGER DEFAULT 0`);
} catch (e) {
  // Coluna já existe — tudo bem, ignora o erro
}

module.exports = db;