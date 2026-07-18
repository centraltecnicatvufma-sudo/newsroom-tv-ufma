const express = require('express');
const app = express();
const porta = 3000;

const pautasRouter = require('./pautas');
const espelhosRouter = require('./espelhos');
const blocosRouter = require('./blocos');
const materiaRouter = require('./materia');

app.use(express.json());
app.use(express.static('public'));
app.use('/pautas', pautasRouter);
app.use('/espelhos', espelhosRouter);
app.use('/blocos', blocosRouter);
app.use('/materia', materiaRouter);

app.get('/', (req, res) => {
  res.send('Newsroom TV UFMA está no ar!');
});

app.listen(porta, () => {
  console.log(`Servidor rodando em http://localhost:${porta}`);
});