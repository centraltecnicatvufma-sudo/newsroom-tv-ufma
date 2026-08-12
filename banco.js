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

// Tipo do material (VT, ST, Sonora, Ao Vivo, Nota Coberta...), exibido na
// tabela de cabeçalho da Pauta junto com Título e Data.
try { db.exec(`ALTER TABLE pautas ADD COLUMN tipo TEXT`); } catch (e) {}
// Texto livre — coluna esquerda do corpo da Pauta, sem título/rótulo fixo,
// ao lado das caixas de texto tituladas (Enquadramento, Roteiro, extras).
try { db.exec(`ALTER TABLE pautas ADD COLUMN texto_livre TEXT`); } catch (e) {}

// Equipe extra (reforço) — nomes adicionais além de Repórter/Cinegrafista/
// Produtor/Editor de Imagens, pra externas que precisam de mais gente.
// Seleção múltipla na tela (<select multiple>), guardada aqui como texto
// simples com nomes separados por vírgula — mesmo padrão de "anexos"
// (texto puro), sem tabela filha, já que não tem metadado por nome.
try { db.exec(`ALTER TABLE pautas ADD COLUMN equipe_extra TEXT`); } catch (e) {}

try { db.exec(`ALTER TABLE pautas ADD COLUMN cabeca_texto TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN texto_web TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN editoria TEXT`); } catch (e) {}

// Duração da Cabeça do Apresentador — mesmo padrão automático/manual que
// cada item do Corpo do VT já tem (materia_itens.duracao_segundos/
// duracao_automatica), só que guardado direto na pauta porque a Cabeça não
// é um materia_itens, é campo único (pautas.cabeca_texto). Somada ao total
// do Corpo do VT, forma o tempo estimado da matéria (ver pautas.js).
try { db.exec(`ALTER TABLE pautas ADD COLUMN cabeca_duracao_segundos INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE pautas ADD COLUMN cabeca_duracao_automatica INTEGER DEFAULT 1`); } catch (e) {}

// Tempo do Vídeo — duração REAL, cronometrada depois de editado e revisado
// (diferente de duracao_estimada_segundos, que é só a estimativa de leitura
// do texto). Preenchido na tela Edição de Vídeo; obrigatório antes de uma
// pauta com bloco de vídeo (Reportagem/Standup/Nota Coberta/VT/Escalada/
// Teaser) virar "Concluída" (ver validação em pautas.js).
try { db.exec(`ALTER TABLE pautas ADD COLUMN tempo_video_segundos INTEGER`); } catch (e) {}
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

// Histórico de mudança de status da pauta — alimenta os Gráficos
// Gerenciais (prazo de entrega, tempo parado em cada etapa, hora de
// conclusão etc.). Uma linha por transição, incluindo a criação
// (status_anterior = NULL). Gravado automaticamente em pautas.js, nunca
// editado por nenhuma tela.
db.exec(`
  CREATE TABLE IF NOT EXISTS pautas_historico_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER NOT NULL,
    status_anterior TEXT,
    status_novo TEXT NOT NULL,
    mudado_em TEXT NOT NULL,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);

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

// Endereço por Entrevistado — uma pauta pode ter mais de um entrevistado
// em locais diferentes, então o endereço deixou de ser um campo único da
// Pauta (pautas.local) e passou a acompanhar cada Entrevistado. A coluna
// pautas.local continua existindo no banco (dado antigo não é apagado),
// só não aparece mais na tela nem na impressão.
try { db.exec(`ALTER TABLE pauta_fontes ADD COLUMN endereco TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE pauta_fontes ADD COLUMN observacao TEXT`); } catch (e) {}

// Caixas de texto extras da Pauta — além de "Enquadramento" e "Roteiro"
// (que continuam como campos fixos: pautas.orientacao/roteiro, sem
// migração, pra não mexer em conteúdo já existente), o repórter/produtor
// pode adicionar quantas quiser, cada uma com título editável. Mesmo
// padrão de pauta_fontes: substituído por inteiro a cada salvamento
// (ver pautas.js).
db.exec(`
  CREATE TABLE IF NOT EXISTS pauta_textos_extra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER NOT NULL,
    ordem INTEGER,
    titulo TEXT,
    texto TEXT,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);

