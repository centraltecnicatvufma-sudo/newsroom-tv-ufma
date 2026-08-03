const Database = require('better-sqlite3');
const db = new Database('newsroom.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS pautas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sugestao_id INTEGER,
    agenda_id INTEGER,
    titulo TEXT NOT NULL,
    programa_id INTEGER,
    destino_tv INTEGER DEFAULT 0,
    destino_instagram INTEGER DEFAULT 0,
    destino_youtube INTEGER DEFAULT 0,
    destino_site INTEGER DEFAULT 0,
    orientacao TEXT,
    roteiro TEXT,
    local TEXT,
    anexos TEXT,
    produtor TEXT,
    reporter TEXT,
    cinegrafista TEXT,
    motorista TEXT,
    equip_lapela INTEGER DEFAULT 0,
    equip_iluminacao INTEGER DEFAULT 0,
    equip_mochilink INTEGER DEFAULT 0,
    data_fato TEXT,
    hora_fato TEXT,
    status TEXT DEFAULT 'em_producao'
  )
`);

try { db.exec(`ALTER TABLE pautas ADD COLUMN agenda_id INTEGER`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN produtor TEXT`); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS pauta_fontes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER NOT NULL,
    nome TEXT,
    cargo TEXT,
    contato TEXT,
    horario_confirmado TEXT,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
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
