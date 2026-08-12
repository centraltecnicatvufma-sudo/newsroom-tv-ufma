const express = require('express');
const router = express.Router();
const db = require('./banco');

function buscarFontes(pautaId) {
  return db.prepare('SELECT * FROM pauta_fontes WHERE pauta_id = ?').all(pautaId);
}

// Caixas de texto extras (além de Enquadramento/Roteiro, que continuam
// campos fixos da pauta) — ver banco.js: pauta_textos_extra.
function buscarTextosExtra(pautaId) {
  return db.prepare('SELECT * FROM pauta_textos_extra WHERE pauta_id = ? ORDER BY ordem ASC, id ASC').all(pautaId);
}

// Substitui todas as caixas de texto extras de uma pauta pelas enviadas —
// mesmo padrão de substituir-por-inteiro já usado pra fontes, mais simples
// que tentar diferenciar quais mudaram/foram removidas.
function salvarTextosExtra(pautaId, textosExtra) {
  db.prepare('DELETE FROM pauta_textos_extra WHERE pauta_id = ?').run(pautaId);
  if (!Array.isArray(textosExtra)) return;
  const inserir = db.prepare(`
    INSERT INTO pauta_textos_extra (pauta_id, ordem, titulo, texto)
    VALUES (?, ?, ?, ?)
  `);
  textosExtra.forEach((t, indice) => {
    inserir.run(pautaId, indice + 1, t.titulo || '', t.texto || '');
  });
}

// SELECT base reaproveitado por GET / e GET /:id — acrescenta dois campos
// calculados que nenhuma tabela guarda direto:
// - duracao_estimada_segundos: Cabeça (pautas.cabeca_duracao_segundos) +
//   soma de todos os itens do Corpo do VT (materia_itens.duracao_segundos)
// - materia_itens_qtd: quantos itens a Lauda dessa pauta tem (OFF/SONORA/
//   PASSAGEM/ARTE/SOBE_SOM, com texto ou não) — critério de "tem vídeo pra
//   editar" pra tudo que vem depois da Pauta (Edição de Vídeo, obrigar
//   Tempo do Vídeo antes de Concluída). Decisão explícita: o vínculo NÃO é
//   estar num Espelho — é ter matéria escrita. Pauta cria; Matéria, Edição
//   de Vídeo e Espelho enxergam tudo a partir daí.
const SELECT_PAUTAS = `
  SELECT pautas.*,
    (COALESCE(pautas.cabeca_duracao_segundos, 0) + COALESCE((
      SELECT SUM(duracao_segundos) FROM materia_itens WHERE materia_itens.pauta_id = pautas.id
    ), 0)) AS duracao_estimada_segundos,
    (SELECT COUNT(*) FROM materia_itens WHERE materia_itens.pauta_id = pautas.id) AS materia_itens_qtd,
    (SELECT usuario_nome FROM pautas_bloqueios WHERE pauta_id = pautas.id LIMIT 1) AS bloqueado_por
  FROM pautas
`;

// Checklist de ativos multimídia: 10 colunas (necessario+pronto x 5 tipos,
// ver banco.js). Gerado por código pra não repetir os 5 nomes 4 vezes
// diferentes entre POST e PATCH.
const TIPOS_ATIVO = ['texto', 'foto', 'video', 'audio', 'infografico'];
function camposAtivos() {
  return TIPOS_ATIVO.flatMap(t => [`ativo_${t}_necessario`, `ativo_${t}_pronto`]);
}

// Avisa quem estiver com o Mapa de Produções aberto que uma pauta mudou,
// pra tela recarregar sozinha (ver tempo_real.js) — opcional porque tanto
// faz pra essa rota se tem alguém ouvindo ou não do outro lado
function avisarMudanca(req) {
  req.app.get('tempoReal')?.broadcast({ tipo: 'pautas' });
}

