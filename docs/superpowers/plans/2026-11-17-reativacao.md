# Reativação de contatos inativos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo "Reativação" no Clientizza. Lista contatos inativos por faixa e roda campanhas de até 3 toques por template. A campanha é aprovada antes de começar, para quando o contato responde e respeita o opt-out "SAIR".

**Architecture:** Migration 037 cria as tabelas `reactivation_*` e colunas novas em `contacts`. As regras puras ficam em `src/lib/reactivation/` (testadas). As rotas `src/app/api/reactivation/*` usam `requireRole`. O cron `GET /api/reactivation/cron` envia via `engineSendTemplate`, que já grava no inbox como `bot`. O webhook ganha ganchos de resposta/saída e de status. As telas ficam em `src/app/(dashboard)/reactivation/`.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de rotas/páginas, ver `AGENTS.md`), Supabase (RLS `is_account_member`), next-intl, Vitest, Tailwind + componentes `src/components/ui/*`.

**Spec:** `docs/superpowers/specs/2026-11-17-reativacao-design.md`

## Global Constraints

- Branch `feat/reativacao` a partir de `main`. **Nunca** `git add -A`/`.`: o working tree tem diffs de CRLF que não são nossos. Adicione arquivos pelo nome.
- Testes: `TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run <arquivo>`; suíte inteira antes do merge (680 testes passando hoje).
- `npm run typecheck` e `npm run lint` limpos ao fim de cada task que toca TS.
- Migration local: `npx supabase migration up` (**nunca** `db reset`, que apaga o usuário admin local).
- Tudo com `account_id`. Leitura `is_account_member(account_id,'agent')`; escrita de campanhas/ajustes `'admin'`. Inscrições e envios só via service role (`supabaseAdmin()` de `@/lib/automations/admin-client`).
- Padrões (spec 5.1–5.5): faixas 30/60/120 dias; descanso 60 dias; envio recente 7 dias; limite diário 50/conta; janela seg–sex 9–19, sáb 9–13, dom fechado, fuso `America/Sao_Paulo`; palavras de saída `SAIR`, `PARAR`, `STOP`; resposta de saída "Pronto, você não vai mais receber nossas mensagens de campanha."; saída só vale com inscrição ativa ou toque nos últimos 30 dias; 1 retentativa no dia seguinte.
- Só templates `status = 'APPROVED'` **sem header de mídia e sem variável de header** (o `engineSendTemplate` só envia parâmetros de corpo). Variáveis de corpo: `{{n}}` ← `first_name` | `name` | `company` | texto fixo.
- `REACTIVATION_DRY_RUN=true` → não chama a Meta; grava a mensagem `bot` com `message_id = 'dryrun-<uuid>'`.
- Textos de UI em `messages/pt-BR.json` **e** `messages/en.json`, namespace `Reactivation`.

## Review Focus

1. **Cron sobreposto / reexecução:** duas chamadas simultâneas não podem enviar o mesmo toque. Testado na Task 4 (`claims are exclusive`, `unique send per step`).
2. **Resposta entre o claim e o envio:** se o contato respondeu depois da inscrição, o runner não envia. Testado na Task 4 (`skips when replied after enrollment`).
3. **"SAIR" fora de campanha:** quem não tem inscrição ativa nem toque recente não vira `do_not_contact`. Testado na Task 5 (`ignores optout without recent reactivation`).
4. **Variação de escrita da palavra de saída** ("Sair.", " sair ", "SÁIR"): reconhecida; "quero sair do grupo" não. Testado na Task 2.
5. **Virada de dia e fuso no limite diário e na janela:** contagem por dia em `America/Sao_Paulo`, não UTC. Testado na Task 2 (`window at 22:30 UTC Friday is closed`, `dayKey uses Sao Paulo`).

---

### Task 1: Migration 037 + tipos

**Files:**
- Create: `supabase/migrations/037_reactivation.sql`
- Modify: `src/types/index.ts` (append ao fim)

