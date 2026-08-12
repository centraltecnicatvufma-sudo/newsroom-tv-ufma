const express = require('express');
const router = express.Router();
const db = require('./banco');
const { exigirNivelMinimo, precisaFiltrarPorSetor, setorDoUsuario } = require('./permissoes');
const { gerarTexto, textoPuro } = require('./ia');

// Mesma regra do Espelho (ver blocos.js): Operador(1) e Técnico(2) só têm
// leitura — qualquer mudança na Lauda exige pelo menos Repórter/Redator(3).
const exigirEdicaoLauda = exigirNivelMinimo(3);

// Mesma regra de Setor do Espelho (ver blocos.js): Repórter/Produtor/
// Editor-Chefe só editam a Lauda de uma pauta do próprio Setor. `tabela`
// é sempre uma string fixa escrita no código (materia_itens/materia_gcs),
// nunca vem de fora — interpolar ela na query é seguro.
function exigirSetorDaLauda(tabela) {
  return (req, res, next) => {
    if (!precisaFiltrarPorSetor(req.usuario)) return next();

    let pautaId = req.body?.pauta_id;
    if (req.params.id) {
      const item = db.prepare(`SELECT pauta_id FROM ${tabela} WHERE id = ?`).get(req.params.id);
      if (item) pautaId = item.pauta_id;
    }
    if (!pautaId) return next();

    const pauta = db.prepare('SELECT programa_id FROM pautas WHERE id = ?').get(pautaId);
    if (!pauta || !pauta.programa_id) return next();

    const setor = db.prepare('SELECT setor FROM programas_quadros WHERE id = ?').get(pauta.programa_id)?.setor;
    if (setor && setor !== setorDoUsuario(req.usuario.id)) {
      return res.status(403).json({ erro: 'Este conteúdo é de outro Setor' });
    }
    next();
  };
}
const exigirSetorItem = exigirSetorDaLauda('materia_itens');
const exigirSetorGc = exigirSetorDaLauda('materia_gcs');

// GET /materia?pauta_id=1 -> lista os itens da matéria de uma pauta, na ordem
router.get('/', (req, res) => {
  const pautaId = req.query.pauta_id;

  if (!pautaId) {
    return res.status(400).json({ erro: "Informe o pauta_id" });
  }

  const itens = db.prepare(
    'SELECT * FROM materia_itens WHERE pauta_id = ? ORDER BY ordem ASC'
  ).all(pautaId);

  res.json(itens);
});

// POST /materia -> adiciona um novo item (OFF, SONORA, PASSAGEM, ARTE ou
// SOBE_SOM) à matéria. duracao_automatica começa ligada por padrão (o tempo
// é estimado a partir do texto até o repórter desligar manualmente).
router.post('/', exigirEdicaoLauda, exigirSetorItem, (req, res) => {
  const { pauta_id, tipo, texto } = req.body;

  const ultimo = db.prepare(
    'SELECT MAX(ordem) AS maior FROM materia_itens WHERE pauta_id = ?'
  ).get(pauta_id);
  const novaOrdem = (ultimo.maior || 0) + 1;

  const resultado = db.prepare(`
    INSERT INTO materia_itens (pauta_id, ordem, tipo, texto, duracao_segundos, duracao_automatica, indicacoes)
    VALUES (?, ?, ?, ?, 0, 1, '')
  `).run(pauta_id, novaOrdem, tipo, texto || '');

  const novoItem = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoItem);
});

