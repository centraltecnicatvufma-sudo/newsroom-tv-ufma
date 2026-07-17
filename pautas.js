const express = require('express');
const router = express.Router();

// "Banco de dados" temporário, só na memória (por enquanto)
let pautas = [
  {
    id: 1,
    retranca: "CHUVAS-COHAMA",
    editoria: "Geral",
    produtor: "Ana Kelly",
    reporter: "Pedro Reis",
    editor: "Marcos Lima",
    status: "em_producao",
    prazo: "hoje 16h"
  },
  {
    id: 2,
    retranca: "VACINA-UFMA",
    editoria: "Geral",
    produtor: "Ana Kelly",
    reporter: "Carla Dias",
    editor: "",
    status: "aprovada",
    prazo: "hoje 17h"
  }
];

// GET /pautas -> lista todas as pautas
router.get('/', (req, res) => {
  res.json(pautas);
});

// GET /pautas/buscar?retranca=NOME -> busca pauta pela retranca
router.get('/buscar', (req, res) => {
  const retrancaBuscada = req.query.retranca;

  if (!retrancaBuscada) {
    return res.status(400).json({ erro: "Informe a retranca na busca" });
  }

  const encontrada = pautas.find(
    p => p.retranca && p.retranca.toUpperCase() === retrancaBuscada.toUpperCase()
  );

  if (!encontrada) {
    return res.status(404).json({ erro: "Nenhuma pauta encontrada com essa retranca" });
  }

  res.json(encontrada);
});

// POST /pautas -> cria uma nova pauta
router.post('/', (req, res) => {
  const novaPauta = {
    id: Date.now(),
    retranca: req.body.retranca,
    editoria: req.body.editoria,
    produtor: req.body.produtor,
    reporter: req.body.reporter,
    editor: req.body.editor,
    status: "sugerida",
    prazo: req.body.prazo
  };
  pautas.push(novaPauta);
  res.status(201).json(novaPauta);
});

// PATCH /pautas/:id -> atualiza uma pauta existente
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const pauta = pautas.find(p => p.id === id);

  if (!pauta) {
    return res.status(404).json({ erro: "Pauta não encontrada" });
  }

  if (req.body.retranca !== undefined) pauta.retranca = req.body.retranca;
  if (req.body.editoria !== undefined) pauta.editoria = req.body.editoria;
  if (req.body.produtor !== undefined) pauta.produtor = req.body.produtor;
  if (req.body.reporter !== undefined) pauta.reporter = req.body.reporter;
  if (req.body.editor !== undefined) pauta.editor = req.body.editor;
  if (req.body.status !== undefined) pauta.status = req.body.status;
  if (req.body.prazo !== undefined) pauta.prazo = req.body.prazo;

  res.json(pauta);
});

// DELETE /pautas/:id -> remove uma pauta
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const indice = pautas.findIndex(p => p.id === id);

  if (indice === -1) {
    return res.status(404).json({ erro: "Pauta não encontrada" });
  }

  pautas.splice(indice, 1);
  res.status(204).send();
});

module.exports = router;