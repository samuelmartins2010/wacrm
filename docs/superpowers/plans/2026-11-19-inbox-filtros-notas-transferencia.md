# Inbox: filtros, notas internas e transferência: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inbox com filtros "Minhas / Sem dono / Aguardando" resolvidos no banco, contadores, selos "🤖 I.A atendendo" / "🤖 Fluxo em andamento", notas internas e transferência com observação atômica.

**Architecture:** O banco mantém `conversations.awaiting_since` por trigger em `messages` (só resposta humana zera) e guarda notas e trocas de responsável em `conversation_events`, gravados só por funções `SECURITY DEFINER`. O front aplica os filtros na consulta, usa uma RPC para os contadores e repete a regra numa função pura para os eventos de tempo real. A linha do tempo da conversa mescla mensagens e eventos.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de codar), Supabase (Postgres 17, RLS, Realtime), next-intl, Vitest, pgTAP.

**Spec:** [`docs/superpowers/specs/2026-11-19-inbox-filtros-transferencia-design.md`](../specs/2026-11-19-inbox-filtros-transferencia-design.md)

## Global Constraints

- Branch `feat/inbox-filtros-notas` a partir do `main` atualizado. Merge/push só quando o Samuel pedir.
- Tudo com `account_id`; RLS via `is_account_member(account_id, ...)`; `account_id` das funções sempre lido da conversa, nunca do parâmetro.
- Humano = `messages.sender_type = 'agent'` com `sent_via_api = false` e `status <> 'failed'`. `bot` e API v1 nunca zeram a espera.
- Cores: até 15 min neutro · 15 min a 1 h amarelo · mais de 1 h vermelho (limites: `< 15 min` neutro, `>= 15 min e < 60 min` amarelo, `>= 60 min` vermelho).
- Nota: texto puro, 1 a 2.000 caracteres (após `btrim`), imutável.
- `conversation_events.type` ∈ `note | assigned | transferred | unassigned`; `actor_kind` ∈ `user | automation | flow | ai`.
- Nenhuma tela grava `assigned_agent_id` direto.
- Textos novos em `messages/pt-BR.json` **e** `messages/en.json`; `npm run i18n:check` tem que passar.
- Testes: `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run`; banco: `npx supabase test db` (Supabase local rodando, migrations aplicadas com `npx supabase migration up`).
- Cada commit: `git add` explícito dos arquivos da tarefa; mensagem termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Registrar a implantação em `IMPLANTACOES.md` (tarefa 9).

**Migrations:** **`057_inbox_awaiting.sql`** (espera + contadores) e **`058_conversation_events.sql`** (notas + transferências), separadas para cada uma ser revisada e testada sozinha (a spec foi ajustada para isso).

## Review Focus

1. **Resposta humana que já nasce `failed`** (erro imediato da Meta grava a linha com `status='failed'`): não pode zerar a espera. Teste na tarefa 1.
2. **Nota só com espaços / quebras de linha**: tem que ser recusada pelo banco, não virar um cartão vazio. Teste na tarefa 2.
3. **Transferir para quem já é o responsável**: não pode gerar evento nem notificação repetidos; se houver observação, grava só a nota. Teste na tarefa 2.
4. **Relógio do navegador atrasado** (`awaiting_since` no futuro em relação ao cliente): o texto mostra "agora" e a cor é neutra, nunca "há -2 min". Teste na tarefa 3.
5. **Conversa que sai do filtro por evento de tempo real** (atendente responde em outra aba e a conversa estava em "Aguardando"): tem que sumir da lista aberta e o contador tem que cair. Teste na tarefa 3 (`matchesInboxFilter` com a linha atualizada).

---

### Task 1: Espera no banco (`awaiting_since`) e contadores

**Files:**
- Create: `supabase/migrations/057_inbox_awaiting.sql`
- Create: `supabase/tests/inbox_awaiting.test.sql`
- Modify: `src/types/index.ts` (interface `Conversation`: `awaiting_since?: string | null`; interface `Message`: `sent_via_api?: boolean`)
- Modify: `src/lib/whatsapp/send-message.ts` (`SendMessageParams.sentViaApi?: boolean`, gravado em `sent_via_api`), `src/app/api/v1/messages/route.ts` (passa `sentViaApi: true`)
- Test: `src/lib/whatsapp/send-message.test.ts` (criar se não existir) ou o teste existente da rota v1

