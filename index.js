const express = require('express');
const http = require('http');
const app = express();
const porta = process.env.PORT || 3000;

const pautasRouter = require('./pautas');
const espelhosRouter = require('./espelhos');
const blocosRouter = require('./blocos');
const materiaRouter = require('./materia');
const agendaRouter = require('./agenda');
const sugestoesRouter = require('./sugestoes');
const { criarServidorTempoReal } = require('./tempo_real');

app.use(express.json());
app.use(express.static('public'));

// Registrado no app pra qualquer rota acessar via req.app.get('tempoReal')
// sem precisar de import circular entre index.js e os módulos de rota
const servidor = http.createServer(app);
app.set('tempoReal', criarServidorTempoReal(servidor));

app.use('/pautas', pautasRouter);
app.use('/espelhos', espelhosRouter);
app.use('/blocos', blocosRouter);
app.use('/materia', materiaRouter);
app.use('/agenda', agendaRouter);
app.use('/sugestoes', sugestoesRouter);

app.get('/', (req, res) => {
  res.send('HORUS Newsroom está no ar!');
});

servidor.listen(porta, () => {
  console.log(`HORUS Newsroom rodando em http://localhost:${porta}`);
});