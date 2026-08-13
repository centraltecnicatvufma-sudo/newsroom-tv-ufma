const express = require('express');
const http = require('http');
const fs = require('fs');
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
const historicoRouter = require('./historico');
const { registrarAcoes } = historicoRouter;
const { criarServidorTempoReal } = require('./tempo_real');

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Rota temporária pra transferir o newsroom.db real uma única vez pra um
// deploy novo (ex.: Render), sem nunca commitar dados reais no git. Só
// existe se ADMIN_UPLOAD_TOKEN estiver definido no ambiente — remover essa
// variável (ou a rota inteira) depois do upload único fecha essa porta.
if (process.env.ADMIN_UPLOAD_TOKEN) {
  app.post('/admin/importar-banco', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
    if (req.get('x-admin-token') !== process.env.ADMIN_UPLOAD_TOKEN) {
      return res.status(403).json({ erro: 'Token inválido' });
    }
    const destino = process.env.DB_PATH || 'newsroom.db';
    fs.writeFileSync(destino, req.body);
    res.json({ ok: true, bytes: req.body.length });
    console.log(`Banco importado via /admin/importar-banco (${req.body.length} bytes). Reiniciando processo...`);
    setTimeout(() => process.exit(0), 200);
  });
}

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
app.use(registrarAcoes);
app.use('/historico-acoes', historicoRouter);

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