**Interfaces:**
- Produces: coluna `messages.sent_via_api BOOLEAN NOT NULL DEFAULT false`; coluna `conversations.awaiting_since TIMESTAMPTZ NULL`; função `recompute_awaiting_since(p_conversation_id UUID) RETURNS TIMESTAMPTZ` (interna, `REVOKE` de `PUBLIC, anon, authenticated`); RPC `inbox_filter_counts() RETURNS TABLE(mine INT, unassigned INT, awaiting INT, unread INT)` (`SECURITY INVOKER`, `GRANT` para `authenticated`).

- [ ] **Step 1: Escrever o teste pgTAP** (`inbox_awaiting.test.sql`, fixtures no estilo de `conversation_bot_handoff.test.sql`: usuário em `auth.users` → conta pelo `profiles`; contato; conversa `open`). Asserts, com `plan(12)`:
  - `awaiting_since` é `null` numa conversa nova;
  - mensagem `customer` às `t0` → `awaiting_since = t0`;
  - segunda `customer` às `t0+2min` → continua `t0`;
  - mensagem `bot` (I.A, `ai_generated=true`) → continua `t0`;
  - mensagem `agent` com `sent_via_api=true` → continua `t0`;
  - mensagem `agent` `status='sent'` → `null`;
  - nova `customer` às `t1` → `t1`;
  - mensagem `agent` inserida já com `status='failed'` → continua `t1` (Review Focus 1);
  - `agent` `sent` às `t2` → `null`; depois `update messages set status='failed'` nela → volta para `t1`;
  - `recompute_awaiting_since` dá o mesmo valor que o trigger num cenário misto;
  - `inbox_filter_counts()` agindo como o dono (`pg_temp.act_as`, igual a `reactivation_campaign_rls.test.sql`) devolve `awaiting = 1`, `unassigned = 1`, `mine = 0`;
  - conversa `closed` com `awaiting_since` preenchido **não** conta em `awaiting` nem em `unassigned`.
- [ ] **Step 2: Rodar e ver falhar**
  Run: `npx supabase test db` · Expected: FAIL em `inbox_awaiting.test.sql` (coluna não existe).
- [ ] **Step 3: Escrever `057_inbox_awaiting.sql`**
  - `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS awaiting_since TIMESTAMPTZ`.
  - `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_via_api BOOLEAN NOT NULL DEFAULT false`.
  - "Resposta humana" = `sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed'`.
  - `recompute_awaiting_since(p_conversation_id)`: `min(created_at)` das mensagens `customer` com `created_at >` a última resposta humana (ou de todas as `customer`, se não houver); grava e devolve.
  - Trigger `messages_awaiting_after_insert` (`AFTER INSERT ON messages FOR EACH ROW`): `customer` → `coalesce(awaiting_since, NEW.created_at)`; resposta humana → `null`; resto → nada.
  - Trigger `messages_awaiting_after_status` (`AFTER UPDATE OF status ON messages FOR EACH ROW WHEN (NEW.sender_type = 'agent' AND NOT NEW.sent_via_api AND NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed')`) → `recompute_awaiting_since(NEW.conversation_id)`.
  - Backfill: `update conversations set awaiting_since = recompute...` em todas (ou `UPDATE ... FROM` equivalente em SQL puro).
  - Índices: `idx_conversations_awaiting ON conversations(account_id, awaiting_since) WHERE awaiting_since IS NOT NULL AND status <> 'closed'`; `idx_conversations_assignee_open ON conversations(account_id, assigned_agent_id) WHERE status <> 'closed'`.
  - `inbox_filter_counts()`: contagens sobre `conversations` com `status <> 'closed'` para `mine` (`assigned_agent_id = auth.uid()`), `unassigned` (`assigned_agent_id IS NULL`), `awaiting` (`awaiting_since IS NOT NULL`); `unread` = `unread_count > 0` (sem filtro de status, igual ao filtro "Não lidas" de hoje).
