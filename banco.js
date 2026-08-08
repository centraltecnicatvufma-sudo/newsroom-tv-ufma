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
try { db.exec(`ALTER TABLE pautas ADD COLUMN editor_imagens TEXT`); } catch (e) {}

try { db.exec(`ALTER TABLE pautas ADD COLUMN cabeca_texto TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN texto_web TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN editoria TEXT`); } catch (e) {}
// "YYYY-MM-DDTHH:MM" (mesmo formato de <input type="datetime-local">) — hora-limite
// interna de fechamento, diferente de data_fato/hora_fato (quando o FATO acontece)
try { db.exec(`ALTER TABLE pautas ADD COLUMN deadline TEXT`); } catch (e) {}

// Checklist de ativos multimídia — pra cada tipo, um par de flags:
// "necessario" (a pauta exige esse ativo?) e "pronto" (já foi entregue?).
// "pronto" só faz sentido junto de "necessario" marcado (a tela cuida disso).
['texto', 'foto', 'video', 'audio', 'infografico'].forEach(tipo => {
  try { db.exec(`ALTER TABLE pautas ADD COLUMN ativo_${tipo}_necessario INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE pautas ADD COLUMN ativo_${tipo}_pronto INTEGER DEFAULT 0`); } catch (e) {}
});

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
  CREATE TABLE IF NOT EXISTS materia_gcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER NOT NULL,
    nome TEXT,
    cargo TEXT,
    tempo_entrada TEXT,
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

try { db.exec(`ALTER TABLE blocos ADD COLUMN bloco INTEGER DEFAULT 1`); } catch (e) {}
try { db.exec(`ALTER TABLE blocos ADD COLUMN reporter TEXT`); } catch (e) {}

try {
  db.exec(`ALTER TABLE blocos ADD COLUMN duracao_alvo_travada INTEGER DEFAULT 0`);
} catch (e) {
  // Coluna já existe — tudo bem, ignora o erro
}

// Migração: o fluxo de status do espelho foi reduzido para 4 etapas.
// Tudo que era 'producao', 'chefia' ou 'externa' vira 'produzindo_vt'.
db.exec(`
  UPDATE blocos SET status = 'produzindo_vt'
  WHERE status IS NULL OR status NOT IN ('produzindo_vt', 'edicao', 'revisao', 'pronto')
`);

// Item sem bloco definido pertence ao Bloco 1
db.exec(`UPDATE blocos SET bloco = 1 WHERE bloco IS NULL OR bloco < 1`);

// Migração: a ordem dos itens passou a ser relativa ao bloco (antes era única
// no espelho inteiro). Renumera cada bloco de 1 em diante, preservando a
// sequência atual. É idempotente — rodar de novo não muda nada.
const gruposDeBlocos = db.prepare('SELECT DISTINCT espelho_id, bloco FROM blocos').all();
const itensDoGrupo = db.prepare(
  'SELECT id FROM blocos WHERE espelho_id = ? AND bloco = ? ORDER BY ordem ASC, id ASC'
);
const gravarOrdem = db.prepare('UPDATE blocos SET ordem = ? WHERE id = ?');

gruposDeBlocos.forEach(grupo => {
  itensDoGrupo.all(grupo.espelho_id, grupo.bloco).forEach((item, indice) => {
    gravarOrdem.run(indice + 1, item.id);
  });
});

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

try { db.exec(`ALTER TABLE materia_itens ADD COLUMN duracao_segundos INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE materia_itens ADD COLUMN duracao_automatica INTEGER DEFAULT 1`); } catch (e) {}
try { db.exec(`ALTER TABLE materia_itens ADD COLUMN indicacoes TEXT DEFAULT ''`); } catch (e) {}

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

// Data de criação e de decisão (aprovada/arquivada) — sem isso não dá pra medir
// tempo até decisão no Funil de Sugestões. Sugestões criadas antes desta
// migração ficam com essas colunas em branco (histórico não pode ser
// reconstruído), o relatório trata esse caso como "sem dado", não como zero.
try { db.exec(`ALTER TABLE sugestoes ADD COLUMN criado_em TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE sugestoes ADD COLUMN decidido_em TEXT`); } catch (e) {}

// Barra de Breaking News do Mapa de Produções — só um alerta ativo por vez
// (ativo=1); disparar um novo desativa o anterior automaticamente. Fica
// como tabela (não uma única linha de config) pra manter histórico de
// quando cada alerta foi disparado e por quem.
db.exec(`
  CREATE TABLE IF NOT EXISTS alertas_breaking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensagem TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_por TEXT,
    criado_em TEXT
  )
`);

module.exports = db;
