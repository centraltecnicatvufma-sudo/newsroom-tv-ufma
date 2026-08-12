const express = require('express');
const router = express.Router();
const db = require('./banco');
const { exigirNivelMinimo } = require('./permissoes');

// Operador(1) e Técnico(2) têm só "leitura do Rundown aprovado" —
// qualquer mudança no Espelho (criar/editar/mover/excluir item,
// ressincronizar cabeça) exige pelo menos Repórter/Redator(3). GET
// continua aberto pra qualquer perfil logado ("visualizar todas as
// páginas").
const exigirEdicaoEspelho = exigirNivelMinimo(3);

// Fluxo de status do espelho, na ordem em que a redação percorre — mesmo
// vocabulário de status da Pauta (em_producao/em_gravacao/em_edicao/
// aguardando_revisao/concluida). Sugestão é a única etapa do pipeline com
// classificação própria; a partir da Pauta, tudo (inclusive o Bloco) usa
// os mesmos status, sem tradução entre vocabulários diferentes.
// "aguardando_revisao" só é selecionável a partir da tela Edição de
// Vídeo (ver public/edicao-video.html) — nenhuma outra tela deixa
// escolher esse status.
const ORDEM_STATUS = ['em_producao', 'em_gravacao', 'em_edicao', 'aguardando_revisao', 'concluida'];
const STATUS_INICIAL = 'em_producao';

// Entidades HTML que aparecem em texto colado de sites, Word ou e-mail.
// Sem isso o teleprompter mostraria "cabe&ccedil;a" no ar.
const ENTIDADES_HTML = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', ccedil: 'ç',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Agrave: 'À', Egrave: 'È', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  Acirc: 'Â', Ecirc: 'Ê', Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û',
  Atilde: 'Ã', Otilde: 'Õ', Ntilde: 'Ñ', Ccedil: 'Ç',
  Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
  ordf: 'ª', ordm: 'º', deg: '°', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  iexcl: '¡', iquest: '¿', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', cent: '¢', sect: '§', para: '¶'
};

function decodificarEntidades(texto) {
  return texto.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (original, codigo) => {
    if (codigo[0] === '#') {
      const numero = codigo[1] === 'x' || codigo[1] === 'X'
        ? parseInt(codigo.slice(2), 16)
        : parseInt(codigo.slice(1), 10);
      try {
        return String.fromCodePoint(numero);
      } catch (e) {
        return original; // código fora da faixa válida — deixa como está
      }
    }
    // hasOwnProperty e não acesso direto: senão "&constructor;" pegaria algo do
    // protótipo do objeto e despejaria código no texto que vai ao ar
    return Object.prototype.hasOwnProperty.call(ENTIDADES_HTML, codigo)
      ? ENTIDADES_HTML[codigo]
      : original;
  });
}