// PATCH /materia/:id -> edita o texto, as indicações ao editor e/ou a duração de um item
router.patch('/:id', exigirEdicaoLauda, exigirSetorItem, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const novoTexto = req.body.texto !== undefined ? req.body.texto : item.texto;
  const novasIndicacoes = req.body.indicacoes !== undefined ? req.body.indicacoes : item.indicacoes;
  const duracaoSegundos = req.body.duracao_segundos !== undefined ? req.body.duracao_segundos : item.duracao_segundos;
  const duracaoAutomatica = req.body.duracao_automatica !== undefined ? (req.body.duracao_automatica ? 1 : 0) : item.duracao_automatica;

  db.prepare('UPDATE materia_itens SET texto = ?, indicacoes = ?, duracao_segundos = ?, duracao_automatica = ? WHERE id = ?')
    .run(novoTexto, novasIndicacoes, duracaoSegundos, duracaoAutomatica, id);

  const itemAtualizado = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);
  res.json(itemAtualizado);
});

// DELETE /materia/:id -> remove um item
router.delete('/:id', exigirEdicaoLauda, exigirSetorItem, (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM materia_itens WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  res.status(204).send();
});

// PATCH /materia/:id/ordem -> move um item para uma nova posição, reorganizando os outros
router.patch('/:id/ordem', exigirEdicaoLauda, exigirSetorItem, (req, res) => {
  const id = Number(req.params.id);
  const { nova_ordem } = req.body;

  const item = db.prepare('SELECT * FROM materia_itens WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({ erro: "Item não encontrado" });
  }

  const ordemAntiga = item.ordem;
  const pautaId = item.pauta_id;

  if (nova_ordem === ordemAntiga) {
    return res.json(item);
  }

  if (nova_ordem > ordemAntiga) {
    db.prepare(`
      UPDATE materia_itens SET ordem = ordem - 1
      WHERE pauta_id = ? AND ordem > ? AND ordem <= ?
    `).run(pautaId, ordemAntiga, nova_ordem);
  } else {
    db.prepare(`
      UPDATE materia_itens SET ordem = ordem + 1
      WHERE pauta_id = ? AND ordem >= ? AND ordem < ?
    `).run(pautaId, nova_ordem, ordemAntiga);
  }

  db.prepare('UPDATE materia_itens SET ordem = ? WHERE id = ?').run(nova_ordem, id);

  const itensAtualizados = db.prepare(
    'SELECT * FROM materia_itens WHERE pauta_id = ? ORDER BY ordem ASC'
  ).all(pautaId);

  res.json(itensAtualizados);
});

// GET /materia/gcs?pauta_id=1 -> lista os GCs de uma pauta
router.get('/gcs', (req, res) => {
  const pautaId = req.query.pauta_id;
  if (!pautaId) return res.status(400).json({ erro: "Informe o pauta_id" });

  const gcs = db.prepare(
    'SELECT * FROM materia_gcs WHERE pauta_id = ? ORDER BY id ASC'
  ).all(pautaId);

  res.json(gcs);
});

// POST /materia/gcs -> adiciona um GC novo
router.post('/gcs', exigirEdicaoLauda, exigirSetorGc, (req, res) => {
  const { pauta_id, nome, cargo, tempo_entrada } = req.body;

  const resultado = db.prepare(`
    INSERT INTO materia_gcs (pauta_id, nome, cargo, tempo_entrada)
    VALUES (?, ?, ?, ?)
  `).run(pauta_id, nome || '', cargo || '', tempo_entrada || '');

  const novoGc = db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novoGc);
});

// PATCH /materia/gcs/:id -> edita um GC
router.patch('/gcs/:id', exigirEdicaoLauda, exigirSetorGc, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ erro: "GC não encontrado" });

  const nome = req.body.nome !== undefined ? req.body.nome : item.nome;
  const cargo = req.body.cargo !== undefined ? req.body.cargo : item.cargo;
  const tempo_entrada = req.body.tempo_entrada !== undefined ? req.body.tempo_entrada : item.tempo_entrada;

  db.prepare('UPDATE materia_gcs SET nome = ?, cargo = ?, tempo_entrada = ? WHERE id = ?')
    .run(nome, cargo, tempo_entrada, id);

  res.json(db.prepare('SELECT * FROM materia_gcs WHERE id = ?').get(id));
});

