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
    prazo TEXT,
    texto_pauta TEXT
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

db.exec(`
  CREATE TABLE IF NOT EXISTS materia_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER,
    ordem INTEGER,
    tipo TEXT,
    texto TEXT,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS programas_quadros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT,
    nome TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS equipe_agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    funcao TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    programa_quadro_id INTEGER,
    data TEXT,
    hora TEXT,
    local TEXT,
    equipe TEXT,
    observacao TEXT,
    status TEXT,
    FOREIGN KEY (programa_quadro_id) REFERENCES programas_quadros(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sugestoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    editoria TEXT,
    resumo TEXT,
    data_prevista TEXT,
    hora_prevista TEXT,
    local TEXT,
    fontes TEXT,
    destino_tv INTEGER DEFAULT 0,
    destino_instagram INTEGER DEFAULT 0,
    destino_youtube INTEGER DEFAULT 0,
    destino_site INTEGER DEFAULT 0,
    urgencia TEXT,
    enviado_por TEXT,
    status TEXT,
    pauta_id INTEGER,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);
module.exports = db;