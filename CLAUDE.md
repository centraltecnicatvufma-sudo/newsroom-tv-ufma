# HORUS Newsroom — orientação para sessões do Claude Code

Este repositório contém **duas coisas relacionadas, mas em estágios muito
diferentes**: o app v1, rodando de verdade; e o documento que descreve pra
onde o produto está indo. Antes de mexer em qualquer coisa, identifique em
qual dos dois o pedido se encaixa.

## 1. HORUS Newsroom v1 — o app em produção (raiz do repo)

Sistema de gestão de redação em uso real na TV UFMA, hoje — **esta é a
primeira versão do HORUS Newsroom**, rebatizada a partir do antigo nome
"Newsroom TV UFMA" (o histórico de commits/memória ainda usa o nome antigo
em referências a decisões passadas; é o mesmo projeto). Stack: Node.js +
Express + better-sqlite3 (`newsroom.db`), front-end vanilla HTML/CSS/JS em
`public/`. Cada arquivo `.js` na raiz (`pautas.js`, `blocos.js`,
`espelhos.js` etc.) é uma rota Express; cada `.html` em `public/` é uma tela
completa e independente, sem framework. A barra lateral (`.nr-sidebar`) e o
servidor se identificam como "HORUS Newsroom" — ver `index.js` e o bloco
`.nr-logo` de qualquer tela em `public/`.

Pedidos sobre pautas, sugestões, agenda, espelho/rundown, teleprompter,
lauda, relatórios — são **sobre este sistema**. Regras que já se provaram
importantes aqui:

- **Nunca testar contra o `newsroom.db` real.** Sempre copiar pra um
  diretório isolado (`/tmp/...`) antes de subir um servidor de teste, mesmo
  em outra porta — `require('./banco')` abre o banco por caminho relativo
  ao `cwd`, então rodar a partir do diretório real grava no banco de
  produção mesmo com `PORT` diferente. Já aconteceu de dados de produção
  sumirem temporariamente por causa disso.
- O usuário mantém o servidor real rodando na porta 3000 **enquanto
  trabalhamos** — mudanças inesperadas no banco real podem ser trabalho
  dele em paralelo, não necessariamente um bug.
- **Arquivos `.js` de rota só recarregam com reinício do processo** —
  `require()` do Node cacheia módulos na primeira carga. Editar
  `banco.js`/`sugestoes.js`/`espelhos.js`/etc. no disco não afeta o
  servidor real já rodando até ele ser reiniciado; avisar o usuário sempre
  que uma mudança de backend precisar disso (arquivos `.html` são
  estáticos, servidos frescos a cada requisição, não têm esse problema).
- Avançar em passos pequenos e testados. Confirmar escopo antes de mudanças
  de comportamento (não só bugfix) quando houver mais de uma opção
  razoável.
- Todas as 9 telas (`index`, `pautas`, `sugestoes`, `agenda`, `espelhos`,
  `espelho`, `teleprompter`, `materia`, `relatorios`) compartilham a mesma
  barra lateral (`.nr-sidebar` / `.nr-app`) — ver qualquer uma delas como
  referência de padrão antes de criar uma tela nova.

Memória de projeto (auto-carregada em sessões do Claude Code) tem mais
detalhes de estado atual e decisões técnicas: veja o índice de memória do
projeto.

## 2. HORUS — o documento de arquitetura-alvo (`docs/horus/`)

Um SAPDD (Software Architecture & Product Design Document) de 250–400
páginas descrevendo pra onde o HORUS Newsroom evolui — um NRCS (Newsroom
Computer System) completo, com arquitetura própria (React/TypeScript,
FastAPI, PostgreSQL, orientado a eventos). **É o mesmo produto do item 1,
etapa futura** — o app de hoje é a v1 (simples, em produção real); este
documento descreve a arquitetura-alvo (v2/Enterprise, ver Volume VIII do
próprio documento), não um sistema à parte.

- Índice-mestre e status de cada capítulo: [`docs/horus/README.md`](docs/horus/README.md).
- Português, diagramas em Mermaid, um arquivo Markdown por capítulo,
  versionado normalmente no git.
- O documento é escrito **sem se prender ao código atual** — descreve a
  arquitetura correta pro NRCS completo, não uma extensão incremental do
  Express/SQLite de hoje. O que se aproveita da v1 pro redesenho é
  conhecimento de domínio validado em produção real (quais fluxos
  funcionam, quais telas as pessoas realmente usam), não código nem schema
  de banco — a v1 pode muito bem continuar em produção enquanto a
  arquitetura-alvo é desenhada e, eventualmente, construída à parte.
- Pedidos sobre volumes, capítulos, arquitetura do HORUS, módulos do NRCS,
  motor de workflow, IA editorial etc. são **sobre este documento**, não
  sobre o app em `public/`.

## Se não estiver claro qual dos dois

Pergunte. "Espelho" no item 1 é uma tela real com rota Express; "Rundown"
no item 2 é um módulo ainda só especificado em texto — são coisas
diferentes com nomes parecidos, e confundir os dois é o erro mais fácil de
cometer aqui.
