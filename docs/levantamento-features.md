# Levantamento: pasta `features/` × Clientizza (wacrm)

Data: 17/11/2026
Origem: `~/Documents/CRM whatsapp/features/` (19 pastas, 18 sistemas distintos)

## 1. O que são esses arquivos

Todas as pastas são **protótipos exportados do "Builder do Núcleo de I.A"** e seguem o mesmo molde:

| Item | Como é |
|---|---|
| Stack | Vite + React 18 + TypeScript, Tailwind via CDN, recharts, date-fns |
| Tamanho | ~800 a 2.000 linhas cada (protótipos de tela, não produto) |
| Dados | `src/nucleo.ts` grava tudo no **localStorage do navegador**. Não há banco nem login, e não existe separação por conta |
| I.A e integrações | Funcionam **só dentro do Builder**. Fora dele, `ia.*` e `conexoes.*` só mostram um aviso |
| Envio de WhatsApp | Nenhum envia de verdade. No máximo preparam rascunhos ou links `wa.me` |
| Docs | `LEIA-ME.md` (genérico) e `PRIMEIROS-AJUSTES.md` (3 "pedidos" de evolução por sistema) |

**Consequência:** nada disso entra "plugado" no Clientizza. O Clientizza é Next.js 16 + Supabase multi-tenant com RLS, i18n e WhatsApp Cloud API. Implantar uma feature significa **reescrever** seguindo os padrões do wacrm. Dá para aproveitar:

- **o modelo de dados** (`src/lib/tipos.ts`), que vira base para as migrations;
- **as regras puras** (`src/lib/*.ts`: réguas, cálculos de prioridade, segmentação), que portam quase direto;
- **o desenho das telas e os textos em PT-BR**, como referência de UX;
- **os "3 pedidos"** de cada `PRIMEIROS-AJUSTES.md`, que funcionam como backlog pronto.

`disparos-de-campanha-via-whatsapp 2/` é **cópia idêntica** de `disparos-de-campanha-via-whatsapp/`, só sem o `.DS_Store`. Pode ser apagada.

## 2. O que o Clientizza já tem hoje

Inbox com atribuição de conversa, presença da equipe, contatos (tags, campos personalizados, notas, export CSV), pipelines/negócios, broadcasts com templates Meta, automações (gatilhos `first_inbound_message`, `keyword_match` etc.; ações `add_tag`, `assign_conversation`, `create_deal`, `close_conversation`), flows (fluxos com nós e mídia), agente de I.A com base de conhecimento (RAG) e controle de uso, respostas rápidas, notificações, API pública, webhooks, multi-conta/convites e superadmin SaaS.

## 3. Avaliação feature a feature

Legenda de sobreposição: **Alta** = o Clientizza já faz o núcleo · **Média** = a infraestrutura serve, falta o domínio · **Baixa** = é outro produto.
Esforço: **P** ≈ 1–3 dias · **M** ≈ 1–2 semanas · **G** ≈ 3+ semanas.

### Grupo A: já cobertas pelo Clientizza (aproveitar só ideias)

| Feature | O que faz | Sobreposição | O que vale trazer | Esforço |
|---|---|---|---|---|
| **Multiatendimento com I.A** | Caixa de conversas, responsável, nota interna, roteiro | Alta (inbox + atribuição + agente) | Filas por departamento; filtros "tempo sem resposta / não lidas / sem dono"; transferir com observação interna | P–M |
| **Atendimento automático no WhatsApp** | Gera o prompt/roteiro do agente a partir do contexto da empresa | Alta (agente I.A + conhecimento + flows) | Assistente guiado para montar o prompt; **bancada de testes** (perguntas frequentes e casos de transferência humana aprovados antes de ativar) | P–M |
| **Disparos de campanha via WhatsApp** | Público por etiqueta/última compra, exclusões, rascunho | Alta (broadcasts) | **Públicos salvos** (filtros reutilizáveis); tela de exclusões/opt-out antes do envio; lotes por responsável | M |

### Grupo B: extensões naturais (usam contatos + mensagens + templates + automações)