- [ ] **Step 4: Aplicar e testar**
  Run: `npx supabase migration up && npx supabase test db` · Expected: PASS em todos os arquivos (os 58 asserts antigos + os novos).
- [ ] **Step 4b: Teste da API v1 (falha primeiro):** `sendMessageToConversation(db, accountId, { ..., sentViaApi: true })` insere em `messages` com `sent_via_api: true`; sem o parâmetro, `false`. Rodar e ver falhar; implementar o parâmetro em `send-message.ts` e passar `sentViaApi: true` em `/api/v1/messages/route.ts`; rodar e ver passar.
- [ ] **Step 5: Commit** `feat(inbox): espera por resposta humana no banco e contadores dos filtros`

### Task 2: Notas e transferências no banco (`conversation_events`)

**Files:**
- Create: `supabase/migrations/058_conversation_events.sql`
- Create: `supabase/tests/conversation_events.test.sql`
- Modify: `src/types/index.ts` (novo tipo `ConversationEvent`)

**Interfaces:**
- Consumes: nada da tarefa 1.
- Produces:
  - tabela `conversation_events` exatamente como na spec 5.6 (com `CHECK (type <> 'note' OR char_length(btrim(body)) BETWEEN 1 AND 2000)` e `CHECK (type = 'note' OR body IS NULL)`), índice `(conversation_id, created_at)`, na publicação `supabase_realtime`.
  - `add_conversation_note(p_conversation_id UUID, p_body TEXT) RETURNS conversation_events`
  - `transfer_conversation(p_conversation_id UUID, p_to_user_id UUID, p_note TEXT DEFAULT NULL) RETURNS conversation_events` (devolve o evento de troca; quando só a nota foi gravada, devolve a nota)
  - `record_assignment_event(p_conversation_id UUID, p_to_user_id UUID, p_actor_kind TEXT, p_actor_user_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL) RETURNS conversation_events` (só `service_role`)
  - TS: `export interface ConversationEvent { id: string; account_id: string; conversation_id: string; type: 'note' | 'assigned' | 'transferred' | 'unassigned'; actor_kind: 'user' | 'automation' | 'flow' | 'ai'; actor_user_id: string | null; from_user_id: string | null; to_user_id: string | null; body: string | null; note_id: string | null; created_at: string }`

- [ ] **Step 1: Escrever o teste pgTAP** (`conversation_events.test.sql`; duas contas A e B, dois agentes na conta A via `account_invitations`/RPC usada nos testes existentes, ou dois usuários com a conta própria de cada um para o caso "outra conta"). Asserts:
  - como agente de A: `add_conversation_note` grava `type='note'`, `actor_kind='user'`, `actor_user_id = uid`;
  - a nota não muda `last_message_at`, `last_message_text`, `unread_count`, `awaiting_since`;
  - nota `'   \n  '` → `throws_ok` (Review Focus 2); nota com 2.001 caracteres → `throws_ok`;
  - `transfer_conversation(conv, agente2, 'obs')` → 1 `note` + 1 evento (`assigned` sem responsável anterior, `transferred` com) com `note_id` apontando para a nota e `assigned_agent_id = agente2`;
  - a notificação criada para o agente2 tem `body` contendo `'obs'`;
  - `transfer_conversation(conv, agente2, null)` de novo (já é o responsável) → nenhum evento novo, nenhuma notificação nova (Review Focus 3); com observação → só 1 `note` nova;
  - `transfer_conversation(conv, usuario_da_conta_B)` → `throws_ok` e **nada** gravado (conta de eventos e `assigned_agent_id` iguais aos de antes);
  - `transfer_conversation(conv, null)` → `unassigned`, `assigned_agent_id is null`;
  - usuário da conta B: `select` em `conversation_events` de A → vazio; `add_conversation_note` numa conversa de A → `throws_ok`;
  - `authenticated` fazendo `insert into conversation_events` direto → `throws_ok '42501'`;
  - `authenticated` chamando `record_assignment_event` → `throws_ok '42501'`;
  - `automation_assign_conversation(...)` grava evento `actor_kind='automation'`; `conversations_bulk_assign(...)` grava um evento por conversa com `actor_kind='user'`.
