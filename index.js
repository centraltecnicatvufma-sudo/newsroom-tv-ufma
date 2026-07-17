const express = require('express');
const app = express();
const porta = 3000;

const pautasRouter = require('./pautas');

app.use(express.json()); // permite o servidor entender dados enviados em formato JSON
app.use('/pautas', pautasRouter); // toda rota que começar com /pautas vai pro arquivo pautas.js

app.get('/', (req, res) => {
  res.send('Newsroom TV UFMA está no ar!');
});

app.listen(porta, () => {
  console.log(`Servidor rodando em http://localhost:${porta}`);
});