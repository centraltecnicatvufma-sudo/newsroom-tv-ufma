# HORUS — Software Architecture & Product Design Document (SAPDD)

> Documento-mestre do projeto HORUS: um NRCS (Newsroom Computer System) completo,
> com identidade própria, preparado para emissoras universitárias, públicas e
> comerciais. Não é um documento de requisitos — é o manual completo do sistema.

**Escopo alvo:** 250–400 páginas, em 8 volumes, com diagramas (Mermaid),
modelos de dados, wireframes e especificações funcionais completas.

**Relação com o app em produção:** o sistema hoje rodando (Express/SQLite,
antes chamado "Newsroom TV UFMA") passou a se chamar **HORUS Newsroom v1** —
é a primeira versão do mesmo produto que este documento descreve em sua
forma-alvo. Este SAPDD é escrito sem restrição do código da v1: descreve a
arquitetura correta pro NRCS completo (v2/Enterprise, ver Volume VIII), não
uma extensão incremental do que já existe. A v1 continua rodando e evoluindo
em paralelo — é o laboratório vivo cujo aprendizado real de redação alimenta
as decisões deste documento. Não há migração técnica direta prevista entre
v1 e a arquitetura-alvo; há reaproveitamento de conhecimento de domínio
validado em uso real (código e schema de banco não se transportam).

**Metodologia de escrita:** dado o tamanho, este documento é escrito em
*steel-thread* — um capítulo é desenvolvido por completo primeiro (Volume I,
Capítulo 1) para calibrar profundidade e estilo com quem encomendou o
documento; os demais capítulos seguem o mesmo padrão, volume por volume, ao
longo de várias sessões de trabalho.

**Idioma:** português. **Diagramas:** Mermaid (renderiza nativo no GitHub, no
VS Code e nas visualizações internas usadas neste projeto).

---

## Como ler este índice

Cada capítulo tem um status:

- ✅ **Concluído** — texto final, revisado
- 🚧 **Em andamento**
- ⬜ **Planejado** — só o escopo está definido aqui; texto ainda não escrito

Cada volume tem uma estimativa de páginas (formato A4, ~450 palavras/página).
As estimativas são um guia de proporção entre volumes, não um teto rígido —
onde o assunto pedir mais profundidade (Arquitetura, Módulos), o texto cresce.

---

## VOLUME I — Visão do Produto
*Estimativa: 25–35 páginas*

| # | Capítulo | Status |
|---|----------|--------|
| 1 | [Introdução](volume-1-visao-do-produto/01-introducao.md) *(~5 páginas)* | ✅ Concluído |
| 2 | Conceito do HORUS *(por que "HORUS", a inspiração no Olho de Hórus, missão, visão, valores)* | ⬜ Planejado |
| 3 | Objetivos *(curto, médio, longo prazo — roadmap resumido, detalhado no Vol. VIII)* | ⬜ Planejado |

## VOLUME II — Arquitetura
*Estimativa: 50–70 páginas*

| # | Capítulo | Status |
|---|----------|--------|
| 1 | Arquitetura Geral *(diagrama em camadas: Frontend → API → Backend → Engines → Event Bus → Banco)* | ⬜ Planejado |
| 2 | Arquitetura Limpa *(Clean Architecture aplicada ao HORUS)* | ⬜ Planejado |
| 3 | Fluxo Completo de uma Requisição *(Usuário → API → Use Case → Domínio → Banco)* | ⬜ Planejado |
| 4 | Arquitetura Vertical Slice | ⬜ Planejado |
| 5 | Arquitetura Orientada a Eventos *(Event-Driven, Event Bus, contratos de evento)* | ⬜ Planejado |
| 6 | Máquina de Estados *(state machines do domínio editorial — pauta, matéria, item de rundown)* | ⬜ Planejado |
| 7 | Sistema de Auditoria *(trilha de auditoria como cidadão de primeira classe)* | ⬜ Planejado |

## VOLUME III — Banco de Dados
*Estimativa: 40–60 páginas*

Modelagem completa com diagramas ER. Entidades previstas — cada uma com
diagrama, campos, relacionamentos e regras de integridade:

`Workspace` · `Organization` · `User` · `Role` · `Permission` · `People` ·
`Coverage` · `Story` · `Script` · `Assignment` · `Event` · `Schedule` ·
`Workflow` · `Rundown` · `Template` · `Prompt` (teleprompter) · `Cue` ·
`Source` · `RSS` · `Wire` · `Bulletin` · `Media` · `Asset` · `Vehicle` ·
`Notification` · `History` · `Audit`

| Status | Cobertura |
|---|---|
| ⬜ Planejado | Todas as entidades acima |

## VOLUME IV — Módulos
*Estimativa: 80–120 páginas — o maior volume*

