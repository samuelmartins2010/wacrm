# Deploy das migrations 040–062 no Supabase (SQL Editor)

Guia para aplicar no projeto da nuvem as migrations da Reativação (040–047), das
correções de Automações e Fluxos (048–056), do Inbox com filtros, notas e
transferência (057–060), da fila de eventos das automações (061) e da trava da
Reativação que se recria sozinha (062).

Todas foram testadas em replay completo, 001→062 em ordem e sem erro: o job
"Banco (migrations + pgTAP)" do CI faz isso a cada PR, e o replay local de
18/11/2026 cobriu 001→056. As 23 consultas de verificação abaixo foram rodadas
no banco local em 23/11/2026 e voltaram todas `true`.

> **Duas janelas.** As 040–056 podem entrar antes do código novo (só
> acrescentam). As **057–062 vão juntas, na mesma janela e logo antes do deploy
> do código do `main`**: a 060 passa a recusar troca direta de responsável, e o
> código antigo da VPS atribui conversa por UPDATE direto. Entre a 060 e o
> deploy, atribuir pelo Inbox antigo dá erro.

## Antes de começar

1. **Backup.** No painel: *Database → Backups*, confirme um backup recente (ou
   rode um `pg_dump`). Algumas migrations mexem em dados (046, 051, 052).
2. **Pré-requisitos (037–039).** As 040+ dependem do que o `main` já tinha.
   Rode e confira que as três respostas são `true`:
   ```sql
   select
     (select prosrc like '%renewal_date%' from pg_proc where proname = 'handle_new_user')  as m037,
     to_regclass('public.platform_admins') is not null                               as m038,
     exists (select 1 from information_schema.columns
             where table_name = 'accounts' and column_name = 'document')             as m039;
   ```
   Se alguma der `false`, aplique antes a migration correspondente
   (`037_trial_expiry.sql`, `038_platform_admin_rbac_audit.sql`,
   `039_account_document_phone.sql`).
3. **Pausar o cron** das automações, fluxos e reativação enquanto aplica
   (as rotas `/api/*/cron`), para nada rodar com o banco pela metade.
4. **Para a janela 057–062:** avise quem estiver usando que o Inbox fica alguns
   minutos sem trocar responsável, e tenha o deploy do código pronto para subir
   logo depois da 062.

## Como aplicar cada uma

Para **cada** arquivo, na ordem da tabela:

1. Abra *SQL Editor → New query*.
2. Escreva `begin;` na primeira linha, cole o conteúdo inteiro do arquivo de
   `supabase/migrations/`, e escreva `commit;` na última linha.