// Registra uma transição no histórico — usada na criação (status_anterior
// null) e toda vez que o PATCH muda o status de fato. Alimenta os Gráficos
// Gerenciais (banco.js: pautas_historico_status).
function registrarHistoricoStatus(pautaId, statusAnterior, statusNovo) {
  db.prepare(`
    INSERT INTO pautas_historico_status (pauta_id, status_anterior, status_novo, mudado_em)
    VALUES (?, ?, ?, ?)
  `).run(pautaId, statusAnterior, statusNovo, new Date().toISOString());
}

// ---- Notificações automáticas de status no chat da Pauta ----
// Regra combinada com o usuário: cargos que já são campo da própria pauta
// (Produtor/Repórter/Editor de Imagens) notificam a pessoa REALMENTE
// escalada naquela pauta; cargos fixos da redação sem campo próprio ainda
// (Diretor, Diretor de Imagens, Editor Chefe, Coord. de Jornalismo, Chefe
// de Redação) notificam todo mundo cadastrado com aquela função na
// Agenda — pode não notificar ninguém se o cargo ainda não tem gente
// cadastrada com esse nome exato; isso é esperado até o login existir e
// cada cargo virar um papel de usuário de verdade (decisão do usuário).
const ROTULOS_STATUS_NOTIFICACAO = {
  em_edicao: '🟣 Gravado / Em Edição',
  aguardando_revisao: '🟠 Aguardando Revisão',
  concluida: '🟢 Concluída / Pronta'
};

