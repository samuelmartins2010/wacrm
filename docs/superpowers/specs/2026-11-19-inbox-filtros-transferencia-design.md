# Inbox: filtros de atendimento, notas internas e transferência: design

Data: 19/11/2026 · Status: **aprovada pelo Samuel em 19/11/2026** (decisões na seção 6; ajustes da 2ª rodada no mesmo dia)
Origem: levantamento [`docs/levantamento-features.md`](../../levantamento-features.md), item 2 da ordem (melhorias do Grupo A, "Multiatendimento com I.A").
Escopo desta spec: filtros "Minhas / Sem dono / Aguardando resposta", **notas internas** e **transferência com observação**. Filas por departamento ficam para uma spec própria (ver 2, não-objetivos).

## 1. Intenção

Quem atende no WhatsApp abre o Inbox várias vezes por dia com duas perguntas: **"quem está esperando resposta de uma pessoa, e há quanto tempo?"** e **"o que ninguém pegou ainda?"**. Hoje o Inbox não responde nenhuma das duas. Os filtros são "Todas / Não lidas / Abertas / Pendentes / Fechadas", mais etiqueta e empresa. "Não lida" só diz que ninguém **abriu** a conversa, não que alguém **respondeu**. Uma conversa lida e esquecida some do radar.

A outra dor é a passagem de bastão. Atribuir uma conversa a outra pessoa hoje só troca o nome no topo. Quem recebe ganha uma notificação "conversa atribuída", mas sem saber **por que** recebeu nem **o que já foi combinado** com o cliente. A equipe também não tem onde anotar algo sobre a conversa sem mandar para o cliente: as notas que existem ficam na ficha do contato, fora da linha do tempo.

O sucesso é medido no dia a dia:
- nenhum cliente fica esperando resposta de uma pessoa sem aparecer num filtro, mesmo se um robô respondeu;
- quem recebe uma transferência entende o caso pela observação, sem reler tudo;
- a equipe conversa sobre o caso dentro da conversa, sem risco de o cliente ver.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. Filtro **"Minhas"**: conversas não fechadas em que eu sou o responsável.
2. Filtro **"Sem dono"**: conversas não fechadas sem responsável, incluindo as que a I.A está atendendo (com selo "🤖 I.A atendendo").
2a. Selo **"🤖 Fluxo em andamento"** nas conversas com execução de fluxo ativa. Conversas com selo de I.A ou de fluxo continuam contando como aguardando.
3. Filtro **"Aguardando resposta"**: a última mensagem do cliente ainda não teve **resposta de um atendente humano**. Ordenado da espera mais antiga para a mais nova.
4. **Tempo de espera visível** em cada conversa da lista ("esperando há 47 min"), com cor fixa por faixa (15 min / 1 h).
5. **Contadores** nos filtros (ex.: "Sem dono 3", "Aguardando 7"), corretos mesmo em contas com mais de 1.000 conversas.
6. **Nota interna**: qualquer atendente escreve uma nota na conversa. Ela aparece na linha do tempo só para a equipe e **nunca** vai para o WhatsApp.
7. **Transferir com observação**: ao atribuir ou transferir, uma observação opcional. A transferência com observação é **uma nota interna + troca de responsável na mesma transação**, e a observação vai na notificação de quem recebe.
8. **Histórico de responsáveis** na conversa: "Ana transferiu para Bruno · 14:32", "Atribuída a Carla por Automação".

**Não-objetivos (agora)**
- **Filas por departamento** (Vendas, Suporte, Financeiro), roteamento por fila e equipes. Têm spec própria. Os dados desta spec não podem atrapalhar isso (ver 5.8).
- Tempo de espera em **horário comercial**. Aqui é tempo corrido.
- **SLA com alerta** (notificar quando passar de X minutos).
- Relatórios de tempo de primeira resposta por atendente.
- Paginação completa do Inbox (rolagem infinita). Os filtros novos são resolvidos no banco, mas a lista continua mostrando até 1.000 conversas por filtro.
- **Editar ou apagar** nota/observação depois de gravada.
- **Notificar** alguém por uma nota avulsa ou por @menção. Só a transferência notifica (como hoje) e agora leva a observação.
- Faixas de cor configuráveis por conta.