3. *Run*. Deve terminar sem erro.
4. Rode a consulta de verificação da tabela (deve dar `true`).
5. Registre que foi aplicada (para o `supabase db push` futuro não tentar de novo):
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('040', 'reactivation') on conflict do nothing;
   ```
   (troque número e nome; o nome é o arquivo sem o número e sem `.sql`).
   Se a tabela `supabase_migrations.schema_migrations` não existir no projeto,
   pule este passo.

## Ordem, o que faz e como verificar

| # | Arquivo | O que faz | Verificação (deve dar `true`) |
|---|---|---|---|
| 1 | `040_reactivation.sql` | Tabelas da Reativação (ajustes, campanhas, inscrições, envios), colunas `do_not_contact`/`last_inbound_at` em contatos, RLS | `select to_regclass('public.reactivation_enrollments') is not null and exists (select 1 from information_schema.columns where table_name='contacts' and column_name='do_not_contact');` |
| 2 | `041_reactivation_candidates.sql` | Função que lista contatos elegíveis à reativação | `select to_regprocedure('public.reactivation_candidates(uuid)') is not null;` |
| 3 | `042_reactivation_review_fixes.sql` | `attempted_at` nos envios (limite diário conta tentativas) + índice; ajustes da revisão | `select exists (select 1 from information_schema.columns where table_name='reactivation_sends' and column_name='attempted_at' and is_nullable='NO');` |
| 4 | `043_reactivation_send_error_code.sql` | Guarda o código de erro da Meta em cada envio | `select exists (select 1 from information_schema.columns where table_name='reactivation_sends' and column_name='error_code');` |
| 5 | `044_contacts_do_not_contact_guard.sql` | Só admin desmarca "não quer receber campanhas"; banco carimba quem e quando | `select exists (select 1 from pg_trigger where tgname='contacts_guard_do_not_contact');` |
| 6 | `045_reactivation_run_lock.sql` | Trava (lease) para uma rodada do cron por vez | `select to_regprocedure('public.reactivation_try_lock(uuid,integer)') is not null and exists (select 1 from reactivation_run_lock where id=1);` |
| 7 | `046_reactivation_one_open_per_contact.sql` | Um contato em no máximo uma campanha aberta (cancela duplicatas antes do índice) | `select to_regclass('public.uq_reactivation_one_open_per_contact') is not null;` |
| 8 | `047_reactivation_campaign_rls_draft_only.sql` | Cliente só edita rascunhos; ativar/pausar só pela API; CHECKs nos ajustes | `select exists (select 1 from pg_policies where policyname='reactivation_campaigns_update') and exists (select 1 from pg_constraint where conname='reactivation_settings_daily_limit_max');` |
| 9 | `048_flows_replace_nodes_atomic.sql` | Salvar fluxo troca os nós numa transação; evento `node_removed` | `select to_regprocedure('public.replace_flow_nodes(uuid,jsonb,jsonb)') is not null and pg_get_constraintdef((select oid from pg_constraint where conname='flow_run_events_event_type_check')) like '%node_removed%';` |
| 10 | `049_conversation_bot_handoff.sql` | `bot_handoff_at`: silêncio de I.A/automações depois do handoff, limpo ao encerrar/reabrir | `select exists (select 1 from information_schema.columns where table_name='conversations' and column_name='bot_handoff_at') and exists (select 1 from pg_trigger where tgname='conversations_clear_bot_handoff');` |
| 11 | `050_flow_events_wamid_index.sql` | Índice para achar o envio do fluxo pelo id da Meta (webhook de status) | `select to_regclass('public.idx_flow_run_events_sent_wamid') is not null;` |
| 12 | `051_media_buckets_100mb.sql` | Buckets `flow-media` e `chat-media` aceitam até 100 MB (documentos) | `select bool_and(file_size_limit = 104857600) from storage.buckets where id in ('flow-media','chat-media');` |
| 13 | `052_automation_wait_reply_cancel.sql` | `continue_on_reply`, status `cancelled`, uma espera aberta por automação/contato (cancela duplicatas antes do índice) | `select exists (select 1 from information_schema.columns where table_name='automations' and column_name='continue_on_reply') and to_regclass('public.uq_automation_one_open_wait_per_contact') is not null;` |
| 14 | `053_accounts_timezone.sql` | Fuso da conta (padrão America/Sao_Paulo) para condições de horário, com validação | `select exists (select 1 from information_schema.columns where table_name='accounts' and column_name='timezone') and exists (select 1 from pg_trigger where tgname='accounts_check_timezone');` |
| 15 | `054_automation_logs_waiting.sql` | Status `waiting` no log de automação | `select pg_get_constraintdef((select oid from pg_constraint where conname='automation_logs_status_check')) like '%waiting%';` |
| 16 | `055_automation_trigger_events.sql` | Fila de eventos `tag_added`/`conversation_assigned` + triggers + funções com profundidade (anti-loop) | `select to_regclass('public.automation_trigger_events') is not null and exists (select 1 from pg_trigger where tgname='contact_tags_emit_tag_added') and to_regprocedure('public.claim_automation_trigger_events(uuid,integer)') is not null;` |
| 17 | `056_automation_events_bulk_silent.sql` | Importação, etiqueta em lote e atribuição em lote não geram eventos | `select to_regprocedure('public.contact_tags_insert_bulk(jsonb)') is not null and to_regprocedure('public.contacts_bulk_add_tag(uuid[],uuid)') is not null and to_regprocedure('public.conversations_bulk_assign(uuid[],uuid)') is not null;` |
| 18 | `057_inbox_awaiting.sql` | Espera por resposta humana (`awaiting_since`, `closed_at`, `sent_via_api`), triggers em mensagens e conversas, backfill da espera das conversas existentes, `inbox_filter_counts()` | `select exists (select 1 from information_schema.columns where table_name='conversations' and column_name='awaiting_since') and exists (select 1 from information_schema.columns where table_name='conversations' and column_name='closed_at') and exists (select 1 from information_schema.columns where table_name='messages' and column_name='sent_via_api') and to_regprocedure('public.inbox_filter_counts()') is not null and exists (select 1 from pg_trigger where tgname='conversations_awaiting_on_status');` |
| 19 | `058_conversation_events.sql` | Notas internas e trocas de responsável (`conversation_events`, leitura só para membros, escrita só pelas funções), `transfer_conversation`, `add_conversation_note`; automação e lote passam a gravar o evento; tabela no tempo real | `select to_regclass('public.conversation_events') is not null and to_regprocedure('public.transfer_conversation(uuid,uuid,text)') is not null and to_regprocedure('public.add_conversation_note(uuid,text)') is not null and exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_events');` |
| 20 | `059_conversation_assignee_rules.sql` | Responsável só dono/admin/atendente da conta; cliente reabre conversa encerrada; quem perde acesso libera as conversas abertas; `record_assignment_event` com `p_only_if_unassigned` | `select exists (select 1 from pg_trigger where tgname='conversations_check_assignee') and exists (select 1 from pg_trigger where tgname='messages_reopen_on_customer') and exists (select 1 from pg_trigger where tgname='profiles_unassign_on_access_loss') and to_regprocedure('public.record_assignment_event(uuid,uuid,text,uuid,text,boolean)') is not null and to_regprocedure('public.record_assignment_event(uuid,uuid,text,uuid,text)') is null;` |
| 21 | `060_conversation_assignee_event_only.sql` | Trava: o responsável só muda junto com um evento (UPDATE direto recusado). **Ver o aviso das duas janelas.** | `select exists (select 1 from pg_trigger where tgname='conversations_require_assignment_event');` |
| 22 | `061_automation_events_active_and_expiry.sql` | Fila de eventos das automações: só dispara automação já ativa no momento do evento (`automations.activated_at`); evento com mais de 60 min é descartado e registrado nos logs como "Ignorada" | `select exists (select 1 from information_schema.columns where table_name='automations' and column_name='activated_at') and to_regprocedure('public.expire_stale_automation_trigger_events(uuid)') is not null and pg_get_constraintdef((select oid from pg_constraint where conname='automation_logs_status_check')) like '%skipped%' and pg_get_constraintdef((select oid from pg_constraint where conname='automation_trigger_events_status_check')) like '%expired%';` |
| 23 | `062_reactivation_run_lock_self_heal.sql` | A trava de rodada da Reativação se recria sozinha se a linha fixa sumir | `select pg_get_functiondef('public.reactivation_try_lock(uuid,integer)'::regprocedure) like '%ON CONFLICT%' and exists (select 1 from reactivation_run_lock where id=1);` |