// Chat contextual por Pauta — v1 do HORUS Chat, escopo reduzido a só isso
// (sem canais gerais/por programa ainda, sem @menções, sem modo NO AR;
// ver memória do projeto pra decisões de escopo). Sem tabela de usuários
// porque o v1 não tem login — "autor" é o nome escolhido na tela (mesma
// lista da Agenda), guardado como texto puro.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pauta_id INTEGER NOT NULL,
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    FOREIGN KEY (pauta_id) REFERENCES pautas(id)
  )
`);

// Canal geral (#redacao-geral) — v2 do HORUS Chat. Tabela separada da de
// chat por pauta de propósito (sem tocar em chat_mensagens, que já está
// testada e em uso): só existe UM canal geral por enquanto, sem coluna de
// "canal" pra distinguir vários — se um dia precisar de mais de um canal
// geral, aí sim vale introduzir esse conceito, não antes.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_geral_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
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

// Perfil (nível de permissão pra quando o login existir) e E-mail (pro
// convite de primeiro acesso) — cadastro por enquanto, sem login/sessão/
// permissão de verdade ainda (ver decisão do usuário: essa etapa é só a
// base de dados, autenticação fica pra depois).
try { db.exec('ALTER TABLE equipe_agenda ADD COLUMN perfil TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE equipe_agenda ADD COLUMN email TEXT'); } catch (e) {}

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

// Eventos fixos/efemérides do Calendário (planejamento de longo prazo) —
// separado da tabela "agendamentos" que a Agenda usa, porque não têm
// equipe/hora/programa: só título, data e se repete todo ano.
db.exec(`
  CREATE TABLE IF NOT EXISTS eventos_calendario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    data TEXT NOT NULL,
    recorrente_anual INTEGER DEFAULT 0,
    observacao TEXT
  )
`);

// Escala de Equipes — núcleo visual: tipos de turno cadastráveis, uma
// entrada de escala por membro/dia, e vínculos de dupla (Repórter +
// Cinegrafista que sempre rodam juntos). membro_id referencia
// equipe_agenda, o mesmo cadastro que a aba "Equipe" da Agenda já usa —
// não duplica o registro de pessoas.
db.exec(`
  CREATE TABLE IF NOT EXISTS turnos_tipo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fim TEXT NOT NULL
  )
`);

// Turnos padrão só na primeira vez (tabela vazia) — ponto de partida
// editável pela tela, não dado inventado por pessoa/escala real
const totalTurnos = db.prepare('SELECT COUNT(*) AS c FROM turnos_tipo').get().c;
if (totalTurnos === 0) {
  const inserirTurno = db.prepare('INSERT INTO turnos_tipo (nome, hora_inicio, hora_fim) VALUES (?, ?, ?)');
  inserirTurno.run('Manhã', '08:00', '14:00');
  inserirTurno.run('Tarde', '14:00', '20:00');
  inserirTurno.run('Noite', '20:00', '02:00');
  inserirTurno.run('Plantão', '00:00', '23:59');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS escala (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membro_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    status TEXT NOT NULL,
    turno_tipo_id INTEGER,
    FOREIGN KEY (membro_id) REFERENCES equipe_agenda(id),
    FOREIGN KEY (turno_tipo_id) REFERENCES turnos_tipo(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS vinculos_equipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    membro_a_id INTEGER NOT NULL,
    membro_b_id INTEGER NOT NULL,
    FOREIGN KEY (membro_a_id) REFERENCES equipe_agenda(id),
    FOREIGN KEY (membro_b_id) REFERENCES equipe_agenda(id)
  )
`);

// Lixeira — soft delete: excluir marca excluido_em (timestamp) em vez de
// apagar a linha de vez. Toda tela de listagem passa a esconder quem tem
// excluido_em preenchido; restaurar zera o campo; excluir definitivamente
// (só a partir da tela Lixeira) faz o DELETE de verdade. Vale pra estes 7
// tipos de registro — os únicos com botão de excluir hoje.
[
  'pautas',
  'sugestoes',
  'agendamentos',
  'programas_quadros',
  'equipe_agenda',
  'eventos_calendario',
  'turnos_tipo'
].forEach(tabela => {
  try { db.exec(`ALTER TABLE ${tabela} ADD COLUMN excluido_em TEXT`); } catch (e) {}
});

module.exports = db;