function normalizarFuncao(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function pessoasComFuncao(alvo) {
  const membros = db.prepare('SELECT nome, funcao FROM equipe_agenda WHERE excluido_em IS NULL').all();
  return membros
    .filter(m => {
      const f = normalizarFuncao(m.funcao);
      if (alvo === 'diretor') return (f.includes('diretor') || f === 'direcao') && !f.includes('imagens');
      if (alvo === 'diretor_imagens') return f.includes('direcao de imagens') || f.includes('diretor de imagens');
      if (alvo === 'editor_chefe') return f.includes('editor chefe') || f.includes('editor-chefe');
      if (alvo === 'coord_jornalismo') return f.includes('coorden') && f.includes('jornalis');
      if (alvo === 'chefe_redacao') return f.includes('chefe') && f.includes('redacao');
      // "Técnica" é deliberadamente amplo (confirmado com o usuário): cobre
      // qualquer função com "técnico(a)", "operador", "almoxarifado" ou
      // "audiovisual" — hoje bate com CORD. TÉCNICO/OPERAÇÕES e os
      // OPERADOR DE ÁUDIO/CÂMERA/ESTÚDIO da Agenda real, mas já cobre de
      // propósito nomes de função que ainda não existem cadastrados
      // (Técnico de Vídeo, Almoxarifado, Técnico Audiovisual etc.).
      if (alvo === 'tecnica') return ['tecnic', 'operador', 'almoxarifado', 'audiovisual'].some(kw => f.includes(kw));
      return false;
    })
    .map(m => m.nome);
}

// ---- Notificação automática de Equipamentos Especiais ----
// Regra combinada com o usuário: só dispara na TRANSIÇÃO de desmarcado
// pra marcado (checkbox recém-marcado, seja na criação ou numa edição
// posterior) — reabrir/salvar a pauta de novo sem mudar esse campo não
// gera aviso repetido.
const ROTULOS_EQUIPAMENTO = {
  equip_lapela: 'Microfone Lapela',
  equip_iluminacao: 'Iluminação Externa',
  equip_mochilink: 'Mochilink / Transmissão ao Vivo'
};

function notificarEquipamentoEspecial(req, pauta, camposRecemMarcados) {
  const rotulos = camposRecemMarcados.map(c => ROTULOS_EQUIPAMENTO[c]).filter(Boolean);
  if (!rotulos.length) return;

  const nomes = [...new Set(pessoasComFuncao('tecnica'))];
  const mencoes = nomes.map(n => '@' + n).join(' ');
  const texto = `🔧 Matéria #P-${pauta.id} ("${pauta.titulo}") solicitou equipamento especial: ${rotulos.join(', ')}.` + (mencoes ? ' ' + mencoes : '');

  const resultado = db.prepare(`
    INSERT INTO chat_mensagens (pauta_id, autor, texto, criado_em)
    VALUES (?, 'HORUS', ?, ?)
  `).run(pauta.id, texto, new Date().toISOString());

  const mensagem = db.prepare('SELECT * FROM chat_mensagens WHERE id = ?').get(resultado.lastInsertRowid);
  req.app.get('tempoReal')?.broadcast({ tipo: 'chat', pauta_id: pauta.id, mensagem });
}

function destinatariosPorStatus(pauta, statusNovo) {
  if (statusNovo === 'em_edicao') return [pauta.editor_imagens].filter(Boolean);
  if (statusNovo === 'aguardando_revisao') {
    return [pauta.produtor, pauta.reporter, ...pessoasComFuncao('diretor')].filter(Boolean);
  }
  if (statusNovo === 'concluida') {
    return [
      ...pessoasComFuncao('diretor_imagens'),
      ...pessoasComFuncao('editor_chefe'),
      ...pessoasComFuncao('diretor'),
      ...pessoasComFuncao('coord_jornalismo'),
      ...pessoasComFuncao('chefe_redacao')
    ];
  }
  return [];
}

// Posta a mensagem de sistema no chat da própria Pauta (decisão do
// usuário: reaproveitar o chat que já existe, não um canal por programa
// novo) e avisa em tempo real pelo mesmo caminho de qualquer mensagem de
// chat — quem estiver com o painel daquela pauta aberto vê na hora.
// autor "HORUS" é o sinal que o front usa pra estilizar como aviso de
// sistema em vez de bolha de conversa (ver chat-painel.js).
function notificarMudancaStatus(req, pauta, statusNovo) {
  const rotulo = ROTULOS_STATUS_NOTIFICACAO[statusNovo];
  if (!rotulo) return;

  const nomes = [...new Set(destinatariosPorStatus(pauta, statusNovo))];
  const mencoes = nomes.map(n => '@' + n).join(' ');
  const texto = `🔔 Matéria #P-${pauta.id} ("${pauta.titulo}") trocou de status para ${rotulo}.` + (mencoes ? ' ' + mencoes : '');

  const resultado = db.prepare(`
    INSERT INTO chat_mensagens (pauta_id, autor, texto, criado_em)
    VALUES (?, 'HORUS', ?, ?)
  `).run(pauta.id, texto, new Date().toISOString());

  const mensagem = db.prepare('SELECT * FROM chat_mensagens WHERE id = ?').get(resultado.lastInsertRowid);
  req.app.get('tempoReal')?.broadcast({ tipo: 'chat', pauta_id: pauta.id, mensagem });
}

// GET /pautas/historico-status -> histórico completo de transições (pros
// Gráficos Gerenciais). Precisa vir ANTES de /:id pra não ser engolida por
// ela (Express bateria "historico-status" como se fosse um :id)
router.get('/historico-status', (req, res) => {
  const lista = db.prepare('SELECT * FROM pautas_historico_status ORDER BY mudado_em ASC').all();
  res.json(lista);
});

// GET /pautas/lixeira -> pautas na lixeira (soft delete). Precisa vir
// ANTES de /:id pelo mesmo motivo de /historico-status.
router.get('/lixeira', (req, res) => {
  const lista = db.prepare('SELECT * FROM pautas WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC').all();
  res.json(lista);
});

// GET /pautas -> lista com filtros opcionais: programa_id, status, data_fato, busca (por retranca)
router.get('/', (req, res) => {
  const { programa_id, status, data_fato, busca } = req.query;

  let query = SELECT_PAUTAS + ' WHERE pautas.excluido_em IS NULL';
  const params = [];

  if (programa_id) { query += ' AND programa_id = ?'; params.push(programa_id); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (data_fato) { query += ' AND data_fato = ?'; params.push(data_fato); }
  if (busca) { query += ' AND titulo LIKE ?'; params.push('%' + busca + '%'); }

  query += ' ORDER BY id DESC';

  const lista = db.prepare(query).all(...params);
  res.json(lista);
});

// GET /pautas/:id -> detalhe + fontes
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare(SELECT_PAUTAS + ' WHERE pautas.id = ?').get(id);
  if (!pauta) return res.status(404).json({ erro: 'Pauta não encontrada' });
  pauta.fontes = buscarFontes(id);
  pauta.textos_extra = buscarTextosExtra(id);
  res.json(pauta);
});