Cada módulo: objetivo, tela, fluxo, botões, estados, permissões, integrações,
eventos. ~10–30 páginas por módulo, proporcional à complexidade.

| Módulo | Status |
|---|---|
| Planning Desk | ⬜ Planejado |
| Assignment | ⬜ Planejado |
| Coverage | ⬜ Planejado |
| Story | ⬜ Planejado |
| Script Editor (Lauda) | ⬜ Planejado |
| Teleprompter Broadcast | ⬜ Planejado |
| Rundown (Espelho) | ⬜ Planejado |
| Media & Assets | ⬜ Planejado |
| Templates | ⬜ Planejado |
| Users & Organizations | ⬜ Planejado |
| Permissions | ⬜ Planejado |
| Search | ⬜ Planejado |
| Dashboard | ⬜ Planejado |
| Analytics | ⬜ Planejado |
| IA Editorial | ⬜ Planejado |
| Feeds Externos (RSS / Agências) | ⬜ Planejado |
| Integração vMix | ⬜ Planejado |
| Integração OBS | ⬜ Planejado |
| Integração ATEM | ⬜ Planejado |
| Integração MOS | ⬜ Planejado |

## VOLUME V — UX
*Estimativa: 30–50 páginas*

Wireframes tela por tela.

| Tela | Status |
|---|---|
| Sidebar / Navegação | ⬜ Planejado |
| Dashboard | ⬜ Planejado |
| Planning | ⬜ Planejado |
| Coverage | ⬜ Planejado |
| Story | ⬜ Planejado |
| Editor (Lauda) | ⬜ Planejado |
| Prompt (Teleprompter) | ⬜ Planejado |
| Mirror (Rundown/Espelho) | ⬜ Planejado |
| Media | ⬜ Planejado |
| Settings | ⬜ Planejado |

## VOLUME VI — Motor do HORUS
*Estimativa: 30–40 páginas*

Provavelmente a parte mais importante do documento — o que faz o HORUS ser um
sistema e não uma coleção de telas.

| Engine | Status |
|---|---|
| Workflow Engine | ⬜ Planejado |
| Machine State | ⬜ Planejado |
| Rules Engine | ⬜ Planejado |
| Permissions Engine | ⬜ Planejado |
| Notification Engine | ⬜ Planejado |
| Search Engine | ⬜ Planejado |
| Versioning Engine | ⬜ Planejado |
| Media Engine | ⬜ Planejado |
| Rendering Engine | ⬜ Planejado |

## VOLUME VII — IA
*Estimativa: 20–30 páginas*

| Capacidade | Status |
|---|---|
| Sugestão de pauta | ⬜ Planejado |
| Resumo automático | ⬜ Planejado |
| Correção de texto | ⬜ Planejado |
| Geração de headline | ⬜ Planejado |
| Legenda | ⬜ Planejado |
| GC (Gerador de Caracteres) assistido | ⬜ Planejado |
| Assistência de Prompt (teleprompter) | ⬜ Planejado |
| Tradução | ⬜ Planejado |
| Transcrição | ⬜ Planejado |
| Fact Checking | ⬜ Planejado |
| Busca Inteligente | ⬜ Planejado |
| Organização automática | ⬜ Planejado |

## VOLUME VIII — Roadmap
*Estimativa: 15–20 páginas*

| Fase | Status |
|---|---|
| Versão 1 | ⬜ Planejado |
| Versão 2 | ⬜ Planejado |
| Versão 3 | ⬜ Planejado |
| Enterprise | ⬜ Planejado |
| Cloud | ⬜ Planejado |
| Mobile | ⬜ Planejado |

---

## Diagramas planejados (visão geral)

Fluxogramas, diagramas UML, diagramas de sequência, diagramas ER —
distribuídos pelos volumes conforme o assunto, não concentrados num único
apêndice:

- Arquitetura geral (Vol. II)
- Diagramas de estado — pauta, matéria, item de rundown (Vol. II, VI)
- Diagramas de permissões (Vol. II, VI)
- Diagramas ER completos (Vol. III)
- Fluxo editorial completo, ponta a ponta (Vol. IV)
- Fluxo do Teleprompter (Vol. IV)
- Fluxo da Cobertura (Coverage) (Vol. IV)
- Fluxo de Publicação multiplataforma (Vol. IV)
- Fluxo da IA Editorial (Vol. VII)
- Fluxo de Assets/Media (Vol. IV)

## Referências de mercado

Documento inspirado no nível de detalhamento de manuais internos de: ENPS,
Octopus, AP ENPS, Ross Video, Sony NRCS, CGI OpenMedia, Dalet, Arion (SNews).
O HORUS não é um clone de nenhum desses — é um sistema com identidade
própria, adaptado à realidade de redações universitárias, públicas e
comerciais de pequeno/médio porte.
