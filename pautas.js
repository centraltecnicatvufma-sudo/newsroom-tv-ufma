const express = require('express');
const router = express.Router();

// "Banco de dados" temporário, só na memória (por enquanto)
let pautas = [
  {
    id: 1,
    titulo: "Chuvas alagam bairros da Cohama",
    editoria: "Geral",
    responsavel: "Pedro Reis",
    status: "em_producao",
    prazo: "hoje 16h"
  },
  {
    id: 2,
    titulo: "Mutirão de vacinação na UFMA",
    editoria: "Geral",
    responsavel: "Carla Dias",
    status: "aprovada",
    prazo: "hoje 17h"
  }
];

// GET /pautas -> lista todas as pautas
router.get('/', (req, res) => {
  res.json(pautas);
});

// POST /pautas -> cria uma nova pauta
router.post('/', (req, res) => {
  const novaPauta = {
    id: Date.now(),
    titulo: req.body.titulo,
    editoria: req.body.editoria,
    responsavel: req.body.responsavel,
    status: "sugerida",
    prazo: req.body.prazo
  };
  pautas.push(novaPauta);
  res.status(201).json(novaPauta);
});

module.exports = router;