// POST /pautas -> cria pauta (+ fontes, se enviadas)
router.post('/', (req, res) => {
  const {
    sugestao_id, agenda_id, titulo, programa_id,
    destino_tv, destino_instagram, destino_youtube, destino_site,
    orientacao, roteiro, local, anexos, tipo, texto_livre, equipe_extra,
    produtor, reporter, cinegrafista, motorista, editor_imagens,
    equip_lapela, equip_iluminacao, equip_mochilink,
    data_fato, hora_fato, status, editoria, deadline, fontes, textos_extra
  } = req.body;

  if (!titulo) return res.status(400).json({ erro: 'Retranca é obrigatória' });

  const colunasAtivos = camposAtivos();
  const valoresAtivos = colunasAtivos.map(c => req.body[c] ? 1 : 0);

  const resultado = db.prepare(`
    INSERT INTO pautas (
      sugestao_id, agenda_id, titulo, programa_id,
      destino_tv, destino_instagram, destino_youtube, destino_site,
      orientacao, roteiro, local, anexos, tipo, texto_livre, equipe_extra,
      produtor, reporter, cinegrafista, motorista, editor_imagens,
      equip_lapela, equip_iluminacao, equip_mochilink,
      data_fato, hora_fato, status, editoria, deadline,
      ${colunasAtivos.join(', ')}
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${colunasAtivos.map(() => '?').join(', ')})
  `).run(
    sugestao_id || null, agenda_id || null, titulo, programa_id || null,
    destino_tv ? 1 : 0, destino_instagram ? 1 : 0, destino_youtube ? 1 : 0, destino_site ? 1 : 0,
    orientacao || '', roteiro || '', local || '', anexos || '', tipo || '', texto_livre || '',
    Array.isArray(equipe_extra) ? equipe_extra.join(', ') : (equipe_extra || ''),
    produtor || '', reporter || '', cinegrafista || '', motorista || '', editor_imagens || '',
    equip_lapela ? 1 : 0, equip_iluminacao ? 1 : 0, equip_mochilink ? 1 : 0,
    data_fato || '', hora_fato || '', status || 'em_producao', editoria || '', deadline || '',
    ...valoresAtivos
  );

  const novaId = resultado.lastInsertRowid;

  if (Array.isArray(fontes)) {
    const inserirFonte = db.prepare(`
      INSERT INTO pauta_fontes (pauta_id, nome, cargo, contato, horario_confirmado, endereco, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    fontes.forEach(f => {
      inserirFonte.run(novaId, f.nome || '', f.cargo || '', f.contato || '', f.horario_confirmado || '', f.endereco || '', f.observacao || '');
    });
  }

  salvarTextosExtra(novaId, textos_extra);
  registrarHistoricoStatus(novaId, null, status || 'em_producao');

  const camposEquipamentoMarcados = Object.keys(ROTULOS_EQUIPAMENTO).filter(c => req.body[c]);
  if (camposEquipamentoMarcados.length) {
    notificarEquipamentoEspecial(req, { id: novaId, titulo }, camposEquipamentoMarcados);
  }

  const nova = db.prepare('SELECT * FROM pautas WHERE id = ?').get(novaId);
  nova.fontes = buscarFontes(novaId);
  nova.textos_extra = buscarTextosExtra(novaId);
  avisarMudanca(req);
  res.status(201).json(nova);
});

// PATCH /pautas/:id -> edita campos (+ substitui fontes, se enviadas)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: 'Pauta não encontrada' });

  const campos = [
    'sugestao_id', 'agenda_id', 'titulo', 'programa_id',
    'destino_tv', 'destino_instagram', 'destino_youtube', 'destino_site',
    'orientacao', 'roteiro', 'local', 'anexos', 'tipo', 'texto_livre', 'equipe_extra',
    'produtor', 'reporter', 'cinegrafista', 'motorista', 'editor_imagens',
    'equip_lapela', 'equip_iluminacao', 'equip_mochilink',
    'data_fato', 'hora_fato', 'status', 'editoria', 'deadline',
    'cabeca_texto', 'texto_web',
    'cabeca_duracao_segundos', 'cabeca_duracao_automatica', 'tempo_video_segundos',
    ...camposAtivos()
  ];

  const atualizado = {};
  campos.forEach(c => {
    atualizado[c] = req.body[c] !== undefined ? req.body[c] : item[c];
  });
  // equipe_extra chega da tela como array (seleção múltipla) — guarda como
  // texto simples com nomes separados por vírgula, mesmo padrão do POST.
  if (Array.isArray(atualizado.equipe_extra)) atualizado.equipe_extra = atualizado.equipe_extra.join(', ');

  // Tempo do Vídeo (real, pós-edição) é obrigatório antes de virar
  // Concluída — mas só pra pautas que têm matéria escrita de verdade
  // (Nota Seca, por exemplo, se resume à Cabeça e nunca tem item de
  // matéria, então não deveria travar aqui). Verifica direto no banco,
  // não confia em nada vindo do front, porque a validação real tem que
  // valer pra qualquer caminho que chegue nesse PATCH (Kanban de
  // Reportagens, Edição de Vídeo, formulário de Pautas, etc.)
  if (atualizado.status === 'concluida' && !atualizado.tempo_video_segundos) {
    const temItensMateria = db.prepare(
      'SELECT COUNT(*) AS c FROM materia_itens WHERE pauta_id = ?'
    ).get(id).c > 0;

    if (temItensMateria) {
      return res.status(400).json({
        erro: 'Tempo do Vídeo é obrigatório antes de marcar como Concluída',
        campo: 'tempo_video_segundos'
      });
    }
  }

  db.prepare(`
    UPDATE pautas SET
      sugestao_id=?, agenda_id=?, titulo=?, programa_id=?,
      destino_tv=?, destino_instagram=?, destino_youtube=?, destino_site=?,
      orientacao=?, roteiro=?, local=?, anexos=?, tipo=?, texto_livre=?, equipe_extra=?,
      produtor=?, reporter=?, cinegrafista=?, motorista=?, editor_imagens=?,
      equip_lapela=?, equip_iluminacao=?, equip_mochilink=?,
      data_fato=?, hora_fato=?, status=?, editoria=?, deadline=?,
      cabeca_texto=?, texto_web=?,
      cabeca_duracao_segundos=?, cabeca_duracao_automatica=?, tempo_video_segundos=?,
      ${camposAtivos().map(c => c + '=?').join(', ')}
    WHERE id = ?
  `).run(
    atualizado.sugestao_id, atualizado.agenda_id, atualizado.titulo, atualizado.programa_id,
    atualizado.destino_tv ? 1 : 0, atualizado.destino_instagram ? 1 : 0,
    atualizado.destino_youtube ? 1 : 0, atualizado.destino_site ? 1 : 0,
    atualizado.orientacao, atualizado.roteiro, atualizado.local, atualizado.anexos, atualizado.tipo, atualizado.texto_livre, atualizado.equipe_extra,
    atualizado.produtor, atualizado.reporter, atualizado.cinegrafista, atualizado.motorista, atualizado.editor_imagens,
    atualizado.equip_lapela ? 1 : 0, atualizado.equip_iluminacao ? 1 : 0, atualizado.equip_mochilink ? 1 : 0,
    atualizado.data_fato, atualizado.hora_fato, atualizado.status, atualizado.editoria, atualizado.deadline,
    atualizado.cabeca_texto, atualizado.texto_web,
    atualizado.cabeca_duracao_segundos || 0, atualizado.cabeca_duracao_automatica ? 1 : 0, atualizado.tempo_video_segundos || null,
    ...camposAtivos().map(c => atualizado[c] ? 1 : 0),
    id
  );

  if (atualizado.status !== item.status) {
    registrarHistoricoStatus(id, item.status, atualizado.status);

    // Todo bloco do Espelho vinculado a essa pauta herda o status — Bloco
    // usa o mesmo vocabulário da Pauta (ver blocos.js), então é atribuição
    // direta, sem tradução. Sempre sincroniza, mesmo sobrescrevendo uma
    // mudança de status feita direto no Espelho (decisão explícita: mais
    // simples e previsível do que tentar preservar avanço manual seletivamente).
    db.prepare('UPDATE blocos SET status = ? WHERE pauta_id = ?').run(atualizado.status, id);

    notificarMudancaStatus(req, {
      id, titulo: atualizado.titulo, produtor: atualizado.produtor,
      reporter: atualizado.reporter, editor_imagens: atualizado.editor_imagens
    }, atualizado.status);
  }

  const camposEquipamentoRecemMarcados = Object.keys(ROTULOS_EQUIPAMENTO).filter(c => !item[c] && atualizado[c]);
  if (camposEquipamentoRecemMarcados.length) {
    notificarEquipamentoEspecial(req, { id, titulo: atualizado.titulo }, camposEquipamentoRecemMarcados);
  }

  if (Array.isArray(req.body.fontes)) {
    db.prepare('DELETE FROM pauta_fontes WHERE pauta_id = ?').run(id);
    const inserirFonte = db.prepare(`
      INSERT INTO pauta_fontes (pauta_id, nome, cargo, contato, horario_confirmado, endereco, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    req.body.fontes.forEach(f => {
      inserirFonte.run(id, f.nome || '', f.cargo || '', f.contato || '', f.horario_confirmado || '', f.endereco || '', f.observacao || '');
    });
  }

  if (Array.isArray(req.body.textos_extra)) {
    salvarTextosExtra(id, req.body.textos_extra);
  }

  const item_atualizado = db.prepare(SELECT_PAUTAS + ' WHERE pautas.id = ?').get(id);
  item_atualizado.fontes = buscarFontes(id);
  item_atualizado.textos_extra = buscarTextosExtra(id);
  avisarMudanca(req);
  res.json(item_atualizado);
});

// ---- Bloqueio cooperativo de edição (Pauta e/ou Lauda) ----
// Ver banco.js (pautas_bloqueios) e tempo_real.js pra como a liberação
// automática por queda de conexão funciona. Pedido do usuário: enquanto
// uma Pauta está aberta pra edição OU a Lauda dela está aberta, mais
// ninguém pode mexer em nada relacionado até fechar.

// POST /pautas/:id/bloquear -> tenta reservar a edição pra essa
// conexão. 200 se conseguiu (ou já era dono), 409 se outra pessoa já
// está editando.
router.post('/:id/bloquear', (req, res) => {
  const id = Number(req.params.id);
  const { conexaoId } = req.body;
  if (!conexaoId) return res.status(400).json({ erro: 'conexaoId é obrigatório' });

  const existentes = db.prepare(
    'SELECT DISTINCT usuario_id, usuario_nome FROM pautas_bloqueios WHERE pauta_id = ?'
  ).all(id);

  const deOutraPessoa = existentes.find(b => b.usuario_id !== req.usuario.id);
  if (deOutraPessoa) {
    return res.status(409).json({ erro: 'Já está sendo editada', bloqueado_por: deOutraPessoa.usuario_nome });
  }

  db.prepare(`
    INSERT INTO pautas_bloqueios (pauta_id, conexao_id, usuario_id, usuario_nome, bloqueado_em)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(pauta_id, conexao_id) DO UPDATE SET bloqueado_em = excluded.bloqueado_em
  `).run(id, conexaoId, req.usuario.id, req.usuario.nome, new Date().toISOString());

  req.app.get('tempoReal')?.broadcast({ tipo: 'bloqueio', pauta_id: id, bloqueado: true, bloqueado_por: req.usuario.nome });
  res.json({ ok: true });
});

// DELETE /pautas/:id/bloquear -> libera só a visão desta conexão (ex.
// fechou a aba da Pauta, mas a Lauda dela pode continuar aberta noutra
// conexão do mesmo usuário — só broadcast "destravado" quando a
// última visão sair).
router.delete('/:id/bloquear', (req, res) => {
  const id = Number(req.params.id);
  const conexaoId = req.body?.conexaoId || req.query.conexaoId;
  if (conexaoId) {
    db.prepare('DELETE FROM pautas_bloqueios WHERE pauta_id = ? AND conexao_id = ?').run(id, conexaoId);
  }
  const restante = db.prepare('SELECT COUNT(*) AS c FROM pautas_bloqueios WHERE pauta_id = ?').get(id).c;
  if (restante === 0) {
    req.app.get('tempoReal')?.broadcast({ tipo: 'bloqueio', pauta_id: id, bloqueado: false });
  }
  res.status(204).send();
});

// DELETE /pautas/:id/bloquear/forcar -> só Administrador/TI, destrava
// mesmo com outra pessoa ainda com a aba aberta (rede de segurança pra
// bloqueio preso). Botão só aparece pra esse perfil no front, mas a
// checagem de verdade é aqui.
router.delete('/:id/bloquear/forcar', (req, res) => {
  if (req.usuario.perfil !== 'Administrador / TI') {
    return res.status(403).json({ erro: 'Só um Administrador pode forçar o destravamento' });
  }
  const id = Number(req.params.id);
  db.prepare('DELETE FROM pautas_bloqueios WHERE pauta_id = ?').run(id);
  req.app.get('tempoReal')?.broadcast({ tipo: 'bloqueio', pauta_id: id, bloqueado: false });
  res.status(204).send();
});

// DELETE /pautas/:id -> manda pra lixeira (soft delete). Os registros
// filhos (blocos, matéria, fontes) ficam intactos: se a pauta for
// restaurada, o conteúdo volta junto.
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare('SELECT agenda_id FROM pautas WHERE id = ? AND excluido_em IS NULL').get(id);
  if (!pauta) return res.status(404).json({ erro: 'Pauta não encontrada' });

  db.prepare('UPDATE pautas SET excluido_em = ? WHERE id = ?').run(new Date().toISOString(), id);

  if (pauta.agenda_id) {
    db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run('cancelado', pauta.agenda_id);
  }

  avisarMudanca(req);
  res.status(204).send();
});