- [ ] **Step 2: Rodar e ver falhar** · Run: `npx supabase test db` · Expected: FAIL (tabela/funções não existem).
- [ ] **Step 3: Escrever `058_conversation_events.sql`**
  - Tabela, CHECKs, índice, RLS (`SELECT` para `is_account_member(account_id)`; nenhuma policy de escrita), `ALTER PUBLICATION supabase_realtime ADD TABLE conversation_events` no mesmo `DO $$ IF NOT EXISTS` das migrations 001/027.
  - Função interna `_assign_with_event(p_conversation_id, p_to_user_id, p_actor_kind, p_actor_user_id, p_note)`: `SELECT ... FOR UPDATE` da conversa; confere destino membro da mesma conta (se não nulo); se `p_note` não nulo grava a `note`; se o destino é igual ao atual, para aí; senão grava `assigned`/`transferred`/`unassigned` com `from_user_id`, `to_user_id`, `note_id`, e faz `UPDATE conversations SET assigned_agent_id = p_to_user_id, updated_at = now()`.
  - `transfer_conversation`: confere `is_account_member(conta, 'agent')` de `auth.uid()` e chama `_assign_with_event(..., 'user', auth.uid(), p_note)`.
  - `add_conversation_note`: confere membro `agent`+ e grava a `note`.
  - `record_assignment_event`: chama `_assign_with_event`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role`.
  - `CREATE OR REPLACE automation_assign_conversation` (mesma assinatura da 055): para cada conversa do contato, `_assign_with_event(id, p_agent_id, 'automation', null, null)` dentro do `set_config('app.automation_depth', ...)` existente; devolve o número de conversas.
  - `CREATE OR REPLACE conversations_bulk_assign` (mesma assinatura da 056): para cada id, `_assign_with_event(id, p_agent_id, 'user', auth.uid(), null)`, mantendo o `app.automation_events = 'off'`.
  - `CREATE OR REPLACE notify_conversation_assigned` (027): depois de montar o texto atual, busca o evento mais recente da conversa com `note_id`, criado na mesma transação (`created_at = now()`); se houver, acrescenta `': ' || left(nota, 140)` ao `body`. O resto da função fica igual (incluindo pular autoatribuição e o `EXCEPTION`).
- [ ] **Step 4: Aplicar e testar** · Run: `npx supabase migration up && npx supabase test db` · Expected: PASS.
- [ ] **Step 5: Commit** `feat(inbox): notas internas e transferência atômica no banco`

### Task 3: Regras puras dos filtros

**Files:**
- Create: `src/lib/inbox/filters.ts`
- Create: `src/lib/inbox/filters.test.ts`

**Interfaces:**
- Consumes: `Conversation` com `awaiting_since` (tarefa 1).
- Produces:
  - `export type InboxQuickFilter = 'all' | 'mine' | 'unassigned' | 'awaiting' | 'unread'`
  - `export function matchesInboxFilter(c: Pick<Conversation, 'status' | 'assigned_agent_id' | 'awaiting_since' | 'unread_count'>, filter: InboxQuickFilter, userId: string): boolean`
  - `export function waitBand(awaitingSince: string, now: Date): 'neutral' | 'warning' | 'danger'`
  - `export function formatWait(awaitingSince: string, now: Date, t: (key: string, values?: Record<string, number>) => string): string` (chaves `Inbox.wait.now`, `Inbox.wait.minutes`, `Inbox.wait.hours`, `Inbox.wait.days`)
  - `export function compareAwaiting(a: Conversation, b: Conversation): number` (mais antigo primeiro; `null` por último)

- [ ] **Step 1: Escrever os testes** (`filters.test.ts`), com os mesmos casos do SQL da tarefa 1:
  - `mine`: responsável = eu e `open` → true; `closed` → false; outro responsável → false;
  - `unassigned`: sem responsável `pending` → true; `closed` → false;
  - `awaiting`: `awaiting_since` preenchido e `open` → true; `null` → false; `closed` → false;
  - `unread`: `unread_count 2` mesmo `closed` → true;
  - Review Focus 5: a mesma conversa com `awaiting_since` mudando de valor para `null` passa de true para false em `awaiting`;
  - `waitBand`: 14:59 → `neutral`; 15:00 → `warning`; 59:59 → `warning`; 60:00 → `danger`;
  - Review Focus 4: `awaitingSince` 2 min no futuro → `waitBand` `neutral` e `formatWait` usa `Inbox.wait.now`;
  - `formatWait`: 3 min → `minutes {n:3}`; 2 h 10 min → `hours {n:2}`; 26 h → `days {n:1}`;
  - `compareAwaiting` ordena `[10:05, null, 09:00]` como `[09:00, 10:05, null]`.
- [ ] **Step 2: Rodar e ver falhar** · Run: `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/inbox/filters.test.ts` · Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implementar `filters.ts`** com as assinaturas acima. `formatWait`: `< 1 min` (ou negativo) → `now`; `< 60 min` → `minutes`; `< 24 h` → `hours` (arredonda para baixo); senão `days`.
- [ ] **Step 4: Rodar e ver passar** · mesmo comando · Expected: PASS.
- [ ] **Step 5: Commit** `feat(inbox): regras puras dos filtros e do tempo de espera`

### Task 4: Selos "🤖 I.A atendendo" e "🤖 Fluxo em andamento"

**Files:**
- Create: `src/lib/inbox/badges.ts`, `src/lib/inbox/badges.test.ts`
- Modify: `src/lib/ai/auto-reply.ts:60-80` (usar a função nova no lugar das checagens soltas)

**Interfaces:**
- Produces:
  - `export function aiHandlesConversation(args: { aiActive: boolean; autoReplyEnabled: boolean; autoRespondersActive: boolean; conversation: Pick<Conversation, 'assigned_agent_id' | 'ai_autoreply_disabled' | 'bot_handoff_at'> }): boolean`
  - `export function activeFlowConversationIds(runs: { conversation_id: string | null; last_advanced_at: string; fallback_policy: unknown }[], now: Date): Set<string>` (descarta execução vencida com `isFlowRunStale` de `src/lib/flows/fallback.ts`)
  - `export function conversationBadge(args: { inActiveFlow: boolean; aiHandles: boolean }): 'flow' | 'ai' | null` (fluxo tem prioridade)

- [ ] **Step 1: Escrever os testes**: `aiHandlesConversation` true quando I.A ativa + resposta automática ligada + sem automação de resposta ativa + sem responsável + não desligada + sem `bot_handoff_at`; false em cada uma das condições contrárias (6 casos). `activeFlowConversationIds`: inclui execução de 1 h num fluxo de 24 h; exclui execução de 3 h num fluxo com `on_timeout_hours: 2`; ignora `conversation_id` nulo. `conversationBadge`: fluxo+I.A → `flow`; só I.A → `ai`; nenhum → `null`.
- [ ] **Step 2: Rodar e ver falhar** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/inbox/badges.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** e trocar em `auto-reply.ts` as checagens `conv.assigned_agent_id` / `conv.ai_autoreply_disabled` / automação ativa por `aiHandlesConversation(...)` (o `select` da conversa passa a incluir `bot_handoff_at`). O teto de respostas e o claim atômico continuam como estão.
- [ ] **Step 4: Rodar** `badges.test.ts` **e** `src/lib/ai/auto-reply.test.ts` · Expected: PASS (o comportamento da I.A não muda).
- [ ] **Step 5: Commit** `feat(inbox): regras dos selos de I.A e de fluxo`

### Task 5: Caminhos do servidor gravam o evento

**Files:**
- Modify: `src/lib/flows/engine.ts` (`handOffRun`, ~linha 432)
- Modify: `src/lib/ai/auto-reply.ts` (bloco de entrega para humano, ~linha 145)
- Modify: `src/app/api/ai/autoreply/[conversationId]/route.ts` ("Assumir" / "Retomar I.A" do banner; ajuste D do Samuel, 20/11)
- Test: `src/lib/flows/engine.test.ts`, `src/lib/ai/auto-reply.test.ts`, teste da rota do banner (acrescentar casos)

**Interfaces:**
- Consumes: `record_assignment_event` (tarefa 2).

- [ ] **Step 1: Escrever os testes**:
  - fluxo: `handOffRun` com `assignTo` chama `db.rpc('record_assignment_event', { p_conversation_id, p_to_user_id: assignTo, p_actor_kind: 'flow', p_actor_user_id: null, p_note: null })` e o `update` de `conversations` **não** leva mais `assigned_agent_id`; sem `assignTo`, não chama a RPC;
  - I.A: na entrega com `handoffAgentId` e sem responsável, chama a RPC com `p_actor_kind: 'ai'` e `p_note` = o `summary` de `buildHandoffSummary`; o `update` não leva `assigned_agent_id`;
  - banner da I.A: "Assumir" (`paused: true, assign_to_me: true`) chama `rpc('transfer_conversation', { p_conversation_id, p_to_user_id: userId, p_note: null })` com o cliente do usuário (evento `actor_kind = 'agent'`); "Retomar I.A" que remove o responsável chama a mesma RPC com `p_to_user_id: null`; o `update` não leva mais `assigned_agent_id`; erro da RPC responde 4xx/5xx e não muda a pausa da I.A.
- [ ] **Step 2: Rodar e ver falhar** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/flows/engine.test.ts src/lib/ai/auto-reply.test.ts` · Expected: FAIL nos casos novos.
- [ ] **Step 3: Implementar**: tirar `assigned_agent_id` dos `update` e chamar a RPC logo depois (o `update` dos outros campos continua igual). Erro da RPC é logado e não derruba o handoff (mesmo padrão de best-effort do arquivo).
- [ ] **Step 4: Rodar** os mesmos testes · Expected: PASS.
- [ ] **Step 5: Commit** `feat(inbox): fluxo e I.A registram a troca de responsável`