// DELETE /materia/gcs/:id -> remove um GC
router.delete('/gcs/:id', exigirEdicaoLauda, exigirSetorGc, (req, res) => {
  const id = Number(req.params.id);
  const resultado = db.prepare('DELETE FROM materia_gcs WHERE id = ?').run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "GC não encontrado" });
  }

  res.status(204).send();
});

// ---- Geração de texto com IA (OpenAI) a partir dos OFFs já escritos ----
// Só gera um RASCUNHO devolvido pra tela — nunca salva sozinho no banco.
// Quem está editando revisa/ajusta e salva pelo fluxo normal (btn-salvar
// em materia.html), igual a qualquer outra edição manual.
function buscarOffs(pautaId) {
  return db.prepare(
    "SELECT texto FROM materia_itens WHERE pauta_id = ? AND tipo = 'OFF' ORDER BY ordem ASC"
  ).all(pautaId);
}

function textoOffsOuErro(pautaId, res) {
  const offs = buscarOffs(pautaId);
  const textoOffs = offs.map(o => textoPuro(o.texto)).filter(Boolean).join('\n\n');
  if (!textoOffs) {
    res.status(400).json({ erro: 'Escreva pelo menos um OFF na matéria antes de gerar com IA.' });
    return null;
  }
  return textoOffs;
}

// POST /materia/gerar-cabeca -> rascunho da Cabeça do Apresentador, com
// base nos OFFs da matéria (pauta_id no corpo)
router.post('/gerar-cabeca', exigirEdicaoLauda, exigirSetorItem, async (req, res) => {
  const { pauta_id } = req.body;
  if (!pauta_id) return res.status(400).json({ erro: 'Informe o pauta_id' });

  const textoOffs = textoOffsOuErro(pauta_id, res);
  if (!textoOffs) return;

  const prompt = `Você é um editor de telejornalismo brasileiro. Com base no texto abaixo (os OFFs de uma reportagem em VT), escreva a CABEÇA — o texto que o apresentador lê ao vivo, olhando pra câmera, ANTES de o VT entrar no ar.

Regras:
- 2 a 4 frases curtas, linguagem de TV (direta, sem jornalês)
- Não repita literalmente frases dos OFFs — resuma/contextualize, sem entregar todos os detalhes
- Terceira pessoa, tom neutro e informativo
- Não invente fatos que não estão no texto abaixo

OFFs da matéria:
"""
${textoOffs}
"""

Escreva só a Cabeça, sem explicações antes ou depois, sem aspas envolvendo o texto.`;

  try {
    const texto = await gerarTexto(prompt);
    res.json({ texto });
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

// POST /materia/gerar-texto-web -> rascunho do Texto Adaptado (Site/
// Instagram/YouTube), com base nos OFFs da matéria (pauta_id no corpo)
router.post('/gerar-texto-web', exigirEdicaoLauda, exigirSetorItem, async (req, res) => {
  const { pauta_id } = req.body;
  if (!pauta_id) return res.status(400).json({ erro: 'Informe o pauta_id' });

  const textoOffs = textoOffsOuErro(pauta_id, res);
  if (!textoOffs) return;

  const prompt = `Você é um editor de conteúdo digital de um telejornal universitário. Com base nos OFFs abaixo (uma reportagem feita pra TV), escreva uma versão adaptada pra publicar no site, Instagram e YouTube (texto de acompanhamento da publicação).

Regras:
- Pode ser mais completo que a Cabeça de TV — é pra quem vai LER, não assistir
- Parágrafos curtos, linguagem clara, adequada pra redes sociais e site de notícias
- Não invente fatos que não estão no texto abaixo
- Não use "cabeça"/"off"/jargão de televisão

OFFs da matéria:
"""
${textoOffs}
"""

Escreva só o texto adaptado, sem explicações antes ou depois, sem aspas envolvendo o texto.`;

  try {
    const texto = await gerarTexto(prompt);
    res.json({ texto });
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

module.exports = router;