**Interfaces:**
- Produces (SQL): colunas `contacts.do_not_contact BOOLEAN NOT NULL DEFAULT false`, `do_not_contact_at TIMESTAMPTZ`, `do_not_contact_source TEXT CHECK (IN ('reativacao_sair','manual'))`, `last_inbound_at TIMESTAMPTZ`. Tabelas `reactivation_settings`, `reactivation_campaigns`, `reactivation_enrollments`, `reactivation_sends`, com as colunas exatamente como na spec 5.7. Status de campanha `draft|active|paused|finished`; inscrição `pending|active|replied|completed|opted_out|failed|removed|cancelled`; envio `sent|delivered|read|failed`. `UNIQUE(campaign_id, contact_id)` e `UNIQUE(enrollment_id, step)`.
- Produces (TS): `ReactivationBand = 'late'|'cooling'|'gone'`, `ReactivationSettings`, `ReactivationCampaign`, `ReactivationStep { template_id: string; params: ReactivationParam[]; wait_days: number }`, `ReactivationParam = { source: 'first_name'|'name'|'company' } | { source: 'fixed'; value: string }`, `ReactivationEnrollment`, `ReactivationSend`, e os campos novos em `Contact`.

- [ ] **Step 1:** `git checkout -b feat/reativacao`.
- [ ] **Step 2: Escrever a migration.**
  - Colunas e tabelas acima.
  - `reactivation_settings` com PK `account_id` e defaults dos Global Constraints. `window` é JSONB `{"mon_fri":[9,19],"sat":[9,13],"sun":null}`.
  - Backfill: `UPDATE contacts c SET last_inbound_at = s.max FROM (SELECT cv.contact_id, MAX(m.created_at) max FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE m.sender_type='customer' GROUP BY 1) s WHERE s.contact_id = c.id`.
  - Índices da spec 5.7.
  - RLS conforme Global Constraints. `reactivation_enrollments`/`reactivation_sends`: só SELECT para `agent`, sem políticas de escrita.
  - Use `IF NOT EXISTS` / `DROP POLICY IF EXISTS`, como as migrations 027/036.
- [ ] **Step 3: Aplicar.** `npx supabase migration up`. Esperado: `Applying migration 037_reactivation.sql...` sem erro.
- [ ] **Step 4: Conferir.** `docker exec supabase_db_wacrm psql -U postgres -c "\d reactivation_enrollments"` lista as colunas e os dois UNIQUE. `select count(*) from contacts where last_inbound_at is not null` ≥ 0 sem erro.
- [ ] **Step 5: Tipos** em `src/types/index.ts`; `npm run typecheck` limpo.
- [ ] **Step 6: Commit.** `git add supabase/migrations/037_reactivation.sql src/types/index.ts && git commit -m "feat(reativacao): migration 037 e tipos"`

### Task 2: Regras puras

**Files:**
- Create: `src/lib/reactivation/rules.ts`, `src/lib/reactivation/rules.test.ts`

**Interfaces:**
- Produces:
  - `daysSince(iso: string, now: Date): number` — dias de calendário em `America/Sao_Paulo`.
  - `bandForDays(days: number, t: {late:number; cooling:number; gone:number}): ReactivationBand | null` — `null` abaixo de `late`.
  - `type ExclusionReason = 'do_not_contact'|'invalid_phone'|'in_active_campaign'|'resting'|'recent_outbound'|'removed'`
  - `exclusionFor(c: EligibilityInput, s: ReactivationSettings, now: Date): ExclusionReason | null` — `EligibilityInput = { phone: string|null; do_not_contact: boolean; has_active_enrollment: boolean; last_enrollment_ended_at: string|null; last_outbound_at: string|null; removed?: boolean }`. Ordem de checagem = ordem do tipo.
  - `dayKey(now: Date): string` — `yyyy-MM-dd` em São Paulo.
  - `isWithinWindow(now: Date, w: SendWindow): boolean` e `nextWindowOpen(now: Date, w: SendWindow): Date`.
  - `normalizeOptout(text: string): string` — trim, remove pontuação nas pontas, sem acento, maiúsculas.
  - `isOptoutMessage(text: string, keywords: string[]): boolean` — igualdade exata após normalizar.
  - `type SendErrorKind = 'invalid_recipient'|'retryable'|'template_unavailable'`; `classifySendError(message: string): SendErrorKind` — `invalid_recipient` se `isRecipientNotAllowedError` ou `/contact phone invalid|131026/`; `template_unavailable` se `/132001|132015|132016|template.*(paused|disabled|does not exist)/i`; senão `retryable`.
  - `addDays(now: Date, days: number): Date`.