**Anti-objetivos (se acontecer, falhou mesmo "funcionando")**
- Uma nota ou observação ser **enviada ao cliente** no WhatsApp, por qualquer caminho (composer, API v1, automação, I.A, webhooks externos, export).
- Uma nota aparecer para outra conta (vazamento entre empresas).
- Um cliente esperando resposta humana **não aparecer** em "Aguardando" porque um robô respondeu ou porque a conta tem muitas conversas.
- O contador dizer um número e a lista mostrar outro.
- Trocar o responsável sem gravar o histórico, ou gravar a observação de uma transferência que não aconteceu.

## 3. Restrições

- **Stack do repo:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de codar, ver `AGENTS.md`), Supabase com RLS, `next-intl` (`messages/pt-BR.json` + `en.json`; `npm run i18n:check` reprova chave faltando).
- **Multi-tenant:** tudo tem `account_id`. RLS via `is_account_member(account_id, 'agent' | 'admin')`, padrão das migrations 017+. Hoje qualquer membro `agent`+ pode atualizar `conversations`. **Decisão:** qualquer atendente continua podendo transferir qualquer conversa.
- **Limite de 1.000 linhas:** `max_rows = 1000` no PostgREST (`supabase/config.toml`; padrão do Supabase cloud). A lista do Inbox (`conversation-list.tsx`) busca as conversas **sem paginação** e filtra no navegador.
- **Uma conversa por contato** por conta (`resolve-conversation.ts`).
- **Quem é humano no banco:** `messages.sender_type = 'agent'` é gravado pelo envio do Inbox e pela API v1 (os dois usam `src/lib/whatsapp/send-message.ts`, por `/api/whatsapp/send` e `/api/v1/messages`); `messages.sender_id` existe mas não é preenchido. I.A (`ai_generated = true`), automações, fluxos e Reativação gravam `sender_type = 'bot'`. Transmissões não gravam no inbox. `status` da mensagem ∈ `sending | sent | delivered | read | failed`.
- **Reações** não viram linha em `messages` (vão para `message_reactions`).
- **Tempo real:** `messages`, `conversations` e `notifications` estão na publicação `supabase_realtime`. O Inbox atualiza a lista por eventos e se corrige ao reconectar.
- **Notificação de atribuição:** trigger `notify_conversation_assigned` (migration 027) cria a notificação quando `assigned_agent_id` muda, e pula autoatribuição.
- **Gatilho de automação:** atribuir dispara `conversation_assigned` (D3, migration 055). Tem que continuar disparando.
- **Quem grava o responsável hoje (5 caminhos):** menu do Inbox (`message-thread.tsx`, `update` direto), ação de automação (RPC `automation_assign_conversation`, migration 055), atribuição em lote (`conversations_bulk_assign`, migration 056), entrega para humano do fluxo (`flows/engine.ts`) e transferência da I.A para o atendente configurado (`ai/auto-reply.ts`).
- **A I.A só responde conversa sem responsável** (`ai/auto-reply.ts`) e não grava mensagem quando entrega para humano (`bot_handoff_at`, `ai_handoff_summary`).
- **Testes:** Vitest (`TZ=UTC LC_ALL=en_US.UTF-8`) e pgTAP (`supabase test db`, também no CI).

## 4. Abordagens consideradas

Para os filtros:

| | Abordagem | Prós | Contras |
|---|---|---|---|
| A | Filtrar no navegador, como hoje | Mais barata | Em conta com mais de 1.000 conversas, perde as conversas antigas esperando resposta, que são as mais urgentes; para saber "a última humana foi antes da última do cliente" teria que buscar as mensagens de cada conversa |
| **B** | **Coluna `awaiting_since` mantida pelo banco + filtro na consulta + contadores por RPC** | Correto em qualquer tamanho de conta; contador e lista com a mesma regra; leve | Migration com trigger e backfill; a lista refaz a busca ao trocar de filtro |
| C | Paginar o Inbox inteiro | Resolve o limite de 1.000 para tudo | Refatoração grande; não é o pedido agora |

**Escolhida: B** (aprovada com a spec).

Para notas e transferência:

