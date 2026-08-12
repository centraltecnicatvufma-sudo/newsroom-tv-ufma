const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const app = express();
const porta = process.env.PORT || 3000;

const pautasRouter = require('./pautas');
const espelhosRouter = require('./espelhos');
const blocosRouter = require('./blocos');
const materiaRouter = require('./materia');
const agendaRouter = require('./agenda');
const sugestoesRouter = require('./sugestoes');
const alertasRouter = require('./alertas');
const calendarioRouter = require('./calendario');
const escalaRouter = require('./escala');
const chatRouter = require('./chat');
const authRouter = require('./auth');
const { exigirLogin } = authRouter;
const { criarServidorTempoReal } = require('./tempo_real');

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Registrado no app pra qualquer rota acessar via req.app.get('tempoReal')
// sem precisar de import circular entre index.js e os módulos de rota
const servidor = http.createServer(app);
app.set('tempoReal', criarServidorTempoReal(servidor));

// /auth fica ABERTA (sem exigirLogin) — senão ninguém conseguiria logar.
// Tudo que é registrado DEPOIS de exigirLogin exige sessão válida; os
// arquivos estáticos (public/*.html, acima) continuam servidos sem
// checagem — é a API que fica protegida, então uma tela carrega mas
// não busca dado nenhum sem estar logado (ver public/auth-guard.js).
app.use('/auth', authRouter);
app.use(exigirLogin);

app.use('/pautas', pautasRouter);
app.use('/espelhos', espelhosRouter);
app.use('/blocos', blocosRouter);
app.use('/materia', materiaRouter);
app.use('/agenda', agendaRouter);
app.use('/sugestoes', sugestoesRouter);
app.use('/alertas', alertasRouter);
app.use('/calendario', calendarioRouter);
app.use('/escala', escalaRouter);
app.use('/chat', chatRouter);

app.get('/', (req, res) => {
  res.send('HORUS Newsroom está no ar!');
});

servidor.listen(porta, () => {
  console.log(`HORUS Newsroom rodando em http://localhost:${porta}`);
});