// Converte o HTML do Quill (usado na Lauda) em texto puro para o teleprompter
function htmlParaTexto(html) {
  if (!html) return '';

  const semTags = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  // Decodifica só depois de tirar as tags, senão um "&lt;p&gt;" digitado
  // pelo repórter viraria tag e seria removido do texto.
  return decodificarEntidades(semTags)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Busca a Cabeça do Apresentador escrita na Lauda daquela pauta
function cabecaDaPauta(pautaId) {
  if (!pautaId) return '';
  const pauta = db.prepare('SELECT cabeca_texto FROM pautas WHERE id = ?').get(pautaId);
  return pauta ? htmlParaTexto(pauta.cabeca_texto) : '';
}

// Deixa a ordem de um bloco sequencial (1, 2, 3...) depois de mover ou remover itens
function renumerarBloco(espelhoId, bloco) {
  const itens = db.prepare(
    'SELECT id FROM blocos WHERE espelho_id = ? AND bloco = ? ORDER BY ordem ASC, id ASC'
  ).all(espelhoId, bloco);

  const gravar = db.prepare('UPDATE blocos SET ordem = ? WHERE id = ?');
  itens.forEach((item, indice) => gravar.run(indice + 1, item.id));
}

// Calcula em que pé está a lauda de um item vinculado a pauta
function calcularLaudaStatus(pautaId) {
  const pauta = db.prepare('SELECT cabeca_texto FROM pautas WHERE id = ?').get(pautaId);
  const temCabeca = !!(pauta && pauta.cabeca_texto && pauta.cabeca_texto.trim() !== '' && pauta.cabeca_texto !== '<p><br></p>');
  const temItens = db.prepare(
    "SELECT COUNT(*) AS total FROM materia_itens WHERE pauta_id = ? AND texto IS NOT NULL AND texto != ''"
  ).get(pautaId).total > 0;

  if (temCabeca && temItens) return 'pronta';
  if (temCabeca || temItens) return 'redacao';
  return 'pendente';
}

// GET /blocos?espelho_id=1 -> lista os itens de um espelho, agrupados por bloco e em ordem
router.get('/', (req, res) => {
  const espelhoId = req.query.espelho_id;

  if (!espelhoId) {
    return res.status(400).json({ erro: "Informe o espelho_id" });
  }

  const blocos = db.prepare(
    'SELECT * FROM blocos WHERE espelho_id = ? ORDER BY bloco ASC, ordem ASC'
  ).all(espelhoId);

  blocos.forEach(b => {
    b.lauda_status = b.pauta_id ? calcularLaudaStatus(b.pauta_id) : null;
    // Avisa a tela quando a Cabeça da Lauda mudou depois da cópia para o espelho
    b.cabeca_desatualizada = !!(b.pauta_id && cabecaDaPauta(b.pauta_id) !== (b.texto_script || ''));
  });

  res.json(blocos);
});

// POST /blocos -> cria um novo item dentro de um bloco do espelho
router.post('/', exigirEdicaoEspelho, (req, res) => {
  const {
    espelho_id, pauta_id, bloco, tipo, titulo,
    responsavel, reporter, duracao_estimada, duracao_alvo_vt, texto_script
  } = req.body;

  if (!espelho_id) return res.status(400).json({ erro: "Informe o espelho_id" });
  if (!titulo) return res.status(400).json({ erro: "Retranca é obrigatória" });

  const numeroBloco = Number(bloco) > 0 ? Number(bloco) : 1;

  // Descobre a próxima posição dentro daquele bloco (a ordem é por bloco, não pelo espelho todo)
  const ultimo = db.prepare(
    'SELECT MAX(ordem) AS maior FROM blocos WHERE espelho_id = ? AND bloco = ?'
  ).get(espelho_id, numeroBloco);
  const novaOrdem = (ultimo.maior || 0) + 1;

  // Item vinculado a pauta já nasce com a Cabeça da Lauda copiada para o teleprompter
  const script = texto_script || cabecaDaPauta(pauta_id);

  const resultado = db.prepare(`
    INSERT INTO blocos (
      espelho_id, pauta_id, bloco, ordem, tipo, titulo,
      responsavel, reporter, duracao_estimada, duracao_alvo_vt,
      status, editor_atual, texto_script
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run(
    espelho_id, pauta_id || null, numeroBloco, novaOrdem, tipo, titulo,
    responsavel || '', reporter || '', duracao_estimada || 0, duracao_alvo_vt || null,
    STATUS_INICIAL, script
  );

  const novoBloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoBloco);
});

// PATCH /blocos/:id/mover -> move o item para outra posição, inclusive para outro bloco
router.patch('/:id/mover', exigirEdicaoEspelho, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const espelhoId = item.espelho_id;
  const blocoOrigem = item.bloco || 1;
  const blocoDestino = req.body.bloco !== undefined && Number(req.body.bloco) > 0
    ? Number(req.body.bloco)
    : blocoOrigem;

  const mover = db.transaction(() => {
    if (blocoDestino === blocoOrigem) {
      // Reordena dentro do mesmo bloco
      const ordemAntiga = item.ordem;
      const novaOrdem = Number(req.body.nova_ordem) || ordemAntiga;
      if (novaOrdem === ordemAntiga) return;

      if (novaOrdem > ordemAntiga) {
        db.prepare(`
          UPDATE blocos SET ordem = ordem - 1
          WHERE espelho_id = ? AND bloco = ? AND ordem > ? AND ordem <= ?
        `).run(espelhoId, blocoOrigem, ordemAntiga, novaOrdem);
      } else {
        db.prepare(`
          UPDATE blocos SET ordem = ordem + 1
          WHERE espelho_id = ? AND bloco = ? AND ordem >= ? AND ordem < ?
        `).run(espelhoId, blocoOrigem, novaOrdem, ordemAntiga);
      }

      db.prepare('UPDATE blocos SET ordem = ? WHERE id = ?').run(novaOrdem, id);
      return;
    }

    // Mudou de bloco: fecha o buraco na origem e abre espaço no destino
    db.prepare(`
      UPDATE blocos SET ordem = ordem - 1
      WHERE espelho_id = ? AND bloco = ? AND ordem > ?
    `).run(espelhoId, blocoOrigem, item.ordem);

    const ultimoDestino = db.prepare(
      'SELECT MAX(ordem) AS maior FROM blocos WHERE espelho_id = ? AND bloco = ?'
    ).get(espelhoId, blocoDestino);

    const novaOrdem = req.body.nova_ordem !== undefined
      ? Math.max(1, Math.min(Number(req.body.nova_ordem), (ultimoDestino.maior || 0) + 1))
      : (ultimoDestino.maior || 0) + 1;

    db.prepare(`
      UPDATE blocos SET ordem = ordem + 1
      WHERE espelho_id = ? AND bloco = ? AND ordem >= ?
    `).run(espelhoId, blocoDestino, novaOrdem);

    db.prepare('UPDATE blocos SET bloco = ?, ordem = ? WHERE id = ?')
      .run(blocoDestino, novaOrdem, id);

    renumerarBloco(espelhoId, blocoOrigem);
    renumerarBloco(espelhoId, blocoDestino);
  });

  try {
    mover();
  } catch (erro) {
    console.error('Erro ao mover item do espelho:', erro);
    return res.status(500).json({ erro: 'Não foi possível mover o item', detalhe: erro.message });
  }

  const atualizados = db.prepare(
    'SELECT * FROM blocos WHERE espelho_id = ? ORDER BY bloco ASC, ordem ASC'
  ).all(espelhoId);

  res.json(atualizados);
});

// PATCH /blocos/:id/ordem -> reordena dentro do bloco atual (atalho para /mover)
router.patch('/:id/ordem', (req, res, next) => {
  req.url = `/${req.params.id}/mover`;
  router.handle(req, res, next);
});

// PATCH /blocos/:id/status -> muda o status, respeitando as regras de permissão
router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { novo_status, perfil } = req.body; // perfil: 'editor', 'produtor', 'chefe_redacao', etc.

  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  if (!bloco) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  if (!ORDEM_STATUS.includes(novo_status)) {
    return res.status(400).json({ erro: "Status inválido" });
  }

  // Regra de permissão: editor só pode mover pra "Em Edição" — marcar como
  // Concluída fica pra quem tem visão do todo (chefe de redação/produtor),
  // até porque isso já esbarra na obrigatoriedade do Tempo do Vídeo (ver
  // pautas.js)
  if (perfil === 'editor' && novo_status !== 'em_edicao') {
    return res.status(403).json({ erro: "Editor só pode mudar o status para 'Em Edição'" });
  }

  // Ao entrar em edição, registra quem pegou o material
  let editorAtual = bloco.editor_atual;
  if (novo_status === 'em_edicao' && !editorAtual) {
    editorAtual = req.body.usuario || 'Editor não informado';
  }

  db.prepare('UPDATE blocos SET status = ?, editor_atual = ? WHERE id = ?')
    .run(novo_status, editorAtual, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

// PATCH /blocos/:id/sincronizar-cabeca -> repuxa a Cabeça da Lauda para o texto do teleprompter
router.patch('/:id/sincronizar-cabeca', exigirEdicaoEspelho, (req, res) => {
  const id = Number(req.params.id);
  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);

  if (!bloco) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }
  if (!bloco.pauta_id) {
    return res.status(400).json({ erro: "Este item não está vinculado a uma pauta" });
  }

  db.prepare('UPDATE blocos SET texto_script = ? WHERE id = ?')
    .run(cabecaDaPauta(bloco.pauta_id), id);

  res.json(db.prepare('SELECT * FROM blocos WHERE id = ?').get(id));
});

// PATCH /blocos/:id -> edita os campos gerais do item
router.patch('/:id', exigirEdicaoEspelho, (req, res) => {
  const id = Number(req.params.id);
  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);

  if (!bloco) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const campos = [
    'pauta_id', 'tipo', 'titulo', 'responsavel', 'reporter',
    'duracao_estimada', 'duracao_alvo_vt', 'texto_script'
  ];

  const atualizado = {};
  campos.forEach(c => {
    atualizado[c] = req.body[c] !== undefined ? req.body[c] : bloco[c];
  });

  // Vinculou o item a outra pauta: traz a Cabeça da Lauda dela junto.
  // Os dois lados são normalizados porque "sem pauta" chega ora como null,
  // ora como string vazia — comparar cru marcaria troca onde não houve e
  // apagaria o texto de itens manuais a cada edição de título.
  const pautaAntes = bloco.pauta_id || null;
  const pautaDepois = atualizado.pauta_id ? Number(atualizado.pauta_id) : null;

  if (req.body.pauta_id !== undefined && pautaDepois !== pautaAntes && req.body.texto_script === undefined) {
    // Desvincular não apaga o texto já escrito — só vincular a uma pauta o substitui
    atualizado.texto_script = pautaDepois ? cabecaDaPauta(pautaDepois) : bloco.texto_script;
  }

  db.prepare(`
    UPDATE blocos SET
      pauta_id = ?, tipo = ?, titulo = ?, responsavel = ?, reporter = ?,
      duracao_estimada = ?, duracao_alvo_vt = ?, texto_script = ?
    WHERE id = ?
  `).run(
    atualizado.pauta_id || null, atualizado.tipo, atualizado.titulo,
    atualizado.responsavel, atualizado.reporter,
    atualizado.duracao_estimada, atualizado.duracao_alvo_vt, atualizado.texto_script,
    id
  );

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

// DELETE /blocos/:id -> remove um item do espelho
router.delete('/:id', exigirEdicaoEspelho, (req, res) => {
  const id = Number(req.params.id);
  const bloco = db.prepare('SELECT espelho_id, bloco FROM blocos WHERE id = ?').get(id);

  if (!bloco) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  db.prepare('DELETE FROM blocos WHERE id = ?').run(id);
  renumerarBloco(bloco.espelho_id, bloco.bloco);

  res.status(204).send();
});

// PATCH /blocos/:id/duracao-alvo-vt -> ajusta ou trava a duração-alvo do VT
router.patch('/:id/duracao-alvo-vt', (req, res) => {
  const id = Number(req.params.id);
  const { nova_duracao, travar, perfil } = req.body;

  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  if (!bloco) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  if (bloco.tipo !== 'vt') {
    return res.status(400).json({ erro: "Duração-alvo só se aplica a itens do tipo VT" });
  }

  // Se já está travado, só diretor ou chefe de redação podem alterar
  if (bloco.duracao_alvo_travada === 1 && perfil !== 'diretor' && perfil !== 'chefe_redacao') {
    return res.status(403).json({ erro: "Duração-alvo já travada — só diretor ou chefe de redação podem alterar" });
  }

  // Só diretor ou chefe de redação podem travar o valor
  if (travar && perfil !== 'diretor' && perfil !== 'chefe_redacao') {
    return res.status(403).json({ erro: "Só diretor ou chefe de redação podem travar a duração-alvo" });
  }

  db.prepare(`
    UPDATE blocos SET duracao_alvo_vt = ?, duracao_alvo_travada = ?
    WHERE id = ?
  `).run(nova_duracao, travar ? 1 : 0, id);

  const blocoAtualizado = db.prepare('SELECT * FROM blocos WHERE id = ?').get(id);
  res.json(blocoAtualizado);
});

module.exports = router;