| | Abordagem | Prós | Contras |
|---|---|---|---|
| A | Usar `contact_notes` (notas da ficha) | Zero tabela nova | Fora da linha do tempo; sem quem→quem; notificação sem o texto |
| B | Nota como mensagem em `messages` com um tipo "interna" | Aparece naturalmente no histórico | Todo caminho que lê `messages` (I.A, automações, API v1, webhooks externos, export) teria que filtrar: risco direto de a nota ir para o cliente |
| **C** | **Tabela própria de eventos da conversa + funções no banco** | A nota nunca entra no caminho de envio; histórico quem→quem; transferência atômica; serve depois para filas | Tabela, funções e mesclagem com a linha do tempo na tela |

**Escolhida: C** (aprovada com a spec).

## 5. Design

### 5.1 "Aguardando resposta" (decisão 1)

- **Definição:** a conversa está aguardando desde a **primeira mensagem do cliente que ainda não teve resposta humana**. Exemplo: o cliente manda mensagens às 10:00, 10:02 e 10:05; a I.A responde às 10:01; a espera conta desde 10:00.
- **Só zera** com uma mensagem `sender_type = 'agent'`, **não** enviada pela API v1 (`sent_via_api = false`) e que **não falhou**. Resposta da I.A, de automação, de fluxo, da API v1, toque da Reativação e transmissão **não** zeram.
- **Consequência que precisa ficar clara na tela:** conversas que a I.A ou um fluxo estão atendendo também contam como "Aguardando". Elas levam o selo "🤖 I.A atendendo" ou "🤖 Fluxo em andamento" (5.2), para o atendente saber que um robô está respondendo, mas que nenhuma pessoa respondeu.
- **API v1 conta como robô** (decisão do Samuel, 2ª rodada): nova coluna `messages.sent_via_api BOOLEAN NOT NULL DEFAULT false`, gravada `true` só pela rota `/api/v1/messages`. O `sender_type` continua `agent` (o balão e a API pública não mudam). Mensagens antigas ficam `false`, ou seja, contam como humanas como sempre contaram.
- **Mensagem humana que falha** (status `failed`, vem depois pelo webhook): a espera volta, contando da primeira mensagem do cliente depois da última resposta humana que **não** falhou.
- **Nota interna e transferência não zeram** a espera (não são mensagem para o cliente).
- Conversas **fechadas** não aparecem em "Aguardando", mesmo com `awaiting_since` preenchido. Se o cliente escrever numa conversa fechada, vale o comportamento atual do webhook para reabrir; a espera conta da mensagem nova.
- **Cores** (decisão 2, fixas): até 15 min neutro · 15 min a 1 h amarelo · mais de 1 h vermelho. Texto relativo ("há 3 min", "há 2 h", "há 1 dia"), atualizado a cada minuto sem refazer a busca.

### 5.2 Filtros, contadores e selo da I.A

Barra de filtros do Inbox:

```
[ Todas ] [ Minhas 4 ] [ Sem dono 3 ] [ Aguardando 7 ] [ Não lidas 12 ]   ▾ Status  ▾ Etiqueta  ▾ Empresa
```

- **Minhas** (decisão 3): `assigned_agent_id = eu`, não fechadas.
- **Sem dono** (decisão 6): `assigned_agent_id is null`, não fechadas. Inclui as conversas que a I.A está atendendo.
- **Aguardando:** `awaiting_since is not null`, não fechadas, ordenado por `awaiting_since` crescente.
- **Não lidas:** como hoje.
- **Status**, **Etiqueta** e **Empresa** continuam como hoje e combinam com os filtros acima (E lógico).
- Os filtros rápidos são **aplicados na consulta ao banco**. A mesma regra existe como função pura no front (`matchesInboxFilter`), usada para decidir se um evento de tempo real entra ou sai da lista aberta. As duas versões têm testes com os mesmos casos.
- **Contadores:** RPC `inbox_filter_counts()` devolve `{mine, unassigned, awaiting, unread}` da conta, com a mesma regra. Atualiza ao abrir, ao reconectar e, com debounce, a cada evento de `conversations`.
- **Selo "🤖 I.A atendendo"** na linha da conversa quando: a I.A de respostas automáticas da conta está ligada, não há automação de resposta ativa (`new_message_received`/`keyword_match`), a conversa não tem responsável, não tem `bot_handoff_at` e não tem `ai_autoreply_disabled`. Mesma regra que o `auto-reply.ts` usa para decidir responder, isolada numa função pura com teste.
- **Selo "🤖 Fluxo em andamento"** quando a conversa tem `flow_run` com `status = 'active'` que **ainda não venceu** o `on_timeout_hours` do fluxo (mesma regra `isFlowRunStale` do F8/D11). Se as duas condições valerem, mostra o de fluxo (a I.A não fala por cima de um fluxo).
- O filtro escolhido fica salvo por pessoa no navegador (se falhar, abre em "Todas").