// PATCH /pautas/:id/restaurar -> tira da lixeira
router.patch('/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('UPDATE pautas SET excluido_em = NULL WHERE id = ?').run(id);
  if (resultado.changes === 0) return res.status(404).json({ erro: 'Pauta não encontrada' });
  avisarMudanca(req);
  res.json(db.prepare('SELECT * FROM pautas WHERE id = ?').get(id));
});

// DELETE /pautas/:id/definitivo -> apaga de vez (só a partir da Lixeira),
// com a cascata que antes vivia no DELETE normal
router.delete('/:id/definitivo', (req, res) => {
  const id = Number(req.params.id);
  const pauta = db.prepare('SELECT agenda_id FROM pautas WHERE id = ?').get(id);
  if (!pauta) return res.status(404).json({ erro: 'Pauta não encontrada' });

  const apagar = db.transaction((id) => {
    db.prepare('DELETE FROM blocos WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM materia_itens WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM pauta_fontes WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM pauta_textos_extra WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM chat_mensagens WHERE pauta_id = ?').run(id);
    db.prepare('DELETE FROM pautas_historico_status WHERE pauta_id = ?').run(id);
    db.prepare('UPDATE sugestoes SET pauta_id = NULL WHERE pauta_id = ?').run(id);

    if (pauta.agenda_id) {
      db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run('cancelado', pauta.agenda_id);
    }

    return db.prepare('DELETE FROM pautas WHERE id = ?').run(id);
  });

  try {
    apagar(id);
    res.status(204).send();
  } catch (erro) {
    console.error('Erro ao excluir pauta definitivamente:', erro);
    res.status(500).json({ erro: 'Não foi possível excluir a pauta definitivamente', detalhe: erro.message });
  }
});

module.exports = router;