- [ ] **Step 1: Testes que falham** (`rules.test.ts`), com `now` fixo:
  - `bandForDays(29)` → `null`; `30` → `'late'`; `60` → `'cooling'`; `120` → `'gone'` (limites 30/60/120).
  - `exclusionFor`: `do_not_contact` vence `invalid_phone`; `last_enrollment_ended_at` há 59 dias → `'resting'`, há 61 → `null`; `last_outbound_at` há 6 dias → `'recent_outbound'`, há 8 → `null`; telefone `'123'` → `'invalid_phone'`.
  - `window at 22:30 UTC Friday is closed` (19:30 em SP); sábado 12:59 SP aberto, 13:00 fechado; domingo fechado; `nextWindowOpen` de sábado 14h SP → segunda 09:00 SP.
  - `dayKey uses Sao Paulo`: `2026-11-18T02:00:00Z` → `'2026-11-17'`.
  - `isOptoutMessage`: `'Sair.'`, `' sair '`, `'SÁIR'`, `'stop!'` → true; `'quero sair do grupo'`, `'cancelar'` → false (keywords padrão).
  - `classifySendError`: `'(#131030) Recipient phone number not in allowed list'` → `invalid_recipient`; `'(#131049) ...'` → `retryable`; `'(#132001) Template name does not exist'` → `template_unavailable`.
- [ ] **Step 2:** rodar e ver falhar (`Cannot find module './rules'`).
- [ ] **Step 3: Implementar** com `date-fns` + `Intl.DateTimeFormat` (timeZone `America/Sao_Paulo`), como `horarioAgora` do protótipo.
- [ ] **Step 4:** rodar e ver passar.
- [ ] **Step 5: Commit** `feat(reativacao): regras puras de faixa, elegibilidade, janela e saída`.

### Task 3: Consultas e rotas de gestão

**Files:**
- Create: `src/lib/reactivation/queries.ts`, `src/lib/reactivation/queries.test.ts`
- Create: `src/app/api/reactivation/settings/route.ts` (GET, PUT admin)
- Create: `src/app/api/reactivation/inactive/route.ts` (GET agent; `?band=&tag=&excludeTag=&page=`)
- Create: `src/app/api/reactivation/campaigns/route.ts` (GET agent, POST admin → draft)
- Create: `src/app/api/reactivation/campaigns/[id]/route.ts` (GET agent; PATCH admin, só em draft; DELETE admin, só em draft)
- Create: `src/app/api/reactivation/campaigns/[id]/preview/route.ts` (GET admin)
- Create: `src/app/api/reactivation/campaigns/[id]/action/route.ts` (POST admin `{action:'approve'|'pause'|'resume'|'finish', removedContactIds?: string[]}`)
- Create: `src/app/api/contacts/[id]/do-not-contact/route.ts` (PUT admin `{value:boolean}`)

**Interfaces:**
- Consumes: Task 2 (`bandForDays`, `exclusionFor`, `daysSince`); `requireRole`/`toErrorResponse` de `@/lib/auth/account`.
- Produces:
  - `getSettings(db, accountId): Promise<ReactivationSettings>` — cria a linha padrão se faltar (upsert).
  - `loadCandidates(db, accountId, f: {bands: ReactivationBand[]; tagIds: string[]; excludeTagIds: string[]}, now: Date): Promise<Candidate[]>`, com `Candidate = { contact_id, name, phone, days, band, tags: string[], exclusion: ExclusionReason|null }`. Busca contatos com `last_inbound_at` não nulo, inscrição ativa/último `ended_at` e última mensagem nossa (`messages` com `sender_type IN ('agent','bot')` via `conversations`). A filtragem é feita em TS com Task 2.
  - `approveCampaign(admin, accountId, campaignId, userId, removed: string[], now): Promise<{enrolled:number; excluded:number}>` — recalcula candidatos e insere inscrições `pending`, com `next_run_at = now` para elegíveis e status `removed` para os removidos. Muda a campanha para `active` com `approved_by`/`approved_at`. Falha com 409 se não estiver em `draft`.
  - `setCampaignState(admin, accountId, id, action)`: `finish` → inscrições `pending|active` viram `cancelled` com `ended_at = now`.
  - Validação do POST/PATCH: 1–3 steps; `wait_days` 1–30; cada `template_id` é template `APPROVED`, sem header de mídia/variável, da mesma conta; quantidade de `params` = número de `{{n}}` no `body_text`.
- [ ] **Step 1: Testes que falham** (`queries.test.ts`, fake db no estilo de `src/lib/ai/context.test.ts`):
  - `loadCandidates` marca `do_not_contact` como excluído e não descarta o contato; filtra por banda e etiqueta.
  - `approveCampaign` em campanha `active` lança erro 409; os removidos viram inscrições `removed`.
  - O validador rejeita template `PENDING`, template com `header_type:'image'`, 4 steps e `params` com tamanho diferente das variáveis.