### Task 6: Lista do Inbox: filtros, contadores, espera e selo

**Files:**
- Modify: `src/components/inbox/conversation-list.tsx`
- Modify: `src/app/(dashboard)/inbox/page.tsx` (passar `userId`, estado da I.A, filtro)
- Create: `src/hooks/use-inbox-counts.ts`
- Modify: `messages/pt-BR.json`, `messages/en.json` (`Inbox.filterMine`, `Inbox.filterUnassigned`, `Inbox.filterAwaiting`, `Inbox.wait.*`, `Inbox.badgeAi`, `Inbox.badgeFlow`)

**Interfaces:**
- Consumes: `matchesInboxFilter`, `waitBand`, `formatWait`, `compareAwaiting` (tarefa 3); `aiHandlesConversation`, `activeFlowConversationIds`, `conversationBadge` (tarefa 4); RPC `inbox_filter_counts` (tarefa 1).
- Produces: `useInboxCounts(): { counts: { mine: number; unassigned: number; awaiting: number; unread: number } | null; refresh: () => void }`

- [ ] **Step 1: Teste do mapeamento filtro → consulta.** Exportar de `filters.ts` `export function applyQuickFilter<Q extends { eq: Function; is: Function; neq: Function; not: Function; gt: Function; order: Function }>(q: Q, filter: InboxQuickFilter, userId: string): Q` e testar com um query builder falso que registra as chamadas: `mine` → `eq('assigned_agent_id', userId)` + `neq('status','closed')`; `unassigned` → `is('assigned_agent_id', null)` + `neq('status','closed')`; `awaiting` → `not('awaiting_since','is',null)` + `neq('status','closed')` + `order('awaiting_since', {ascending: true})`; `unread` → `gt('unread_count', 0)`; `all` → nada.
- [ ] **Step 2: Rodar e ver falhar** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/inbox/filters.test.ts` · Expected: FAIL nos casos novos.
- [ ] **Step 3: Implementar** `applyQuickFilter`; na lista, a busca usa `applyQuickFilter` e refaz ao trocar de filtro; o filtro de tempo real usa `matchesInboxFilter`; os chips "Todas / Minhas / Sem dono / Aguardando / Não lidas" com os números do `useInboxCounts` (refresh com debounce de 1 s em evento de `conversations`); o seletor de Status (Abertas/Pendentes/Fechadas) continua separado; indicador `formatWait` com cor `waitBand` por linha (re-render a cada 60 s); selo por `conversationBadge` (estado da I.A lido uma vez de `GET /api/ai/config`; `autoRespondersActive` = existe automação ativa `new_message_received` ou `keyword_match`, lida uma vez; fluxos ativos = `flow_runs` com `status='active'` e `flows(fallback_policy)`, relidos junto dos contadores); filtro salvo em `localStorage` com `try/catch`.
- [ ] **Step 4: Verificar** · `npx vitest run` (todos), `npm run typecheck`, `npm run lint` (0 erros), `npm run i18n:check` · Expected: tudo passa.
- [ ] **Step 5: Commit** `feat(inbox): filtros Minhas, Sem dono e Aguardando com contadores`

### Task 7: Nota interna no composer e eventos na linha do tempo

**Files:**
- Create: `src/components/inbox/conversation-event.tsx` (linha de sistema + cartão de nota)
- Create: `src/lib/inbox/timeline.ts`, `src/lib/inbox/timeline.test.ts`
- Modify: `src/components/inbox/message-composer.tsx` (abas)
- Modify: `src/components/inbox/message-thread.tsx` (carregar eventos, tempo real, mesclar)
- Modify: `messages/pt-BR.json`, `messages/en.json` (`Inbox.composer.tabReply`, `Inbox.composer.tabNote`, `Inbox.composer.saveNote`, `Inbox.composer.noteHint`, `Inbox.events.*`)

**Interfaces:**
- Consumes: `ConversationEvent` e `add_conversation_note` (tarefa 2).
- Produces: `export type TimelineItem = { kind: 'message'; at: string; message: Message } | { kind: 'event'; at: string; event: ConversationEvent }` e `export function mergeTimeline(messages: Message[], events: ConversationEvent[]): TimelineItem[]`.

- [ ] **Step 1: Escrever os testes de `mergeTimeline`**: ordena por `created_at`; em empate, mensagem antes de evento; a nota de uma transferência (`note_id`) vem logo **depois** da linha de troca que aponta para ela, mesmo com o mesmo `created_at`; não duplica um evento recebido duas vezes (carga + tempo real, mesmo `id`).
- [ ] **Step 2: Rodar e ver falhar** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/inbox/timeline.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** `mergeTimeline`; na thread, buscar `conversation_events` da conversa ordenados por `created_at` junto das mensagens e assinar `postgres_changes` INSERT de `conversation_events` com `conversation_id=eq.<id>`; `conversation-event.tsx` renderiza `🔒 Nota interna · <nome> · <hora>` + texto, e as linhas `transferred`/`assigned`/`unassigned` com o autor (`actor_kind` ≠ `user` → "Automação" / "Fluxo" / "I.A"). No composer, abas "Responder / Nota interna": em "Nota interna" o fundo fica amarelo claro, somem anexo, modelo, resposta rápida e interativo, o botão vira "Salvar nota" e chama `supabase.rpc('add_conversation_note', { p_conversation_id, p_body })`; depois de salvar volta para "Responder". Enter não envia na aba de nota (só o botão), para evitar salvar sem querer.
- [ ] **Step 4: Verificar** · `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run i18n:check` · Expected: passa.
- [ ] **Step 5: Commit** `feat(inbox): nota interna e eventos na linha do tempo`

### Task 8: Diálogo de transferência

**Files:**
- Create: `src/components/inbox/transfer-dialog.tsx`
- Modify: `src/components/inbox/message-thread.tsx:820-840` (troca o `update` direto pela RPC) e o menu de responsável (~linha 1000)
- Modify: `messages/pt-BR.json`, `messages/en.json` (`Inbox.transfer.*`)

**Interfaces:**
- Consumes: `transfer_conversation` (tarefa 2).

- [ ] **Step 1: Teste**: extrair `export async function transferConversation(supabase, conversationId: string, toUserId: string | null, note: string): Promise<void>` em `src/lib/inbox/transfer.ts` e testar com cliente falso: chama `rpc('transfer_conversation', { p_conversation_id, p_to_user_id, p_note: null })` quando a observação é vazia/só espaços e `p_note: 'texto'` aparado quando não; lança erro quando a RPC devolve erro; chama `pingAutomationEvents()` (`src/lib/automations/ping.ts`) só quando `toUserId` não é nulo e a RPC deu certo.
- [ ] **Step 2: Rodar e ver falhar** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run src/lib/inbox/transfer.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** `transfer.ts`; o menu: escolher membro abre o diálogo (spec 5.4, contador de caracteres até 2.000); "Remover responsável" chama `transferConversation(..., null, '')` sem diálogo; erro mostra toast traduzido. O `update` direto de `assigned_agent_id` sai de `message-thread.tsx`.
- [ ] **Step 4: Verificar** · `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run i18n:check`; `grep -rn "assigned_agent_id:" src/components` não acha gravação direta · Expected: passa, grep vazio.
- [ ] **Step 5: Commit** `feat(inbox): transferir conversa com observação`

### Task 8b: Trava "troca de responsável só com evento" (migration 060)

Ajuste E do Samuel (20/11): depois da tarefa 8, quando nenhuma tela grava `assigned_agent_id` direto.

- Create: `supabase/migrations/060_conversation_assignee_event_only.sql` — trigger em `conversations` que recusa mudar `assigned_agent_id` fora de `_assign_with_event` (marca de transação lida pelo trigger, como o `app.assignment_event_id`).
- Test: `supabase/tests/assignee_event_only.test.sql` — UPDATE direto (logado e service_role) é recusado; transferência, automação, fluxo/I.A e em massa continuam funcionando e gravando evento.
- Antes: `grep -rn "assigned_agent_id" src` sem gravação direta fora das RPCs.

### Task 9: Teste ponta a ponta local, registro e PR

**Files:**
- Modify: `IMPLANTACOES.md` (entrada nova no topo, abaixo de "Para religar a VPS", no modelo do arquivo)

- [ ] **Step 1: Ponta a ponta local** (Supabase local + dev com proxy fake da Meta, `REACTIVATION_DRY_RUN=true`, saída externa bloqueada, como nas features anteriores), com dados marcados para limpar depois:
  1. webhook assinado com mensagem do cliente → conversa em "Aguardando" e "Sem dono", contadores sobem, selo da I.A quando a I.A está ligada;
  2. I.A responde (proxy) → continua em "Aguardando"; mensagem pela API v1 → continua em "Aguardando"; contato dentro de um fluxo → selo "🤖 Fluxo em andamento" e continua em "Aguardando";
  3. atendente responde pelo Inbox → sai de "Aguardando", contador cai sem recarregar;
  4. nota interna → aparece na linha do tempo; nenhuma chamada à Meta no log do proxy; `last_message_text` igual;
  5. transferir com observação para outro agente → linha + nota; notificação do destino com o texto; execução da automação `conversation_assigned`;
  6. limpar os dados e conferir a base (4 contatos / 4 conversas / 7 mensagens).
- [ ] **Step 2: Suíte completa** · `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run && npm run typecheck && npm run lint && npm run i18n:check && npx supabase test db && npm run build` · Expected: tudo passa.
- [ ] **Step 3: IMPLANTACOES.md** com origem, o que mudou, migrations 057–058, arquivos principais, como foi testado (números da etapa 2 e o roteiro da etapa 1), commit/branch e pendências.
- [ ] **Step 4: Commit** `docs: IMPLANTACOES com filtros, notas e transferência do Inbox`
- [ ] **Step 5: Push e PR** para o `main` só quando o Samuel pedir; conferir o CI verde (os dois jobs).
