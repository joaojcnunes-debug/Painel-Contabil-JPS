# Painel Contábil JPS — Documentação completa

> Documentação interna · versão 2.0 · outubro/2026
> Sistema online: https://painel-contabil-jps.vercel.app
> Código: https://github.com/joaojcnunes-debug/Painel-Contabil-JPS

Esta versão substitui a 1.0 (julho/2026, `docs/painel-contabil.pdf`). O que mudou desde então:
- novo módulo **Distribuição de lucros** (seção 3.3);
- a seção de automações (4) foi revisada contra o banco: algumas funções que a versão 1.0 dava como automáticas só rodam quando alguém as dispara.

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Acesso e perfis](#2-acesso-e-perfis)
3. [Módulos do sistema](#3-módulos-do-sistema)
4. [Automações e rotinas](#4-automações-e-rotinas)
5. [Integração NFS-e](#5-integração-nfs-e)
6. [Banco de dados](#6-banco-de-dados)
7. [Rotas de API](#7-rotas-de-api)
8. [Segurança](#8-segurança)
9. [Manutenção e operação](#9-manutenção-e-operação)
10. [Limitações conhecidas](#10-limitações-conhecidas)
11. [Deploy e infraestrutura](#11-deploy-e-infraestrutura)
12. [Desenvolvimento local](#12-desenvolvimento-local)

---

## 1. Visão geral

O Painel Contábil JPS é o sistema interno do escritório **JSP Contabilidade Personalizada**. Ele centraliza a operação contábil, fiscal e trabalhista da carteira de clientes: cadastros, cálculos, obrigações, integrações com órgãos do governo e um portal para o cliente final acompanhar a própria empresa.

### 1.1 Para quem

| Público | O que usa |
|---|---|
| Equipe interna (Admin, Contador, Assistente) | Todos os módulos operacionais, integrações e configurações |
| Cliente final | Portal (`/portal`): só documentos, financeiro e obrigações da própria empresa |

### 1.2 Tecnologias

| Camada | Tecnologia | Observações |
|---|---|---|
| Interface | Next.js 15.5 (App Router) + React 19 + TypeScript | Porta local 3003 |
| Visual | Tailwind CSS 4 + ícones Lucide | Paleta institucional verde-oliva e dourado |
| Gráficos | Recharts | Início, Monitor de XMLs, Gestão, Distribuição de lucros |
| Dados | Supabase (Postgres + Auth + Storage + Edge Functions) | RLS ativo nas tabelas |
| Estado no navegador | TanStack Query v5 + Zustand | Cache por `queryKey` |
| XML e criptografia | fast-xml-parser, xml-crypto, node-forge | Assinatura digital SEFAZ/eSocial com certificado A1 |
| Automação de navegador | Playwright + Chromium (headless, mTLS) | Coleta de NFS-e no portal nfse.gov.br |
| Publicação | Vercel (site e API) + Supabase (banco) + GitHub Actions (rotinas) | Publica sozinho a cada commit na `main` |

### 1.3 Números

| Item | Quantidade |
|---|---|
| Telas (páginas) | 66 |
| Rotas de API | 16 |
| Migrations | 35 (+ `schema.sql` base) |
| Tabelas | 56 + 1 view |
| Edge Functions | 11 |
| Rotinas agendadas | 3 no banco (pg_cron) + 1 no GitHub Actions |

---

## 2. Acesso e perfis

O login é por e-mail e senha (Supabase Auth), com verificação em duas etapas opcional por aplicativo autenticador (TOTP). Quem ativou a verificação passa por `/login/2fa` depois da senha.

| Perfil | Acessa | Uso típico |
|---|---|---|
| Admin | Tudo, incluindo Usuários, Logs, Configurações e catálogos | Responsável pelo escritório |
| Contador | Módulos operacionais e integrações | Contador titular no dia a dia |
| Assistente | Módulos operacionais | Auxiliar ou estagiário |
| Cliente | Só `/portal`, limitado à própria empresa | Cliente final |

**Grupos de rotas:**
- `(public)`: login, verificação em duas etapas, "esqueci a senha" e redefinição.
- `(app)`: área interna da equipe.
- `(hub)`: tela de módulos (`/modulos`), da equipe, em página cheia.
- `(portal)`: área do cliente.
- `/f/[token]`: formulários públicos do módulo Gestão, sem login.

Um usuário Cliente que tenta abrir a área interna é levado para `/portal`. Visitantes sem login são levados para `/login`.

---

## 3. Módulos do sistema

O menu lateral agrupa os módulos por área. A ordem abaixo segue o menu.

### 3.1 Itens soltos do menu

**Início (`/inicio`).** Painel com os números do escritório: clientes ativos, obrigações pendentes e atrasadas, documentos recebidos e faturas em aberto, além de um gráfico de receitas e despesas dos últimos meses. É a primeira tela da equipe.

**Módulos (`/modulos`) — novo em outubro/2026.** Tela cheia, sem o menu lateral, com as áreas do sistema em cartões grandes. Fica no grupo de rotas `(hub)`, que tem a mesma checagem de login da área interna.
- **Nível 1 (`/modulos`):** um cartão por área (Contábil, RH / DP, Fiscal, Financeiro e gestão) e atalhos diretos para Clientes, Gestão, Integrações e Logs (só Admin).
- **Nível 2 (`/modulos?c=<área>`):** um cartão por módulo da área. A área fica na URL, então o botão Voltar do navegador funciona e o link pode ser compartilhado.
- **Contagens** (`lib/hooks/useHubStats.ts`): total, pendentes e novos nos últimos 30 dias. Passam pelo RLS do usuário, e uma consulta que falha só deixa aquele cartão sem número.
- **Pendências por módulo:** obrigações pendentes ou atrasadas, documentos recebidos ou em análise, faturas abertas ou atrasadas, sessões e-CAC com pendência, movimentos bancários não conciliados e NF-e sem manifestação.
- **Ordem:** dentro de cada área, os módulos com mais pendências vêm primeiro.
- **Cabeçalho:** saudação com o primeiro nome, data por extenso e botões Visão geral, Sistema (só Admin) e Sair.
- **Acesso:** o item **Módulos** do menu lateral leva para lá. O login continua levando para `/inicio`. O perfil Cliente é levado para `/portal`.

**Clientes (`/clientes`).** Cadastro completo da carteira: pessoa jurídica ou física, razão social, CNPJ/CPF, regime tributário (Simples, Presumido, Real, MEI, Doméstico, Rural), anexo do Simples, atividade, honorário mensal, dia de vencimento, endereço, responsável e contatos.
- Preenche os dados pelo CNPJ (BrasilAPI) e o endereço pelo CEP (ViaCEP).
- Importação em lote por CSV.
- Visão 360° do cliente em `/clientes/[id]`, com obrigações, faturas, documentos e contatos.
- Relatório para impressão em `/clientes/[id]/relatorio`.

### 3.2 Contábil

**Lançamentos (`/lancamentos`).** Escrituração de receitas e despesas no plano de contas, com importação CSV e anexos.
- `/lancamentos/recorrentes`: modelos que geram lançamentos todo mês.
- `/lancamentos/catalogo`: plano de contas, editável pelo Admin.
- `/lancamentos/dre`: DRE.
- `/lancamentos/demonstracoes`: demonstrações formatadas.

**Conciliação (`/conciliacao`).** Importa extratos bancários (OFX ou CSV) e sugere o lançamento correspondente a cada movimento. A regra de comparação fica em `lib/conciliacao-match.ts`. Abas: Pendentes, Conciliados e Ignorados.

**Apuração (`/apuracao`).** Cálculo do DAS do Simples Nacional: usa a receita bruta dos últimos 12 meses (RBT12), aplica a alíquota efetiva do anexo do cliente (I a V) e grava em `apuracoes_simples`. As tabelas oficiais estão em `lib/simples-nacional.ts`.

**NF-e (`/nfe`).** Importação de XMLs de NF-e. Ignora notas repetidas pela chave, identifica se o cliente é emitente (saída) ou destinatário (entrada) e cria o lançamento vinculado. Detalhe da nota em `/nfe/[id]`.

**Monitor de XMLs (`/monitor-xmls`).** Painel das NF-e baixadas pela Distribuição DF-e da SEFAZ: notas sem manifestação, sem lançamento e totais por período (7, 30, 90 dias ou ano). Usa a view `vw_nfe_dfe_monitor`. Um resumo diário é enviado por e-mail (seção 4).

**Notas Fiscais (integração) (`/integracoes/notas-fiscais`).** SEFAZ NF-e: Distribuição DF-e, status da SEFAZ e manifestação do destinatário.
- `/integracoes/notas-fiscais/recebidas`: notas recebidas.
- `/integracoes/notas-fiscais/manifestacoes`: histórico de manifestações.

**Notas Fiscais Emitidas (`/integracoes/nfse/recebidas`).** NFS-e capturadas pelas quatro origens descritas na seção 5.

**Prefeituras / ISS (`/integracoes/prefeituras`).** NFS-e municipal, ISS e CND municipal. Mostra o cartão de situação da coleta automática de NFS-e por cliente e o botão "Sincronizar agora".

### 3.3 RH / DP

**Folha (`/folha`).** Folha de pagamento com as abas Funcionários, Processar e Histórico.
- Cadastro de funcionários: CLT, estagiário ou aprendiz, com situação ativo, afastado, em férias ou demitido.
- Cálculo mensal de proventos, INSS, IRRF e descontos.
- Detalhe da folha em `/folha/[id]` e holerite para impressão em `/folha/[id]/holerite/[idFunc]`.
- Gera os XMLs S-1200 do eSocial.

**Pró-labore (`/pro-labore`).** Cadastro dos sócios de cada empresa (participação, pró-labore mensal, dependentes, dados bancários) e processamento mensal com INSS de 11% (contribuinte individual, com teto) e IRRF. Recibo em `/pro-labore/recibo/[id]`. O cadastro de sócios daqui também é usado pela Distribuição de lucros.

**Distribuição de lucros (`/distribuicao-lucros`) — novo em outubro/2026.** Acompanha as retiradas de lucro dos sócios por empresa.
- **Filtros:** empresa, sócio, ano, trimestre e mês, e um botão para alternar entre visão mensal e trimestral.
- **Cartões de resumo:** total distribuído no período, quantidade de lançamentos, média por empresa e o sócio que mais recebeu.
- **Gráfico:** evolução do ano, mês a mês ou por trimestre.
- **Tabela por empresa e sócio:** uma coluna por mês ou trimestre, com totais por linha e por coluna.
- **Lançamentos:** lista com edição e exclusão, e exportação CSV pronta para o Excel (Data, Empresa, CNPJ, Sócio, CPF, Mês/Ano, Trimestre, Valor, Forma de pagamento, Observações).
- **Importar planilha:** CSV com as colunas Data, Empresa ou CNPJ, Sócio ou CPF e Valor (opcionais: Forma de pagamento e Observações). Aceita `;` ou `,` como separador, valores como `15.000,00` e datas como `15/01/2026`. Antes de gravar, mostra uma prévia de cada linha. Linhas com empresa ou sócio não cadastrado são marcadas e não entram.
- **Regras:**
  - O sócio precisa estar cadastrado no Pró-labore.
  - O valor precisa ser maior que zero.
  - Um sócio com distribuições lançadas não pode ser apagado.
  - Cada lançamento guarda o nome e o CPF do sócio na data, para o histórico não mudar se o cadastro for editado.
  - Mês e trimestre são calculados a partir da data da retirada.
- **Permissão:** só a equipe lança, edita e exclui. O cliente pode ler os lançamentos da própria empresa.

**13º salário (`/decimo-terceiro`).** Cálculo das duas parcelas pelos meses trabalhados no ano, com ajustes (média de variáveis, primeira parcela já paga). Recibo em `/decimo-terceiro/recibo/[id]`.

**Férias (`/ferias`).** Programação, terço constitucional e abono pecuniário. Recibo em `/ferias/recibo/[id]`.

**eSocial (`/integracoes/esocial`).** Envio e consulta de eventos (S-1000, S-2200, S-2210 e outros) e acompanhamento de lotes.

**FGTS Digital (`/integracoes/fgts-digital`).** Consultas ao FGTS Digital.

### 3.4 Fiscal

**Obrigações (`/obrigacoes`).** Obrigações fiscais e trabalhistas (DAS, DCTFWeb, DEFIS, FGTS, GPS etc.) por cliente e competência, com vencimento e situação: pendente, em andamento, entregue, atrasada ou dispensada.
- `/obrigacoes/calendario`: calendário mensal em grade.
- `/obrigacoes/catalogo`: tipos de obrigação, cadastrados pelo Admin.
- `/obrigacoes/[id]`: detalhe com conversa (comentários).
- Gerador em massa: cria todas as obrigações do mês de uma vez.

**Documentos (`/documentos`).** Arquivos por cliente (contratos, comprovantes, guias). Envio por arrastar e soltar para uma pasta privada por cliente no Storage, com categoria e situação: recebido, em análise, processado ou devolvido.

**Sessões e-CAC (`/sessoes-ecac`).** Registro das consultas ao e-CAC: situação fiscal (regular ou com pendência), pendências e valor total. O botão "Abrir e-CAC" leva direto ao portal da Receita. O script `npm run ecac:sync` (`scripts/ecac/sync-ecac.mjs`) faz a sincronização com Playwright quando rodado no computador.

**Receita Federal (`/integracoes/receita-federal`).** Consulta de CNPJ, situação fiscal, pendências e caixa postal do e-CAC.

**EFD-Reinf (`/integracoes/efd-reinf`).** Eventos R-4000, serviços tomados, retenções e DCTFWeb.

**SPED (`/integracoes/sped`).** Envios SPED.

**Simples Nacional (`/integracoes/simples-nacional`).** Integrações PGDAS-D.

**REDESIM (`/integracoes/redesim`).** Integrações REDESIM.

### 3.5 Financeiro, produtividade e gestão

**Honorários (`/honorarios`).** Faturas do escritório para os clientes, com gerador mensal a partir do honorário cadastrado. Situação: aberta, paga, atrasada ou cancelada. Detalhe em `/honorarios/[id]` e recibo em `/honorarios/[id]/recibo`.

**Produtividade (`/produtividade`).** Percentual de obrigações entregues no prazo, ranking por responsável e clientes críticos, em períodos de 30 a 365 dias.

**Gestão (`/gestao`).** Gerenciador de tarefas no estilo Notion/ClickUp, com espaços, pastas, quadros e tarefas, nas visões Kanban, Lista, Calendário, Linha do tempo e Painel.
- Permissões próprias por quadro (dono, admin, membro).
- Campos personalizados, etiquetas, comentários, anexos, dependências e controle de tempo.
- Automações, filtros salvos e preferência de visão por usuário.
- Notificações.
- Formulários públicos (`/f/[token]`, função `gestao-form-submit`).
- Assistente de IA (`gestao-ia`, modelo OpenAI `gpt-4o-mini`).
- Calendário exportável em iCal (`gestao-ics`).
- Resumo diário por e-mail para a equipe.

### 3.6 Sistema

**Integrações — visão geral (`/integracoes`).** Cartões de todos os módulos de governo. Cada ação pode rodar em modo **simulado** (dados fictícios, sem chamar o governo) ou **real** (chama o serviço de verdade e exige certificado A1). O registro central está em `lib/integracoes/core/registry.ts`. O histórico de execuções fica em `/integracoes/logs`.

**Certificado Digital (`/integracoes/certificado-digital` e `/integracoes/certificados`).** Cadastro de certificados (A1, A3, procuração e-CAC, Conectividade Social). Valida o arquivo `.pfx` e extrai titular, CNPJ, emissor e validade. Avisa se o CNPJ não bate com o do cliente. Guarda o arquivo em pasta privada e a senha criptografada.

**Segurança (`/seguranca`).** O próprio usuário ativa ou desativa a verificação em duas etapas (TOTP).

**Usuários (`/usuarios`) — só Admin.** Cadastro de logins e perfis, com vínculo a um cliente para o acesso ao portal. O Admin pode redefinir a senha de outro usuário (função `admin-reset-password`).

**Logs (`/logs`) — só Admin.** Auditoria de inclusões, alterações e exclusões nas tabelas importantes, com comparação antes/depois.

**Configurações (`/config`).** Dados do escritório, logo, e-mails de alerta e botões para disparar à mão as funções de rotina (seção 4.2).

### 3.7 Portal do cliente

| Rota | Conteúdo |
|---|---|
| `/portal` | Visão geral: próximos vencimentos e faturas a pagar |
| `/portal/obrigacoes` | Calendário fiscal do próprio CNPJ |
| `/portal/documentos` | Envio de arquivos para a contabilidade e download dos próprios |
| `/portal/financeiro` | Faturas em aberto e histórico |

---

## 4. Automações e rotinas

### 4.1 O que roda sozinho

Conferido no banco (`cron.job`) e no GitHub em 12/10/2026:

| Rotina | Onde | Horário | O que faz |
|---|---|---|---|
| `alertas-diarios-equipe` | pg_cron → `enviar-alertas-diarios-equipe` | Seg a sex, 11h UTC (8h de Brasília) | Resumo diário da Gestão para a equipe, por e-mail |
| `resumo-nfe-diario` | pg_cron → `invoke_edge_resumo_nfe_diario()` → `enviar-resumo-nfe-diario` | Todo dia, 11h UTC (8h de Brasília) | Resumo das NF-e capturadas, por e-mail |
| `gestao-automacao-prazos` | pg_cron → `gestao_automacao_prazos()` | Todo dia, 6h05 UTC (3h05 de Brasília) | Roda as automações da Gestão ligadas a prazo |
| NFS-e scrape | GitHub Actions (`nfse-scrape-daily.yml`) | Todo dia, 6h UTC (3h de Brasília) | Coleta as NFS-e emitidas no portal nacional (seção 5) |

### 4.2 O que só roda quando alguém dispara

As funções abaixo existem e funcionam, mas **não têm agendamento no banco**. Hoje elas só rodam pelos botões da tela **Configurações**:

| Função | O que faz |
|---|---|
| `atualizar-status-vencidos` | Marca obrigações e faturas vencidas como atrasadas |
| `enviar-alertas-vencimento` | E-mail de obrigações perto do vencimento |
| `enviar-alertas-faturas` | E-mail de cobrança de honorários |
| `enviar-relatorio-mensal` | Relatório mensal para o cliente |
| `gerar-recorrentes-mes` | Cria os lançamentos recorrentes do mês |

A versão 1.0 desta documentação dizia que essas cinco rodavam por cron diário ou mensal. Para que voltem a rodar sozinhas, é preciso criar os agendamentos no pg_cron, seguindo o modelo de `alertas-diarios-equipe`.

### 4.3 Funções chamadas sob demanda

| Função | Quando roda |
|---|---|
| `gestao-form-submit` | Envio de um formulário público (`/f/[token]`) |
| `gestao-ia` | Uso do assistente de IA na Gestão |
| `gestao-ics` | Assinatura ou download do calendário iCal |
| `admin-reset-password` | Admin redefine a senha de um usuário |

Os e-mails saem por Gmail (secrets `GMAIL_USER`, `GMAIL_APP_PASSWORD` e `EMAIL_FROM_NAME` nas Edge Functions).

---

## 5. Integração NFS-e

A NFS-e é a única fonte fiscal sem uma API oficial que devolva as notas **emitidas** pelo prestador: o ADN só devolve as notas em que o CNPJ é **tomador**. Por isso o sistema combina quatro caminhos, identificados na coluna `origem` de `nfse_recebidas`:

| Origem | Como chega | Traz XML? | Cobre |
|---|---|---|---|
| `adn` | API oficial `/contribuintes/DFe/{NSU}` com mTLS | Sim | Notas em que o CNPJ do certificado é tomador |
| `nota_carioca` | Webservice ABRASF da Prefeitura do Rio, com mTLS | Sim | Histórico municipal do Rio (desativado em 01/01/2026) |
| `portal_scrape` | Playwright com certificado A1 no portal nfse.gov.br | Não (o download exige captcha) | Notas emitidas pelo cliente no portal nacional |
| `manual` | Upload pelo usuário | Sim | Quando as outras origens não cobrem |

### 5.1 Como funciona a coleta automática (portal_scrape)

1. Às 3h (Brasília) o GitHub Actions instala Node 22, as dependências e o Chromium, e roda `scripts/nfse-scrape/index.mjs`.
2. O script busca os clientes ativos que têm certificado A1 com senha criptografada.
3. Para cada cliente:
   1. Baixa o `.pfx` do bucket privado `certificados-jsp`.
   2. Descriptografa a senha (AES-256-GCM, chave `CERT_SENHA_MASTER_KEY`).
   3. Extrai a chave e o certificado com node-forge.
   4. Entra em `certificado.nfse.gov.br` com mTLS, sem verificação em duas etapas.
   5. Abre *Notas Emitidas* dos últimos 30 dias, percorre as páginas e lê os dados de cada nota.
   6. Grava em `nfse_recebidas` (atualiza se a nota já existe) e registra a execução em `integracoes_logs`.
4. Cada cliente leva cerca de 1 minuto. Se der erro, um print e o HTML da página ficam como artefato da execução no GitHub por 7 dias.

**Dados gravados por nota:** chave (50 dígitos), data de emissão, CNPJ e nome do prestador e do tomador, valor dos serviços, situação (autorizada, cancelada ou substituída), município e o código bruto do portal.

### 5.2 Como acompanhar

- **No Painel:** o cartão em `/integracoes/prefeituras` mostra a última sincronização, o total de notas e se houve falha.
- **No GitHub:** a aba **Actions** do repositório tem o histórico com log completo.
- **Sob demanda:** o botão "Sincronizar agora" abre o workflow para rodar na hora, sem esperar as 3h.

---

## 6. Banco de dados

Projeto Supabase `mwmltqaanfxjkoztgcby`. Todas as tabelas ficam no schema `public`, com chave primária de texto no formato `PREFIXO-XXXXXXXX` (gerada por `gerarId()` em `lib/utils.ts`).

### 6.1 Tabelas por módulo

| Módulo | Tabelas | Migration |
|---|---|---|
| Base | `usuarios`, `clientes`, `clientes_contatos`, `obrigacoes_catalogo`, `obrigacoes`, `documentos`, `faturas` | `schema.sql`, 01, 03 |
| Configurações | `configuracoes` (registro único) | 02, 05 (bucket de logos) |
| Obrigações | `obrigacoes_comentarios` | 04 |
| Auditoria | `audit_log` | 06 |
| Contábil | `plano_contas`, `lancamentos`, `lancamentos_modelos`, `banco_movimentos`, `apuracoes_simples` | 07–10 |
| Folha | `funcionarios`, `folhas_pagamento`, `folha_itens` | 11 |
| Sócios | `socios`, `pro_labore_pagamentos` | 12 |
| 13º e férias | `decimos_terceiros`, `ferias` | 13, 15 |
| Notas fiscais | `notas_fiscais` | 14 |
| Integrações | `certificados_digitais`, `integracoes_config`, `integracoes_logs` | 16, 17, 33 |
| NF-e DF-e | `nfe_dfe_nsu`, `nfe_dfe_recebidas`, `nfe_manifestacoes`, view `vw_nfe_dfe_monitor` | 18, 20, 21, 24, 25 |
| e-CAC | `sessoes_ecac` | 19 |
| eSocial | `esocial_lotes`, `esocial_eventos` | 22 |
| NFS-e | `nfse_recebidas`, `nfse_nsu` | 23, 32, 34 |
| Gestão | `gestao_espacos`, `gestao_pastas`, `gestao_quadros`, `gestao_status`, `gestao_tarefas`, `gestao_membros`, `gestao_acessos`, `gestao_acesso_log`, `gestao_campos`, `gestao_etiquetas`, `gestao_comentarios`, `gestao_anexos`, `gestao_filtros_salvos`, `gestao_preferencias_visao`, `gestao_notificacoes`, `gestao_tempo`, `gestao_dependencias`, `gestao_atividades`, `gestao_automacoes`, `gestao_automacao_log`, `gestao_formularios` | 26–31 |
| Distribuição de lucros | `distribuicoes_lucros` | 35 |

### 6.2 Funções de permissão usadas nas regras (RLS)

| Função | Retorna |
|---|---|
| `fn_is_equipe()` | Verdadeiro se o usuário logado é Admin, Contador ou Assistente |
| `fn_cliente_atual()` | O `id_cliente` vinculado ao usuário do portal |
| `fn_perfil_atual()` | O perfil do usuário logado |
| `fn_audit_trigger('<coluna id>')` | Gatilho que grava antes e depois em `audit_log` |

Padrão das tabelas por cliente: **leitura** para a equipe ou para o cliente dono (`id_cliente = fn_cliente_atual()`), e **gravação** só para a equipe.

### 6.3 Como aplicar uma migration

1. Crie o arquivo `supabase/migrations/NN_nome.sql`, de preferência com um `NN_nome_rollback.sql` ao lado.
2. Aplique no **SQL Editor** do Supabase ou pelo MCP do Supabase. O CI **não** aplica migrations.
3. Rode a análise de segurança do Supabase (Advisors) para conferir RLS e permissões.

---

## 7. Rotas de API

Ficam em `app/api/` e rodam na Vercel, no servidor.

| Rota | Função |
|---|---|
| `/api/certificado/upload` | Recebe o `.pfx` e grava no bucket privado |
| `/api/certificado/validar` | Abre o `.pfx` com a senha e extrai titular, CNPJ e validade |
| `/api/certificado/salvar-senha` | Criptografa e salva a senha do certificado |
| `/api/integracoes/sefaz-status` | Status do serviço da SEFAZ |
| `/api/integracoes/dfe-distribuir` | Distribuição DF-e de NF-e |
| `/api/integracoes/manifestar-nfe` | Manifestação do destinatário |
| `/api/integracoes/nfe-xml-url` | Link temporário para baixar o XML da NF-e |
| `/api/integracoes/nfse-distribuir` | Distribuição de NFS-e pelo ADN |
| `/api/integracoes/nfse-consultar-chave` | Consulta uma NFS-e pela chave |
| `/api/integracoes/nfse-importar-manual` | Importação manual de XML de NFS-e |
| `/api/integracoes/nfse-xml-url` | Link temporário para baixar o XML da NFS-e |
| `/api/integracoes/nfse-carioca-consultar` | Consulta na Nota Carioca (legado) |
| `/api/integracoes/esocial-enviar-s1000` | Envio do evento S-1000 |
| `/api/integracoes/esocial-consultar` | Consulta de evento do eSocial |
| `/api/integracoes/esocial-consultar-lote` | Consulta de lote do eSocial |
| `/api/nfe/vincular-lancamento` | Vincula uma NF-e a um lançamento contábil |

---

## 8. Segurança

### 8.1 Camadas

| Camada | Como funciona |
|---|---|
| Autenticação | Supabase Auth por e-mail e senha, verificação em duas etapas (TOTP) opcional, redefinição pelo Admin |
| Autorização | RLS nas tabelas: cliente só enxerga o próprio `id_cliente`, gravação restrita à equipe, catálogos restritos ao Admin |
| Criptografia | Senha do certificado A1 em AES-256-GCM (`CERT_SENHA_MASTER_KEY`), `.pfx` no bucket privado `certificados-jsp`, HTTPS em tudo e mTLS com SEFAZ, ADN e Nota Carioca |
| Auditoria | `audit_log` com antes/depois (tela `/logs`) e `integracoes_logs` com execução, duração e resultado |

### 8.2 Pendências de segurança apontadas pelo Supabase (12/10/2026)

Nenhuma delas envolve a tabela nova de distribuição de lucros:
- A view `vw_nfe_dfe_monitor` é `SECURITY DEFINER`, então ignora o RLS de quem consulta.
- 23 funções `SECURITY DEFINER` podem ser chamadas por visitantes anônimos via `/rest/v1/rpc/` (por exemplo `fn_is_equipe` e as funções `gestao_*`).
- 6 funções estão sem `search_path` fixo.
- A extensão `pg_net` está no schema `public`.
- A proteção contra senhas vazadas do Supabase Auth está desligada.

### 8.3 Troca periódica de credenciais

| Credencial | Onde fica | Como trocar |
|---|---|---|
| Service Role do Supabase | Vercel + secret do GitHub Actions | Dashboard → Settings → API → Reset |
| Token de acesso do Supabase (PAT) | Uso local e secret do CI | Dashboard → Account → Access Tokens |
| Senha de login no Painel | Cada usuário | Menu do usuário → Alterar senha |
| Senha do certificado A1 | Cadastro do certificado | Editar o certificado e digitar a nova senha; o sistema criptografa de novo |
| Chave mestra AES | Vercel + secret do GitHub Actions | Gerar outra (`randomBytes(32)`) e criptografar de novo as senhas existentes |

---

## 9. Manutenção e operação

### 9.1 Cadastrar um cliente
1. Abra **Clientes › Novo cliente**.
2. Digite o CNPJ: os dados são preenchidos pela BrasilAPI.
3. Confira o regime, o honorário e o endereço, e salve.
4. Se quiser, cadastre o certificado A1 (9.2) e crie um usuário Cliente para o portal (**Usuários**).

### 9.2 Cadastrar o certificado A1 de um cliente
1. Abra **Sistema › Certificado Digital › Novo certificado**.
2. Escolha a empresa e o tipo A1, envie o `.pfx` e digite a senha.
3. Clique em **Validar e preencher campos**. Se aparecer o alerta amarelo de CNPJ diferente, confirme que é o certificado certo antes de salvar.
4. Salve. O arquivo vai para o bucket privado e a senha é criptografada.

Com cliente ativo e certificado A1 cadastrado, a coleta de NFS-e da madrugada seguinte já inclui esse cliente.

### 9.3 Lançar distribuição de lucros
1. Confira se os sócios estão cadastrados em **RH / DP › Pró-labore**.
2. Abra **RH / DP › Distribuição de lucros**.
3. Lance com **Nova distribuição** ou importe uma planilha CSV com **Importar planilha**.
4. Use os filtros e o botão Mensal/Trimestral para consultar, e **CSV** para exportar.

### 9.4 Diagnosticar falha na coleta de NFS-e
1. Veja a execução mais recente em github.com/joaojcnunes-debug/Painel-Contabil-JPS/actions.
2. Se falhou, baixe o artefato com o print e o HTML.
3. Consulte `integracoes_logs` filtrando por `acao = 'nfse_scrape'`.
4. Confira o cartão de situação em `/integracoes/prefeituras`.

---

## 10. Limitações conhecidas

- **Captcha no portal nfse.gov.br.** Baixar o XML de cada nota exige hCaptcha. A coleta automática traz só a lista com os dados das notas. Quando o XML original for necessário, ele é baixado à mão (um captcha por nota). Automatizar com um serviço como o 2captcha (cerca de US$ 5/mês) não foi implementado.
- **O ADN não devolve notas emitidas.** A API oficial só traz as notas em que o CNPJ é tomador. É uma limitação da fonte, contornada pela coleta no portal.
- **O município precisa usar o Emissor Nacional.** O Rio aderiu em 01/01/2026. Em municípios que não migraram, as notas ficam só no portal municipal (integração específica ou upload manual).
- **Só certificado A1.** O A3 (token físico) não pode ser automatizado. O cliente precisa fornecer um A1 (`.pfx`) e a senha.
- **Rotinas sem agendamento.** Ver 4.2: atrasos, alertas, relatório mensal e recorrentes dependem do disparo manual em Configurações.
- **Conciliação sem tabela em produção.** A tabela `banco_movimentos` (migration 09) não existe no banco de produção (conferido em 12/10/2026), então a Conciliação não consegue gravar extratos. Na tela de Módulos, o cartão dela aparece sem contagem. Para corrigir, aplique `09_conciliacao_bancaria.sql`.

---

## 11. Deploy e infraestrutura

### 11.1 Ambientes

| Componente | Serviço | Endereço / referência |
|---|---|---|
| Site e rotas de API | Vercel | painel-contabil-jps.vercel.app |
| Banco, login e arquivos | Supabase | Projeto `mwmltqaanfxjkoztgcby` |
| Código | GitHub | joaojcnunes-debug/Painel-Contabil-JPS |
| Coleta de NFS-e | GitHub Actions | `nfse-scrape-daily.yml` |
| Edge Functions | Supabase | 11 funções, publicadas pelo CI |

### 11.2 Como uma mudança chega ao ar

1. **Branch e PR:** abra um branch e um PR no GitHub. A Vercel gera um deploy de prévia do branch.
2. **Merge na `main`:**
   - A Vercel compila e publica em produção, em cerca de 2 minutos.
   - Se mudou algo em `supabase/functions/`, o workflow `deploy-supabase-functions.yml` publica as Edge Functions.
3. **Banco:** as migrations são aplicadas à mão, pelo SQL Editor ou pelo MCP. Aplique **antes** do merge, se o código novo depender delas.

### 11.3 Variáveis e segredos

| Onde | Variáveis |
|---|---|
| Vercel (e `.env.local` em desenvolvimento) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CERT_SENHA_MASTER_KEY` |
| Secrets do GitHub Actions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CERT_SENHA_MASTER_KEY`, `SUPABASE_ACCESS_TOKEN` |
| Secrets das Edge Functions | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, `OPENAI_API_KEY` (gestao-ia), `PORTAL_URL`, `ALERTA_DIAS` |

Os valores nunca vão para o repositório.

---

## 12. Desenvolvimento local

```bash
npm install
cp .env.example .env.local      # preencher com os valores do Supabase
npm run dev                     # http://localhost:3003
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 3003 |
| `npm run build` / `npm start` | Compilação e servidor de produção |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Checagem de tipos |
| `npm run ecac:list` / `npm run ecac:sync` | Lista e sincroniza sessões do e-CAC (Playwright, no computador) |

### 12.1 Estrutura de pastas

| Pasta | Conteúdo |
|---|---|
| `app/(public)`, `app/(app)`, `app/(portal)` | Telas por área (seção 2) |
| `app/(hub)` | Tela de módulos em página cheia, sem o menu lateral |
| `app/api` | Rotas de API (seção 7) |
| `app/f/[token]` | Formulários públicos da Gestão |
| `components/<módulo>` | Componentes de cada módulo; `components/ui` tem os genéricos (Modal, Button, Field, ExportCsvButton) |
| `lib/hooks` | Consultas ao banco com TanStack Query (`useClientes`, `useSocios`, `useDistribuicoesLucros` etc.) |
| `lib/` | Regras de cálculo (`folha-pagamento.ts`, `pro-labore.ts`, `simples-nacional.ts`, `ferias.ts`, `decimo-terceiro.ts`, `distribuicao-lucros.ts`), CSV, OFX e conciliação |
| `lib/integracoes` | Registro e clientes dos serviços de governo |
| `lib/supabase` | Cliente do Supabase e tipos das tabelas (`types.ts`) |
| `supabase/` | `schema.sql`, migrations e Edge Functions |
| `scripts/` | `ecac/` (sincronização e-CAC) e `nfse-scrape/` (coleta de NFS-e) |
| `docs/` | Esta documentação e a versão 1.0 em HTML/PDF |

### 12.2 Como criar um módulo novo (padrão do projeto)

1. **Migration** em `supabase/migrations/NN_nome.sql`: tabela com chave de texto, `id_cliente` com FK, RLS no padrão da seção 6.2 e gatilho `fn_audit_trigger`.
2. **Tipo** em `lib/supabase/types.ts` e entrada em `Database.public.Tables`.
3. **Hook** em `lib/hooks/useX.ts` com `useQuery`.
4. **Tela** em `app/(app)/<rota>/page.tsx`, com bloqueio para quem não é da equipe, e componentes em `components/<módulo>/`.
5. **Menu:** item em `components/layout/Sidebar.tsx`, no grupo da área.
6. **Checagem:** `npx tsc --noEmit` e `npm run lint` antes do PR.

O módulo Distribuição de lucros (migration 35) é um exemplo recente e completo desse padrão.

---

*Documentação interna · Painel Contábil JPS · manutenção: Chabra TI*