- [ ] **Step 2:** ver falhar. **Step 3:** implementar `queries.ts` e as rotas no padrão de `src/app/api/automations/route.ts` (`requireRole` → `accountId` do contexto; escrita de inscrições via `supabaseAdmin()`). **Step 4:** ver passar + typecheck.
- [ ] **Step 5: Teste manual:** `curl -s localhost:3000/api/reactivation/inactive` sem sessão retorna 401.
- [ ] **Step 6: Commit** `feat(reativacao): consultas e rotas de gestão de campanha`.

### Task 4: Runner do cron

**Files:**
- Create: `src/lib/reactivation/runner.ts`, `src/lib/reactivation/runner.test.ts`
- Create: `src/app/api/reactivation/cron/route.ts`

**Interfaces:**
- Consumes: Task 2; `engineSendTemplate` de `@/lib/automations/meta-send` (`{accountId,userId,conversationId,contactId,templateName,language,params}` → `{whatsapp_message_id}`).
- Produces: `runReactivation(deps: RunnerDeps, now: Date): Promise<{sent:number; skipped:number; failed:number}>`. `RunnerDeps = { db: SupabaseClient; send: typeof engineSendTemplate; dryRun: boolean; batchSize?: number }` (padrão 50).

Algoritmo por inscrição devida (`status IN ('pending','active')`, `next_run_at <= now`, campanha `active`, ordenada por `next_run_at`):
1. Fora da janela → `next_run_at = nextWindowOpen`.
2. Envios da conta hoje (`dayKey`, contando `reactivation_sends.created_at`/`updated_at` das tentativas) ≥ `daily_limit` → `next_run_at = próxima abertura do dia seguinte`.
3. **Claim:** `UPDATE ... SET status='active', next_run_at = now + 10min WHERE id=? AND next_run_at = <valor lido>`. Se 0 linhas, pula (outra execução pegou).
4. Reconfere: contato `do_not_contact` → `opted_out`. `last_inbound_at > enrolled created_at` → `replied` se `current_step ≥ 1` (`replied_step = current_step`), senão `cancelled` (`end_reason='returned_before_send'`). Ambos com `ended_at`.
5. Upsert de `reactivation_sends (enrollment_id, step = current_step+1)` com `attempts+1`. Se a linha já existir com `status <> 'failed'`, não reenvia (idempotência).
6. Resolve a conversa (a mais recente do contato por `last_message_at`) e os params. Envia com `send`, ou, em `dryRun`, insere `messages` `bot` com id `dryrun-<uuid>`.
7. Sucesso → grava `whatsapp_message_id` e `message_id`, `current_step+1`. Se houver próximo step → `next_run_at = addDays(now, wait_days)`; senão `completed` + `ended_at`.
8. Erro → `classifySendError`:
   - `invalid_recipient` → `failed`.
   - `retryable` → `attempts < 2` ? `next_run_at = +1 dia` : `failed`.
   - `template_unavailable` → campanha `paused`, `pause_reason = mensagem`, e devolve `next_run_at` para a inscrição.
9. Ao fim, campanhas `active` sem inscrições `pending|active` → `finished`.

Rota: GET com header `x-cron-secret` = `process.env.AUTOMATION_CRON_SECRET` (503 se faltar, 401 se diferente, igual a `src/app/api/automations/cron/route.ts`). `dryRun = process.env.REACTIVATION_DRY_RUN === 'true'`.

- [ ] **Step 1: Testes que falham** (`runner.test.ts`, fake db + `send` mock, `now` = terça 10:00 SP):
  - Envia toque 1 e agenda o 2 para `+wait_days`; último toque → `completed`.
  - `claims are exclusive`: duas chamadas `runReactivation` em paralelo sobre a mesma inscrição → `send` chamado 1 vez.
  - `unique send per step`: send existente `sent` para o step → não reenvia.
  - `skips when replied after enrollment`: `last_inbound_at` posterior → `replied` sem `send`; antes do 1º toque → `cancelled`.
  - Limite diário 2 com 3 devidas → 2 envios, 1 reagendada para o dia seguinte.
  - Domingo → nada enviado, `next_run_at` = segunda 09:00 SP.
  - Erro `131049` 1ª vez → reagenda +1 dia; 2ª vez → `failed`. Erro `132001` → campanha `paused`.
  - `dryRun` → `send` não chamado; mensagem `bot` com `message_id` começando por `dryrun-`.