| Feature | O que faz | Sobreposição | Falta no Clientizza | Esforço |
|---|---|---|---|---|
| **Reativação de clientes inativos** | Classifica clientes por tempo sem comprar e valor (RFV), campanha em "toques" com aprovação, importação CSV | Média | Tabela de **compras** por contato, cálculo de ciclo/faixas, campanha em sequência com aprovação, status `não incomodar`/`descansa até` | M |
| **Notificação automática de clientes** | Avisos de pedido, agendamento e cobrança com prévia | Média | Entidades "pedido/compromisso", agendador de envio por data, modelos de aviso ligados a templates Meta | M |
| **Agendamento inteligente** | Agenda, serviços, profissionais, lembretes, lista de espera | Baixa–Média | Módulo de agenda inteiro (serviços, profissionais, horários, conflitos); lembretes reutilizam templates. Google Agenda depois | G |
| **Cobrança automática com I.A** | Carteira de cobranças, régua de lembretes, fila do dia | Média | Tabela de cobranças/parcelas, régua (`lib/regua.ts` porta direto), pausa durante negociação. Asaas depois | M |
| **Coleta automática de avaliações** | Pós-atendimento → convite de review Google, fila de reclamações | Média | Gatilho "conversa fechada/negócio ganho" → template de avaliação; fila de reclamações. Boa parte cabe em automações | P–M |
| **Recuperação de carrinho/orçamento** | Orçamentos com validade, próximo retorno, motivo de perda | Média (deals) | Campos de orçamento no negócio (valor, validade, motivo ganho/perda) + cadência de follow-up | P–M |
| **Onboarding automático de clientes** | Checklist por modelo, portal do cliente, aprovações | Baixa–Média | Checklists por contato/negócio, modelos, prazos; o portal do cliente é um produto à parte | M–G |

### Grupo C: prospecção (atenção à política do WhatsApp)

| Feature | O que faz | Observação | Esforço |
|---|---|---|---|
| **Prospecção no Google Maps** | Lista de empresas locais, filtros, critérios salvos | Precisa de fonte externa (Apify/Places API, que é paga). Útil como **importador de contatos** | M |
| **SDR de I.A (prospecção ativa)** | Funil de abordagem, cadência, mensagens por segmento | Abordagem fria pela **WhatsApp Cloud API exige opt-in** e templates aprovados. Mensagem fria em massa arrisca bloqueio do número. Viável como cadência assistida (humano envia) | M |
| **123 Leads por 123 reais (Instagram)** | Planejamento de campanha e captura de leads do Instagram | Mais um plano de campanha + cadastro de leads; integração real com Instagram exige outra API da Meta | M |

### Grupo D: fora do núcleo de um CRM de WhatsApp

| Feature | Observação |
|---|---|
| **Dashboard de gestão com I.A** | Fluxo de caixa e contas a pagar/receber. Só o "painel de insights" sobre dados do CRM conversa com o produto |
| **Sistema financeiro com IA** | Lançamentos e categorias; é um ERP-lite e não combina com o CRM |
| **Sistema de lançamento com I.A** | Gestão de lançamento de infoproduto (peças, calendário, página) |
| **E-mail marketing com I.A** | Outro canal (Brevo/Resend). Só se o Clientizza for virar omnichannel |
| **Assistente de vendas com I.A** | Copiloto para calls ao vivo; é outro produto (áudio/tempo real) |

## 4. Recomendação de ordem

Critério: valor para o cliente do Clientizza × reaproveitamento do que já existe × risco.

1. **Reativação de clientes inativos.** É a de maior valor percebido ("dinheiro parado na base"), usa contatos e templates existentes e o protótipo é o mais completo (2.068 linhas, com importação CSV).
2. **Melhorias do Grupo A** (filas/filtros do inbox, bancada de testes do agente, públicos salvos). São baratas e melhoram o que já é vendido.
3. **Coleta de avaliações + recuperação de orçamentos.** São pequenas e boa parte vira automação nova.
4. **Notificações + Cobrança.** Compartilham a mesma base: entidade com data → régua → template.
5. **Agendamento.** É grande; vale fazer quando houver demanda de nicho (clínicas, salões).
6. Prospecção (Grupo C) só como **importador** + cadência assistida, nunca disparo frio automático.
7. Grupo D: não implantar no Clientizza.

## 5. Como cada implantação deve ser feita (padrão)

1. Migration nova em `supabase/migrations/` com `account_id` + RLS (padrão das migrations de account sharing).
2. Rotas em `src/app/(dashboard)/<feature>`, textos via `next-intl` (pt-BR).
3. Regras puras portadas de `features/<x>/src/lib/` com testes (Vitest; rodar com `TZ=UTC LC_ALL=en_US.UTF-8`).
4. Envio só por templates aprovados / janela de 24h, respeitando opt-out. Em dev: `WHATSAPP_TEMPLATES_DRY_RUN=true`.
5. Registrar em [`IMPLANTACOES.md`](../IMPLANTACOES.md).