### 5.3 Nota interna (decisão 4)

O composer ganha duas abas:

```
┌───────────────────────────────────────────────────────┐
│ [ Responder ]  [ Nota interna ]                        │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Cliente pediu para ligar depois das 18h.          │ │  ← fundo amarelo claro
│ └───────────────────────────────────────────────────┘ │
│ 🔒 Só a equipe vê. Não é enviada ao cliente.  [Salvar nota] │
└───────────────────────────────────────────────────────┘
```

- Na aba "Nota interna" o botão é **"Salvar nota"**, não "Enviar"; anexos, modelos, respostas rápidas e emojis de reação ficam escondidos. A aba volta para "Responder" depois de salvar (*minha decisão*, para evitar que a próxima mensagem vire nota sem querer).
- A nota é gravada pela função `add_conversation_note` (5.6). Esse caminho **não passa** por nenhuma rota de envio.
- Texto puro, até 2.000 caracteres (*minha decisão*), sem formatação.
- **Na linha do tempo:** cartão discreto, alinhado ao centro, que não parece balão de mensagem: `🔒 Nota interna · Ana · 14:32` e o texto. Mesmo componente para nota avulsa e para observação de transferência.
- Qualquer membro `agent`+ escreve nota. Ninguém edita ou apaga.
- Nota não muda `last_message_at`, `last_message_text`, `unread_count` nem `awaiting_since`, e não dispara automação, fluxo, I.A nem webhook externo.

### 5.4 Transferir com observação (decisões 4 e 5)

No menu de responsável do topo da conversa, escolher um membro abre:

```
┌ Transferir conversa ───────────────────────┐
│ Para:  ( Bruno Lima            ▾ )          │
│ Observação interna (opcional)               │
│ ┌─────────────────────────────────────────┐ │
│ │ Cliente quer 2ª via do boleto de março; │ │
│ │ já confirmei o CPF.                     │ │
│ └─────────────────────────────────────────┘ │
│ 🔒 Só a equipe vê. Não é enviada ao cliente.│
│                       [Cancelar] [Transferir]│
└─────────────────────────────────────────────┘
```

- **Transferir com observação = nota interna + troca de responsável, na mesma transação** (`transfer_conversation`, 5.6). Ou acontece tudo, ou nada.
- Na linha do tempo aparecem juntos: a linha de sistema `🔁 Ana transferiu para Bruno · 14:32` e, logo abaixo, o cartão da nota com a observação.
- Sem observação, só a linha de sistema. Primeira atribuição: `Atribuída a Bruno por Ana`. Remover responsável: `Ana removeu o responsável`.
- **Notificação** de quem recebe: o corpo passa a incluir o início da observação ("Ana transferiu Maria Souza para você: Cliente quer 2ª via do boleto…").
- **Qualquer atendente** transfere qualquer conversa, inclusive tirar de outra pessoa (decisão 5).
- Os outros 4 caminhos (automação, lote, fluxo, I.A) também gravam a linha de sistema, com autor "Automação", "Fluxo" ou "I.A" (e o usuário, no lote). Na entrega da I.A, o resumo que ela já gera (`ai_handoff_summary`) vira a nota da transferência.
- Nenhuma tela grava `assigned_agent_id` direto. Tudo passa pelas funções de 5.6.

### 5.5 Linha do tempo da conversa

- `message-thread.tsx` passa a mesclar mensagens e `conversation_events` por `created_at`.
- Eventos chegam em tempo real (tabela na publicação `supabase_realtime`).
- Carrega os eventos do mesmo intervalo de tempo das mensagens já carregadas (mesma janela/paginação da thread).