- [ ] **Step 2:** falha. **Step 3:** implementar. **Step 4:** passa + typecheck.
- [ ] **Step 5: Commit** `feat(reativacao): runner do cron com claim, limite, janela e retentativa`.

### Task 5: Ganchos no webhook (resposta, saída, status, last_inbound_at)

**Files:**
- Create: `src/lib/reactivation/inbound.ts`, `src/lib/reactivation/inbound.test.ts`
- Modify: `src/app/api/whatsapp/webhook/route.ts`: em `processMessage`, logo após `await flagBroadcastReplyIfAny(accountId, contactRecord.id)` (~linha 708); e em `handleStatusUpdate`, após o espelho de `broadcast_recipients`.

**Interfaces:**
- Consumes: Task 2 (`isOptoutMessage`); `engineSendText` de `@/lib/automations/meta-send` para a confirmação.
- Produces:
  - `handleReactivationInbound(db, {accountId, contactId, conversationId, text: string|null, configOwnerUserId, now}, deps: {sendText: typeof engineSendText; dryRun: boolean}): Promise<'opted_out'|'replied'|'none'>`. Sempre atualiza `contacts.last_inbound_at = now`. Saída só se houver inscrição `pending|active` ou send nos últimos 30 dias. Na saída: `do_not_contact=true`, `do_not_contact_source='reativacao_sair'`, inscrições ativas → `opted_out` + `ended_at`, envia `optout_reply` (dry-run: insere `bot` com `dryrun-`). Senão, inscrição `active` com `current_step ≥ 1` → `replied` + `replied_step`; com `current_step = 0` → `cancelled` / `returned_before_send`.
  - `mirrorReactivationStatus(db, waMessageId: string, status: string): Promise<void>` — atualiza `reactivation_sends.status` para `delivered|read|failed`, sem regredir (`read` não volta a `delivered`).
- Ambas são best-effort no webhook: `try/catch` + `console.error`, como `flagBroadcastReplyIfAny`.

- [ ] **Step 1: Testes que falham:**
  - `'Sair'` com inscrição ativa → `opted_out`, `do_not_contact` true, `sendText` chamado com o texto padrão.
  - `ignores optout without recent reactivation`: `'SAIR'` sem inscrição e sem send recente → `'none'`, `do_not_contact` intacto, `sendText` não chamado.
  - `'oi'` com inscrição no step 2 → `replied`, `replied_step = 2`.
  - `last_inbound_at` atualizado em todos os casos.
  - `mirrorReactivationStatus('read')` seguido de `'delivered'` → fica `read`.
- [ ] **Step 2:** falha. **Step 3:** implementar e ligar no webhook. O texto vem do conteúdo já parseado em `processMessage`; mensagens não-texto passam `null`. **Step 4:** passa + `npx vitest run src/app/api/whatsapp` + typecheck.
- [ ] **Step 5: Commit** `feat(reativacao): resposta, saída e status pelo webhook`.

### Task 6: `do_not_contact` nos broadcasts

**Files:**
- Modify: `src/components/broadcasts/step2-select-audience.tsx` (query de contatos ~linha 196: `.eq('do_not_contact', false)`; texto "N contatos não querem receber campanhas e foram excluídos")
- Modify: `src/lib/whatsapp/broadcast-core.ts`: ao planejar destinatários, contato com `do_not_contact` gera a linha de recipient `failed` com `error_message = 'opted_out'`, sem enviar.
- Test: `src/lib/whatsapp/broadcast-core.test.ts` (caso novo)

- [ ] **Step 1:** teste `skips do_not_contact recipients` falhando (`sendTemplateMessage` não chamado para esse contato e recipient `failed`/`opted_out`).
- [ ] **Step 2–4:** implementar; teste + suíte `src/lib/whatsapp` passam; typecheck.
- [ ] **Step 5: Commit** `feat(reativacao): broadcasts respeitam do_not_contact`.

### Task 7: Telas