Conferência final (deve listar 23 linhas, todas `true`), rodando as consultas
acima juntas ou só esta, mais curta:

```sql
select
  to_regclass('public.reactivation_enrollments') is not null as r040,
  to_regclass('public.reactivation_run_lock')    is not null as r045,
  to_regclass('public.automation_trigger_events') is not null as r055,
  to_regprocedure('public.contacts_bulk_add_tag(uuid[],uuid)') is not null as r056,
  to_regclass('public.conversation_events')       is not null as r058,
  exists (select 1 from pg_trigger where tgname = 'conversations_require_assignment_event') as r060,
  to_regprocedure('public.expire_stale_automation_trigger_events(uuid)') is not null as r061,
  pg_get_functiondef('public.reactivation_try_lock(uuid,integer)'::regprocedure) like '%ON CONFLICT%' as r062;
```

## Se uma falhar no meio

- **Com `begin;`/`commit;` em volta, uma falha desfaz o arquivo inteiro.** Nada
  daquela migration fica pela metade. As anteriores (já com `commit`) ficam.
- **Não pule para a próxima.** As seguintes dependem das anteriores (ex.: 047
  depende das tabelas da 040; 056 substitui funções da 055; 059 e 060 dependem
  da tabela da 058; 061 substitui o claim da 055; 062 substitui a trava da 045).
- Leia a mensagem de erro e compare com o arquivo. Casos mais prováveis:
  - *"relation … does not exist"*: falta uma migration anterior (ou 037–039).
  - *"could not create unique index"* (046, 052): há duplicatas que o `UPDATE`
    do próprio arquivo não cobriu (ex.: inserções concorrentes). Rode de novo
    com o cron pausado.
  - *"permission denied"*: rode como o usuário dono do banco (o SQL Editor já usa
    `postgres`).
- Todas as migrations 040–062 são **reexecutáveis**: `IF NOT EXISTS`,
  `CREATE OR REPLACE`, `DROP … IF EXISTS`. Corrigido o motivo, rode o mesmo
  arquivo de novo do começo.
- **Exceção de ordem:** se precisar rodar a **058 de novo depois que a 059 já
  passou**, rode a **059 de novo** em seguida. A 058 recria a versão antiga de
  `record_assignment_event` (5 parâmetros), que a 059 troca pela nova (6); as
  duas juntas deixam a chamada ambígua. A verificação da 059 pega isso (a antiga
  tem que ser `null`).
- *"assignee changes must go through transfer_conversation"* (depois da 060): é
  o código antigo tentando trocar responsável direto. Suba o código novo; para
  corrigir um responsável à mão, ver "Corrigir o responsável à mão" no
  IMPLANTACOES (entrada do Inbox, 23/11).
- Se não souber o que fazer: **pare**, deixe o cron pausado e o app no ar
  (o código antigo continua funcionando com as migrations já aplicadas, porque
  todas só acrescentam), e restaure o backup só se algum dado tiver sido
  afetado.

## Depois de aplicar

1. Faça o deploy do código do `main` (logo depois da 062, na mesma janela).
2. Reative os crons (`/api/automations/cron`, `/api/flows/cron`,
   `/api/reactivation/cron`, todos com o header `x-cron-secret`).
3. Confira no app: /automations abre, /flows abre, /reactivation abre, e o
   log de uma automação de teste mostra "Aguardando" durante um wait.
4. Inbox: os filtros Minhas / Sem dono / Aguardando aparecem com contadores;
   transferir uma conversa com observação mostra a linha e a nota na conversa.