### 5.6 Dados (migrations `057_inbox_awaiting.sql` e `058_conversation_events.sql`)

**`messages.sent_via_api BOOLEAN NOT NULL DEFAULT false`** (057): `true` só para mensagens da API v1.

**`conversations.awaiting_since TIMESTAMPTZ NULL`**
- Trigger `AFTER INSERT ON messages`:
  - `sender_type = 'customer'` → `awaiting_since = coalesce(awaiting_since, NEW.created_at)`;
  - `sender_type = 'agent'`, `sent_via_api = false` e `status <> 'failed'` → `awaiting_since = null`;
  - `bot` ou `agent` com `sent_via_api = true` → não mexe.
- Trigger `AFTER UPDATE OF status ON messages` quando uma mensagem `agent` humana passa para `failed`: recalcula `awaiting_since` da conversa = primeira mensagem `customer` depois da última resposta humana não falhada (ou `null` se não houver).
- **Backfill** na migration com a mesma regra de recálculo.
- Índices parciais: `(account_id, awaiting_since) WHERE awaiting_since IS NOT NULL AND status <> 'closed'`; `(account_id, assigned_agent_id) WHERE status <> 'closed'`.

**`conversation_events`** (nova)
- `id UUID PK`, `account_id UUID NOT NULL`, `conversation_id UUID NOT NULL REFERENCES conversations ON DELETE CASCADE`,
- `type TEXT NOT NULL CHECK (type IN ('note','assigned','transferred','unassigned'))`,
- `actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user','automation','flow','ai'))`, `actor_user_id UUID NULL`,
- `from_user_id UUID NULL`, `to_user_id UUID NULL` (só nas trocas de responsável),
- `body TEXT NULL` (só em `note`; `CHECK (type <> 'note' OR char_length(body) BETWEEN 1 AND 2000)`; `CHECK (type = 'note' OR body IS NULL)`),
- `note_id UUID NULL REFERENCES conversation_events(id)` (na troca de responsável, aponta para a nota da observação),
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Índice `(conversation_id, created_at)`.
- RLS: SELECT `is_account_member(account_id)`. **Sem** INSERT/UPDATE/DELETE para `authenticated`; só pelas funções abaixo e pelo service role. Eventos imutáveis.
- Na publicação `supabase_realtime`.

**Funções** (todas `SECURITY DEFINER`, `search_path` fixo, `account_id` sempre lido da conversa, nunca do cliente):
- `add_conversation_note(p_conversation_id, p_body) RETURNS conversation_events`: confere membro `agent`+ da conta; grava `note`.
- `transfer_conversation(p_conversation_id, p_to_user_id NULL, p_note NULL) RETURNS conversation_events`: confere quem chama (`agent`+) e que o destino é membro da mesma conta; trava a conversa (`FOR UPDATE`); se houver observação, grava a `note`; grava `assigned | transferred | unassigned` com `note_id`; atualiza `assigned_agent_id`. A notificação continua vindo do trigger da 027, que passa a ler a observação pelo `note_id` do evento mais recente para montar o corpo.
- `record_assignment_event(p_conversation_id, p_to_user_id, p_actor_kind, p_actor_user_id NULL, p_note NULL)`: interna, `REVOKE` de `authenticated`, para os caminhos do servidor (fluxo, I.A). `automation_assign_conversation` e `conversations_bulk_assign` passam a gravar o evento dentro de si.
- `inbox_filter_counts() RETURNS TABLE(mine int, unassigned int, awaiting int, unread int)`, `SECURITY INVOKER` (RLS de `conversations` já limita à conta).

### 5.7 Código (onde fica)