**Files:**
- Modify: `src/components/layout/sidebar.tsx`: item `{ href: "/reactivation", labelKey: "reactivation", icon: RotateCcw }` logo após `/broadcasts`. Rótulo em `Nav`/sidebar dos dois JSON: "Reativação" / "Reactivation".
- Modify: `src/middleware.ts`: incluir `/reactivation` onde `/broadcasts` aparece como rota protegida.
- Create: `src/app/(dashboard)/reactivation/page.tsx`: painel com cards por faixa, tabela de inativos, filtros de faixa/etiqueta, botão "Criar campanha com este filtro".
- Create: `src/app/(dashboard)/reactivation/campaigns/page.tsx`: lista.
- Create: `src/app/(dashboard)/reactivation/campaigns/new/page.tsx` + `src/components/reactivation/campaign-wizard.tsx`: 3 passos (Público → Toques → Revisão); "Aprovar e iniciar" chama `action: approve`.
- Create: `src/app/(dashboard)/reactivation/campaigns/[id]/page.tsx`: relatório (spec 5.6): contagens, inscrições com status e link `/inbox?conversation=<id>`, botões pausar/retomar/encerrar, aviso `pause_reason`. Polling de 5 s enquanto `active`, como `broadcasts/page.tsx`.
- Create: `src/app/(dashboard)/reactivation/settings/page.tsx`: campos de `reactivation_settings`.
- Modify: `messages/pt-BR.json`, `messages/en.json`: namespace `Reactivation`.

Padrão: client components com `useTranslations`, `useCan`/`GatedButton` para ações de admin, componentes de `src/components/ui/*`. Visual igual a Broadcasts. Rótulos de faixa: Atrasado / Esfriando / Sumido. Motivos de exclusão: "Pediu para sair", "Telefone inválido", "Já está em outra campanha", "Descansando", "Recebeu mensagem nos últimos 7 dias", "Removido por você".

- [ ] **Step 1:** implementar as páginas.
- [ ] **Step 2:** `npm run typecheck && npm run lint` limpos.
- [ ] **Step 3: Verificação no navegador** (dev local, admin): menu "Reativação" aparece; painel carrega sem erro no console; o assistente bloqueia o avanço sem template aprovado.
- [ ] **Step 4: Commit** `feat(reativacao): telas de painel, campanhas, assistente, relatório e ajustes`.

### Task 8: Selo na ficha do contato

**Files:**
- Modify: `src/components/contacts/contact-detail-view.tsx`: selo "Não quer receber campanhas" quando `do_not_contact`, e switch admin que chama `PUT /api/contacts/[id]/do-not-contact` (Task 3).
- Modify: `messages/pt-BR.json`, `messages/en.json`.

- [ ] **Step 1:** implementar. **Step 2:** typecheck/lint. **Step 3:** no navegador, marcar e desmarcar um contato; conferir no Studio `do_not_contact_source = 'manual'`. **Step 4: Commit** `feat(reativacao): marcação de não contatar na ficha`.

### Task 9: Ponta a ponta em modo simulado + registro

**Files:**
- Modify: `.env.development.local` (não versionado): `REACTIVATION_DRY_RUN=true`, `AUTOMATION_CRON_SECRET=dev-secret` se faltar.
- Modify: `.env.local.example`: documentar `REACTIVATION_DRY_RUN`.
- Modify: `IMPLANTACOES.md` (entrada nova no topo, no modelo do arquivo).

- [ ] **Step 1: Seed local via SQL** (Studio/psql): 1 template `APPROVED` só com `{{1}}` no corpo; 4 contatos com conversas e `last_inbound_at` de 35, 70, 130 e 10 dias; um deles `do_not_contact`.
- [ ] **Step 2:** no navegador, criar campanha (faixas todas, 2 toques, `wait_days` 1) → revisão mostra 2 elegíveis, 1 excluído "Pediu para sair" e o de 10 dias fora. Aprovar.
- [ ] **Step 3:** `curl -H "x-cron-secret: dev-secret" localhost:3000/api/reactivation/cron` (num horário dentro da janela, ou com a janela ampliada nos Ajustes) → `{"sent":2,...}`. As mensagens aparecem no inbox como bot.
- [ ] **Step 4:** simular a resposta de um contato com POST de payload de webhook assinado (ou chamada direta a `handleReactivationInbound` num script `npx tsx`). Inscrição `replied`. Rodar o cron de novo com `next_run_at` adiantado → só o outro recebe o toque 2 → `completed` → campanha `finished`.
- [ ] **Step 5:** suíte completa `TZ=UTC LC_ALL=en_US.UTF-8 npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, tudo verde.
- [ ] **Step 6:** escrever a entrada em `IMPLANTACOES.md`; commit `docs: registra implantação da reativação`. Merge local em `main` só após o OK do Samuel. Sem push.