- Regras puras em `src/lib/inbox/filters.ts` (`matchesInboxFilter`, faixa de cor, texto relativo) e `src/lib/inbox/badges.ts` (quando a I.A atende, reaproveitada por `auto-reply.ts`; qual selo mostrar). Com testes.
- `src/lib/whatsapp/send-message.ts` ganha o parâmetro `sentViaApi` (padrão `false`); só `src/app/api/v1/messages/route.ts` passa `true`.
- `conversation-list.tsx`: filtros, contadores, ordenação de "Aguardando", indicador de espera e selo por linha.
- `message-composer.tsx`: abas "Responder / Nota interna".
- `src/components/inbox/transfer-dialog.tsx` (novo) e `src/components/inbox/conversation-event.tsx` (novo: linha de sistema + cartão de nota).
- `message-thread.tsx`: troca o `update` direto pela RPC `transfer_conversation`, mantém `pingAutomationEvents()` depois do sucesso (D3) e mescla eventos na linha do tempo.
- `flows/engine.ts` e `ai/auto-reply.ts`: chamam `record_assignment_event` (service role) junto da troca de responsável.
- Textos em `messages/pt-BR.json` + `en.json`.
- Registrar em `IMPLANTACOES.md` ao concluir.

### 5.8 Compatibilidade com filas por departamento (próxima spec)

- `conversation_events.type` tem CHECK extensível; a fila acrescenta `team_changed` e colunas `from_team_id` / `to_team_id`, sem mudar o que existe.
- O padrão "filtro no banco + contador por RPC" é o mesmo que a fila vai usar.

### 5.9 Testes

- **pgTAP:** `awaiting_since` liga na 1ª mensagem do cliente e não muda na 2ª; **não** zera com `bot` nem com `agent` da API v1; zera com `agent` humano; volta quando a `agent` falha; backfill. `add_conversation_note` grava e não mexe em `last_message_*`, `unread_count`, `awaiting_since`. `transfer_conversation` com observação grava nota + evento + troca juntos; destino de outra conta é recusado e **nada** é gravado; sem observação grava só o evento. Membro de outra conta não lê eventos; `authenticated` não faz INSERT direto; `record_assignment_event` não pode ser chamada por `authenticated`. `inbox_filter_counts` bate com as consultas dos filtros.
- **Vitest:** `matchesInboxFilter` com os mesmos casos do SQL; cores nos limites (14:59, 15:00, 59:59, 1:00:00); texto relativo; selos da I.A e do fluxo; a rota `/api/v1/messages` grava `sent_via_api = true` e a do Inbox não.
- **Ponta a ponta local** (proxy fake da Meta): cliente escreve → "Aguardando" e "Sem dono" com contador e selo da I.A ligada; I.A responde → continua em "Aguardando"; atendente responde → sai; nota interna aparece só no Inbox e nada sai para a Meta; transferir com observação → linha + nota, notificação com o texto, automação `conversation_assigned` dispara.

## 6. Decidido pelo Samuel (19/11/2026)

1. **Só resposta de atendente humano zera "Aguardando".** Resposta de robô (I.A, automação, fluxo) não zera. Conversas da I.A aparecem com o selo "🤖 I.A atendendo" e continuam contando como aguardando.
2. **Cores fixas:** 15 min / 1 h.
3. **"Minhas" entra.**
4. **Nota interna avulsa entra agora**, com a mesma tabela e exibição da observação da transferência. A transferência com observação é uma nota interna + troca de responsável na mesma transação.
5. **Qualquer atendente pode transferir.**
6. **"Sem dono" mostra as conversas da I.A, com o selo.**

Ajustes da 2ª rodada (19/11/2026):
7. **Selo "🤖 Fluxo em andamento"** para conversa com fluxo ativo; continua contando como aguardando.
8. **Mensagem da API v1 conta como robô**: não zera a espera.
9. Aprovadas as decisões técnicas: nota de até 2.000 caracteres; nota avulsa não notifica; transferir para o mesmo responsável não gera evento de troca nem notificação (com observação, grava só a nota).

## 7. Minhas decisões (para conferir na leitura)

- A aba do composer volta para "Responder" depois de salvar uma nota (5.3).
- Mensagem humana que falha devolve a espera (5.1).
- API v1 marcada por coluna `sent_via_api`, sem mudar `sender_type` (5.1).
- Quando I.A e fluxo valem ao mesmo tempo, aparece o selo de fluxo (5.2).

## 8. Deixado para quem constrói

- Visual da linha de sistema, do cartão de nota e do diálogo, seguindo o design system atual.
- Debounce dos contadores e chave do filtro salvo no navegador.
- Como a thread pagina os eventos junto das mensagens.
- Reabrir conversa fechada quando o cliente escreve: manter o atual.
