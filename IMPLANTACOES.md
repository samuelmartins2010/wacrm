# Registro de implantações (Clientizza)

Registro de tudo que for implantado no sistema, da mais recente para a mais antiga.
Cada entrada lista o que foi feito, os arquivos/migrations, como testar e as pendências.

Modelo de entrada:

```
## AAAA-MM-DD: <título>
- **Origem:** (ex.: features/reativacao-de-clientes-inativos, pedido do Samuel)
- **O que mudou:**
- **Banco (migrations):**
- **Arquivos principais:**
- **Como testar:**
- **Commit/branch:**
- **Pendências / riscos:**
```

---

## Para religar a VPS

Checklist para tirar a produção da pausa (VPS + Supabase cloud). Siga na ordem; cada item diz onde conferir.

1. **Migrations 040–056 antes de subir o código.**
   - Rodar no SQL Editor do Supabase cloud (projeto `crm`), **uma por vez e na ordem** do `docs/deploy-migrations-040-055.md` (o guia cobre 040–056), com o cron pausado.
   - **Onde conferir:** depois de cada migration, rodar a consulta de verificação da tabela do guia; ela tem que voltar `true`. Se alguma falhar, seguir o "plano se falhar" do guia e **não** subir o código novo.
   - Só depois de a 056 passar, subir o código do `main` na VPS.

2. **Pinger chamando os 3 crons a cada 5 min**, todos com o header `x-cron-secret: <AUTOMATION_CRON_SECRET>`:
   - `/api/automations/cron`. Se faltar, as automações paradas num passo **Aguardar** nunca continuam, e eventos de `tag_added`/`conversation_assigned` que não foram tratados na hora (rede de segurança do D3) nunca disparam.
   - `/api/flows/cron`. Se faltar, quem abandona um fluxo no meio fica com uma execução `active` para sempre. Ela só se encerra quando o contato manda outra mensagem (F8), e até lá bloqueia novos gatilhos de fluxo para esse contato e faz a Reativação adiar os toques dele (D11).
   - `/api/reactivation/cron`. Se faltar, **nenhum toque da Reativação é enviado**: as campanhas ficam paradas com inscrições pendentes e as sem inscrições abertas não são encerradas.
   - **Onde conferir:** `curl -i -H "x-cron-secret: …" https://clientizza.com/api/<rota>/cron` responde 200 para as três (sem o header, 401); no painel do pinger, as três chamadas aparecem a cada 5 min com status 200.

3. **Webhook da Meta apontando para a VPS.**
   - Em Meta for Developers → app do WhatsApp → **WhatsApp → Configuração** → Webhook: URL de retorno `https://clientizza.com/api/whatsapp/webhook` e o **Token de verificação** igual ao salvo no Clientizza (Configurações → WhatsApp → "Token de verificação do webhook"). Assinar o campo `messages`.
   - `META_APP_SECRET` precisa estar no env da VPS (Meta → Configurações do app → Básico → Chave secreta do app); sem ele o webhook recusa toda mensagem.
   - `REACTIVATION_DRY_RUN` **não** pode estar ligado em produção (nem `WHATSAPP_TEMPLATES_DRY_RUN`): conferir no env da VPS que não existem ou não valem `true`. Com eles ligados, nada sai para a Meta e o sistema finge que enviou.
   - **Onde conferir:** o botão "Verificar e salvar" da Meta aceita a URL; mandar "oi" de um número próprio e a mensagem aparece no inbox.

4. **Teste da Reativação com WhatsApp real.** Uma campanha com 2–3 números próprios, com o template `volta_cliente` aprovado:
   - **Envio:** o toque chega no WhatsApp e aparece no inbox como mensagem automática.
   - **Resposta:** um número responde "oi" e a inscrição vira respondida, sem novo toque.
   - **SAIR:** um número manda "SAIR" e recebe **só** a confirmação (sem automação nem I.A); o contato fica com "não contatar".
   - **Número sem WhatsApp:** incluir um número que não tem WhatsApp; o envio falha com o código da Meta (131026) gravado e a inscrição fica `failed`, sem retentativa.
   - **Onde conferir:** tela Reativação → relatório da campanha (enviados, respostas, saídas, falhas) e a ficha de cada contato (selo de não contatar).

---

## 2026-11-23: Inbox com filtros, nota interna e transferência com observação
- **Origem:** item 1 do Grupo A (spec `docs/superpowers/specs/2026-11-19-inbox-filtros-transferencia-design.md`, plano `docs/superpowers/plans/2026-11-19-inbox-filtros-notas-transferencia.md`), com os ajustes A, C, D, E, G e H do Samuel.
- **O que mudou:**
  - **Filtros rápidos** Todas / Minhas / Sem dono / Aguardando / Não lidas, com contadores, aplicados no banco (a lista lê até 1.000 conversas) e mantidos em tempo real; Status (Abertas/Pendentes/Fechadas) separado; filtro lembrado no navegador.
  - **Aguardando** = desde quando o cliente espera resposta **humana**: só a resposta de um atendente zera; I.A, automação, fluxo e API v1 não zeram; resposta que falha devolve a espera; encerrar zera. Tempo de espera na linha (até 15 min neutro, até 1 h amarelo, depois vermelho) e "Aguardando" ordena por quem espera há mais tempo.
  - **Selos** "🤖 I.A atendendo" (mesma regra que o auto-reply usa) e "🤖 Fluxo em andamento" (execução ativa e não vencida); nunca em conversa encerrada.
  - **Nota interna** no composer (aba amarela, até 2.000 caracteres, só a equipe vê) e **linha do tempo** com notas, atribuições, transferências, remoções, "reaberta pelo cliente" e responsável tirado pelo sistema.
  - **Transferir com observação:** escolher um membro abre o diálogo (destino no título); nota + troca na mesma transação; o novo responsável vê o início da observação na notificação. Fluxo, I.A, banner da I.A ("Assumir"/"Retomar I.A"), automação e atribuição em massa também registram a troca.
  - **Regras do responsável:** só dono/admin/atendente da conta (nunca de outra conta nem só visualização); mensagem do cliente numa conversa encerrada **reabre** a conversa e começa a espera (responsável que saiu ou só visualiza → Sem dono); remover um membro ou mudar o papel para só visualização devolve as conversas abertas dele para Sem dono; o handoff da I.A não passa por cima de quem acabou de assumir; o responsável **só muda junto com um evento** (UPDATE direto é recusado, inclusive para service role).
- **Banco (migrations):** `057_inbox_awaiting` (`awaiting_since`, `closed_at`, `sent_via_api`, triggers, `inbox_filter_counts()`), `058_conversation_events` (tabela + RLS só leitura para membros + funções `transfer_conversation`, `add_conversation_note`, `record_assignment_event`), `059_conversation_assignee_rules` (validação do responsável, reabertura pelo cliente, perda de acesso, `p_only_if_unassigned`), `060_conversation_assignee_event_only` (trava). Nenhuma apaga dados; 057 faz backfill da espera.
- **Arquivos principais:** `src/lib/inbox/` (`filters`, `badges`, `timeline`, `notes`, `transfer`), `src/components/inbox/` (`conversation-list`, `message-thread`, `conversation-event`, `note-composer`, `transfer-dialog`), `src/hooks/use-inbox-counts.ts`, `src/hooks/use-inbox-badges.ts`, `src/lib/ai/auto-reply.ts`, `src/lib/flows/engine.ts`, `src/app/api/ai/autoreply/[conversationId]/route.ts`, `src/lib/automations/{engine,references}.ts`, `src/app/api/v1/messages/route.ts`.
- **Como foi testado:**
  - Suíte: vitest 1005/1005, typecheck, lint (0 erros), i18n:check, pgTAP 14 arquivos / 193 asserts (cada regra nova com teste que falhou antes), build.
  - Revisões independentes (subagente) das tarefas 2, 5 e 8: aprovadas com ajustes, todos feitos.
  - Ponta a ponta local (23/11/2026; dev com proxy falso da Meta e da OpenAI, saída externa bloqueada, `REACTIVATION_DRY_RUN=true`): webhook assinado de contato novo → conversa em Aguardando e Sem dono, contadores subiram sem recarregar, selo da I.A; I.A respondeu pelo proxy e a API v1 mandou mensagem → continuou em Aguardando; contato em fluxo com o selo de fluxo; atendente respondeu pelo Inbox → saiu de Aguardando e o contador caiu sem recarregar; nota interna apareceu sem nenhuma chamada à Meta e sem mudar a última mensagem; transferência com observação para outra atendente → linha + nota, notificação com o texto e automação "conversa atribuída" rodou (etiqueta aplicada). Dados apagados; banco de volta à base (4 contatos / 4 conversas / 7 mensagens).
- **Commit/branch:** `feat/inbox-filtros-notas`, PR #7.
- **Pendências / riscos:**
  - Ao implantar: aplicar 057–060 em ordem (o backfill da 057 calcula a espera das conversas existentes).
  - Conversas que hoje têm responsável de outra conta ou só visualização continuam como estão até a próxima troca (a 059 só valida mudanças).
  - Acabamentos da revisão da tarefa 8 não feitos: contador de caracteres conta em UTF-16 (mais restritivo que o banco com emojis), o diálogo esvazia antes da animação de fechar, classificação de erro depende do texto da mensagem do banco (fixado pelos testes pgTAP).
  - Visto no ponta a ponta, já existia antes: eventos de "conversa atribuída" que ficaram na fila são processados por uma automação ativada depois deles; o painel do contato não atualiza etiquetas em tempo real.
  - Lista de fluxos ativos do selo lê até 1.000 execuções.

---

## 2026-11-19: Transmissões com mais de 1.000 contatos e mais de 50 por minuto
- **Origem:** bug "Todos os contatos" sem paginação (pedido do Samuel), branch `fix/broadcast-paginacao`.
- **O que mudou:**
  - **Paginação.** O Supabase corta toda resposta em 1.000 linhas sem avisar (`max_rows`). O envio lia o público e os destinatários de uma vez só, então só os primeiros 1.000 recebiam. Pior: a lista de quem tem etiqueta excluída também era cortada, e quem passava do milésimo **recebia** mesmo estando excluído. Agora toda leitura é paginada (ordem estável por id) e toda busca por lista de ids/telefones (etiquetas, campo personalizado, CSV) vai em lotes de 200.
  - **Limite da rota.** `/api/whatsapp/broadcast` aceitava 5 chamadas/min por usuário, mas o assistente faz uma chamada por lote de 10 contatos a cada segundo: do 6º lote em diante tudo voltava 429 e era marcado "falhou" (na prática, só uns 50 contatos recebiam). O limite foi para 90/min (o assistente faz ≤ 60) e, se vier 429 mesmo assim, o assistente espera o tempo pedido e reenvia o mesmo lote (até 3 vezes).
  - Quem pediu para sair continua de fora: o filtro do servidor (`loadOptedOut`, já paginado) não mudou.
- **Banco (migrations):** nenhuma.
- **Arquivos principais:** `src/lib/broadcasts/audience-query.ts` (novo), `src/lib/broadcasts/send-batch.ts` (novo), `src/hooks/use-broadcast-sending.ts`, `src/lib/broadcasts/audience-count.ts` (usa os mesmos ajudantes), `src/lib/rate-limit.ts`.
- **Como testar:** `npx vitest run src/lib/broadcasts src/lib/rate-limit.test.ts` (banco falso que corta em 1.000 linhas e recusa `in` grande; 429 seguido de 200). Ponta a ponta local feito em 2026-11-19: ver o PR.
- **Commit/branch:** `fix/broadcast-paginacao`.
- **Pendências / riscos:** o envio continua rodando no navegador (fechar a aba no meio interrompe; já era assim). O limitador é em memória por processo (ok para a VPS única).

---

## 2026-11-19: Reativação não espera fluxo vencido (D11 + F8)
- **Origem:** pedido do Samuel depois do PR #2.
- **O que mudou:** na rechecagem antes do envio (D11), um `flow_run` ativo que já passou do `on_timeout_hours` do fluxo (padrão 24 h) **não adia** o toque: é a mesma regra do F8, que já trata essa execução como abandonada quando chega mensagem nova. Se o contato tiver ao menos uma execução ainda dentro do prazo, o toque continua adiado. A execução vencida não é encerrada pela Reativação; quem encerra continua sendo o `/api/flows/cron` ou a próxima mensagem do contato (F8).
- **Banco (migrations):** nenhuma.
- **Arquivos principais:** `src/lib/flows/fallback.ts` (`isFlowRunStale`, regra única usada pelo F8 em `engine.ts` e pelo D11), `src/lib/reactivation/runner.ts` (`getActiveFlowRuns` no lugar de `hasActiveFlowRun`), `src/lib/reactivation/supabase-store.ts` (busca `last_advanced_at` + `flows(fallback_policy)`).
- **Como testar:** `TZ=UTC npx vitest run src/lib/reactivation/runner.test.ts src/lib/flows/fallback.test.ts`. O teste do fluxo vencido falhou antes da correção (`deferred` = 1). Vitest 942/942, tsc e lint ok.
- **Commit/branch:** PR #3 (`fix/d11-fluxo-vencido`), mergeado em 19/11/2026 (merge `c904aa6`).
- **Teste no banco local (19/11/2026, `main` c904aa6, dev com `REACTIVATION_DRY_RUN=true` e saída externa bloqueada):** fluxo com `on_timeout_hours` = 2; Ana com execução parada há 3 h e Carla (controle) parada há 5 min, as duas com toque devido. `GET /api/reactivation/cron` → `{sent:1, deferred:1}`: o toque da Ana saiu (envio `sent`, mensagem `bot` no inbox, inscrição `completed`) e o da Carla ficou adiado para a rodada seguinte. A execução vencida da Ana continuou `active`, como previsto. Dados do teste apagados e `last_message_at`/`updated_at` da conversa da Ana restaurados do backup de 18/11; banco de volta à base (4 contatos / 4 conversas / 7 mensagens).
- **Pendências / riscos:** nenhuma específica.

---

## 2026-11-19: API individual dispara (D12), funis em português, ficha do contato e selo Beta
- **Origem:** pedido do Samuel na revisão do PR #2.
- **Decisão D12:** criar UM contato pela API v1 (`POST /api/v1/contacts`) com etiquetas **dispara** `tag_added`, como mudança individual. Silenciosos (D10) continuam só a importação CSV, a ação **Etiquetar** em lote e a atribuição em lote.
- **O que mudou:**
  - `0feb895` (D12): o `POST` grava as etiquetas como mudança individual; saiu a opção `bulk` de `setContactTags`, que ficou sem uso.
  - `fefd670` (funis): o funil padrão ("Funil de vendas": Novo lead, Qualificado, Proposta enviada, Negociação, Ganho) e as etapas de todo funil criado em "Adicionar funil" vêm do next-intl, no idioma da tela (antes eram fixos em inglês no código). "Gerenciar funis" aparece só para admin; o salvar confere a linha gravada (para um agente o RLS devolvia "0 linhas, sem erro" e a tela dizia "Funil salvo"). O botão "Excluir funil" tinha texto vermelho sobre fundo vermelho. A data do cartão do negócio segue o idioma, e as instruções de arrastar (leitores de tela) foram traduzidas.
  - `d86a7bb` + `85894ae` (ficha do contato): chave `Contacts.detailView.tabs.tags` (Etiquetas/Tags) e rótulo **Nome** (o campo do nome aparecia como "Empresa": `t('company', { fallback })` não faz fallback no next-intl). As abas quebram linha sem cobrir os campos; nome, e-mail e empresa com reticências e o texto completo ao passar o mouse; toast de erro de modelo traduzido. Novo `npm run i18n:check` (`scripts/check-i18n-keys.mjs`) lista chaves usadas no código e ausentes em pt-BR/en.
  - `e1715d9`: saiu o selo "Beta" de Fluxos (menu lateral e página), com a prop `beta` e as chaves `Sidebar.beta`/`Flows.list.beta`.
- **Banco local:** funil e etapas com o nome padrão exato em inglês convertidos para português (nomes personalizados não foram tocados). Produção não tem funis.
- **Esta branch também criou** a ação **Etiquetar** em lote na barra de seleção de Contatos (não existia; ver D10).
- **Como foi testado:** D12 ponta a ponta: 50 importados (CSV) + 50 em lote → 0 execuções; `POST` de 1 contato com a etiqueta → 1 execução. Capturas antes/depois a 1280 e 1440 px de /pipelines, "Gerenciar funis", ficha do contato e /flows.
- **Pendências:** `npm run i18n:check` aponta 1 chave fora destas telas (`Automations.builder.delete`); chamadas com chave dinâmica e `t` recebido por prop não são verificadas pelo script.

## 2026-11-18: Operações em massa sem gatilho (D10), toque adiado em fluxo (D11) e replay das migrations
- **Origem:** pedido do Samuel após as correções de Automações e Fluxos.
- **Decisões:**
  - **D10:** operações em massa NÃO geram `tag_added`/`conversation_assigned`: importação de contatos (CSV ou API), etiqueta aplicada a vários contatos de uma vez e atribuição em lote. Só mudanças individuais disparam.
  - **D11:** o runner da Reativação adia o toque (para a próxima rodada) enquanto o contato tiver `flow_run` ativo, na rechecagem que já existia antes do envio.
- **O que mudou:**
  - `477988a` (D10): migration 056 — os triggers da 055 respeitam `app.automation_events='off'`, ligado só dentro da transação pelas funções `contact_tags_insert_bulk` (importação), `contacts_bulk_add_tag` (lote) e `conversations_bulk_assign` (lote; ainda sem tela). Importação CSV e (até o D12) `POST /api/v1/contacts` gravam etiquetas pela função de massa; `PATCH /api/v1/contacts/[id]`, a ficha, o formulário, fluxos e automações continuam disparando. Nova ação **Etiquetar** na barra de seleção de Contatos (antes só havia excluir).
  - `9df736c` (D11): `hasActiveFlowRun` no store do runner; com fluxo ativo a inscrição volta a vencer na próxima rodada.
  - `0de6c71`: `docs/deploy-migrations-040-055.md` — ordem, verificação por migration (040–056) e plano se falhar.
- **Banco (migrations):** 056_automation_events_bulk_silent.
- **Replay feito (18/11/2026):** `pg_dump` completo em `~/Developer/wacrm-secrets/local-backup-2026-11-18.sql` (+ dump só de dados `local-data-2026-11-18.sql`, ambos 600); `npx supabase db reset` aplicou 001→056 em ordem sem erro; `supabase test db` passou no banco novo (58 asserts); dados restaurados (admin local, 4 contatos aaaaaaaa, template volta_cliente) e login confirmado por sessão real do Supabase Auth.
- **Como foi testado:** vitest 933/933, pgTAP 58, tsc e build ok. Ponta a ponta (proxy da Meta, crons via curl): 40 importados pelo código do import-modal + 10 pela API v1 + 50 em lote com a etiqueta T e automação `tag_added(T)` ativa → 0 eventos, 0 execuções; T em 1 contato pela ficha → 1 execução; loop A7 L1→L2→L3 continua cortado na profundidade 2. D11: contato no menu do fluxo + toque devido → adiado, nada enviado; fluxo encerrado (tempo esgotado) → toque saiu na rodada seguinte (dry-run).
- **Pendências / riscos:**
  - Comportamento esperado (não é pendência): se o contato termina o fluxo **respondendo**, a resposta conta como "voltou antes do envio" e o toque é cancelado.
  - Atribuição em lote não tem tela; a função `conversations_bulk_assign` já respeita o D10.
  - API v1 não tem rota de etiqueta em lote. (O `POST` passou a disparar pelo D12, entrada acima.)

## 2026-11-18: Correções de Automações e Fluxos
- **Origem:** auditorias de Automações e de Fluxos (17/11) + decisões de produto do Samuel (D3–D9).
- **Decisões de produto:**
  - **D3:** `conversation_assigned` e `tag_added` passam a disparar (atribuição e etiqueta feitas pela tela, pela API e por passos de automação/fluxo). `time_based` sai da tela de criação (o tipo continua no banco); automações antigas com ele mostram aviso.
  - **D4:** contato que responde durante um wait cancela o restante da automação, por padrão. Opção por automação "Continuar mesmo se o contato responder" (padrão desligada).
  - **D5:** palavra-chave ignora maiúsculas e acentos; "contém" casa palavra inteira; "exata" ignora pontuação e espaços nas pontas. Vale para automações e fluxos.
  - **D6:** várias automações com o mesmo gatilho rodam todas, em ordem garantida (`created_at`); a lista avisa quando há duplicidade.
  - **D7:** depois de um handoff (nó handoff, fallback esgotado ou nó removido), I.A e automações de conteúdo (`new_message_received`, `keyword_match`, `interactive_reply`) ficam em silêncio naquela conversa até ela ser encerrada/reaberta.
  - **D8:** salvar fluxo ativo revalida; se inválido, 422 e nada é gravado. A troca de nós é atômica. Execução cujo nó atual sumiu → handoff com evento `node_removed`.
  - **D9:** `collect_input` aplica a validação (e-mail, telefone, regex); resposta inválida reenvia a pergunta (2 tentativas, depois atendente).
- **O que mudou (um commit por item, branch `fix/automacoes-fluxos`):**
  - F1 `3334b10` ciclo sem espera bloqueado na validação + no máximo 10 mensagens por avanço (antes: 63).
  - F2 `67c4393` D8. F3 `b67a525` D9 (campo "Validar resposta" no nó). F4 `ba8dc95` `{{vars.x}}`/`{{ vars.x }}` em botões, listas e nota do handoff; aviso de variável inexistente.
  - F5 `0784f01` D7. F6 `437ae97` falha avisada pelo webhook de status (ex.: 131053) vira evento `error/delivery_failed` na execução.
  - F7 `1548ffa` limite de upload por tipo (imagem 5 MB, vídeo/áudio 16 MB, documento 100 MB), erro na tela antes do envio.
  - F8 `5375274` execução ativa vencida é encerrada (`timed_out`/`stale_on_inbound`) pelo novo inbound, sem depender do cron.
  - F9 `08bd371` frase do 422 de ativação em pt-BR/en, título "Fluxos" no header, datas e duração no idioma da tela.
  - A1 `2431e0c` D4 + uma execução por automação/contato. A2 `0c6f328` automação desativada/apagada não retoma.
  - A3 `0194ce0` `time_of_day` no fuso da conta (`accounts.timezone`, padrão America/Sao_Paulo).
  - A4 `82cb9e2` wait dentro de condição pausa tudo; log "Aguardando". A5 `6c67688` erro em ramo interrompe e grava failed.
  - A6 `6021c76` passos conferem a gravação (etiqueta/funil/etapa/agente/campo) e a tela recusa referência inexistente ao salvar.
  - A8 `3e99f8c` D5. A9 `19cae2a` D6. A7 `dd4a0fd` D3 com proteção contra loop (profundidade 1).
- **Banco (migrations):** 048 `replace_flow_nodes` + evento `node_removed`; 049 `conversations.bot_handoff_at` + trigger; 050 índice do wamid nos eventos; 051 buckets de mídia 100 MB; 052 `continue_on_reply`, status `cancelled`, uma espera aberta por automação/contato; 053 `accounts.timezone`; 054 status `waiting` no log; 055 `automation_trigger_events` + triggers em `contact_tags`/`conversations` + RPCs `automation_add_tag`, `automation_assign_conversation`, `claim_automation_trigger_events`.
- **Arquivos principais:** `src/lib/flows/{engine,validate,save,collect-validation,vars,delivery,run-dates}.ts`, `src/lib/automations/{engine,references,duplicates,ping}.ts`, `src/lib/keywords.ts`, `src/app/api/whatsapp/webhook/route.ts`, `src/app/api/flows/[id]/route.ts`, `src/app/api/automations/events/route.ts`, `src/app/api/automations/cron/route.ts`.
- **Como foi testado:** vitest 927/927 (TZ=UTC), pgTAP 51 asserts (7 arquivos), tsc e build ok. Ponta a ponta com webhook assinado, proxy local imitando a Meta (nada saiu da máquina; só 2 consultas do Next ao npm, bloqueadas), crons via curl e dev em TZ=UTC; resultado por item no relatório da tarefa. Limpeza conferida: base 4 contatos / 4 conversas / 7 mensagens.
- **Pendências / riscos:**
  - Convivência Reativação × fluxo (C1): resposta a um toque de quem está no meio de um fluxo caía no fluxo, que reenviava o menu → evitado pelo D11 (o toque não sai enquanto há fluxo ativo).
  - Não há tela para mudar o fuso da conta (`accounts.timezone` só no banco/API).
  - ~~Importação de contatos com etiqueta dispara `tag_added`~~ → resolvido pelo D10 (entrada acima).
  - As mensagens de erro da validação de automações (`validate.ts`, `references.ts`) seguem em inglês, como já eram.
  - ~~Sem `supabase db reset` completo~~ → replay feito (entrada acima).

## 2026-11-17: Reativação: SAIR sem resposta dupla, trava da inscrição e .env do Mac
- **Origem:** relatório de verificação (SAIR recebia confirmação + resposta da automação/I.A; trava da inscrição contava do início da rodada) e pedido do Samuel de separar as chaves de produção do Mac.
- **O que mudou:**
  - `b171107`: **SAIR recebe só a confirmação.** `handleReactivationInbound` devolve `{ outcome, consumed }`; quando trata um pedido de saída (`consumed`), o webhook não chama fluxos, nenhum gatilho de automação (nem `first_inbound_message`/`new_contact_created`) e nem a I.A para essa mensagem. A mensagem continua no inbox e o `message.received` continua indo para os webhooks externos. Resposta comum ("oi") e reação ficam como estavam. As regras estão em `src/lib/whatsapp/inbound-plan.ts` (testadas).
  - `92b1e3a`: **trava da inscrição conta do momento do claim** (início da rodada + tempo já decorrido), não do início da rodada: travada aos 7:59 de rodada → válida até ~17:59.
- **Como foi testado:** webhook assinado com saída externa bloqueada (proxy inexistente). Cenário A (automação `new_message_received` + I.A) e B (só I.A): SAIR → 1 mensagem (a confirmação), sem tentativa de automação/I.A, `message.received` disparado; "oi" → automação (A) / I.A (B) tentam responder normalmente; reação → nada além da inscrição. Antes: SAIR gerava 2 respostas.
- **Testes:** 837/837 no vitest + 33 asserts em pgTAP; typecheck e build ok.
- **Esquema de .env no Mac (desde 17/11/2026):**
  - `~/Developer/wacrm/.env.development.local` → `npm run dev` (Supabase local, segredos de dev, `REACTIVATION_DRY_RUN=true`).
  - `~/Developer/wacrm/.env.production.local` → `npm run build` / `npm start` no Mac, **cópia do de dev** (também banco local). O build mostra `Environments: .env.production.local` e não contém nenhuma referência ao projeto da nuvem.
  - **Não existe mais `.env.local` no repo.** As chaves de produção foram movidas (não apagadas) para `~/Developer/wacrm-secrets/env.production.backup` (fora do repo, permissão 600). Todos os `.env*` são ignorados pelo git (exceto os `*.example`).
  - `~/Developer/wacrm-final` não tem nenhum `.env` com chaves (só os `.example`).
- **Commit/branch:** `feat/reativacao`, PR #1 aberto.
- **Pendências / riscos:** as do registro anterior continuam (timeout ambíguo da Meta, crash entre a Meta aceitar e o banco gravar, gancho do webhook que falha só gera log). Chamadas ao Supabase continuam sem timeout: se o banco travar mais de ~7 min, a trava da rodada (15 min) pode vencer com a rodada ainda trabalhando.

## 2026-11-17: Reativação: correções da verificação
- **Origem:** relatório de verificação do módulo (anti-objetivos, concorrência, fuso, RLS, envio real) e decisões de produto do Samuel.
- **Decisões de produto:**
  - **D1:** reação com emoji a um toque de reativação **conta como resposta**: a inscrição vira `replied` e os próximos toques são cancelados.
  - **D2:** "Não quer receber campanhas": **agent pode marcar** (a pedido do cliente); **só admin desmarca**. Toda mudança grava quem fez e quando.
- **O que mudou (um commit por item):**
  1. `1aa2a8b`: **falha avisada depois do envio** (webhook de status `failed`) segue as mesmas regras do erro imediato: 131026/131030 → inscrição `failed` e sequência encerrada; template indisponível → campanha pausada e toque recolocado na fila; 131049 e temporários → mesma retentativa (+1 dia, até 2 tentativas). Código e mensagem da Meta gravados em `reactivation_sends`. Antes, a sequência seguia e terminava `completed`.
  2. `98c3d3c`: **código do erro da Meta**: `throwMetaError` lança `MetaApiError` com `code`/`subcode`; `classifySendError` decide pelo código e usa o texto só como reserva.
  3. `2e845b7`: **`do_not_contact` protegido no banco (D2)**: trigger em `contacts` (agent só marca; desmarcar exige admin; `do_not_contact_at/_source/_by` carimbados pelo banco). Rota e botão da ficha seguem o papel.
  4. `86ce626`: **broadcasts** excluem `do_not_contact` pelo `contact_id` (o painel passa a enviá-lo) e, quando só há telefone, por todas as formas do número (0 do DDD + 9º dígito). Painel e API v1 usam o mesmo filtro.
  5. `58879bc`: **uma rodada do cron por vez** (trava com prazo no banco; rodada concorrente sai com `locked: true`) e **timeout de 15 s** na chamada à Meta. Com 5 crons simultâneos o limite diário é respeitado (antes: 80 envios com limite 50).
  6. `c885775`: **reações (D1)**: o webhook trata a reação antes de sair; continua sem disparar fluxos, automações ou I.A.
  7. `332b4f6`: **uma campanha aberta por contato**: índice único parcial; a aprovação trata a violação como "já está em outra campanha" (400, nunca 500).
  8. `eadcd58`: **aprovação não pode ser pulada**: pelo client, admin só cria/edita/apaga rascunhos e nunca muda status; ativar/pausar/retomar/encerrar e ajustes só pela API. Limite diário máximo 1000 (API e banco).
  9. `8c70240`: menores: (a) pausar/encerrar vale na hora, no meio da rodada; (b) corrida no registro da tentativa pula o item em vez de derrubar a rodada; (c) `automations/cron`, `flows/cron` e `reactivation/cron` comparam o segredo em tempo constante (`src/lib/cron-auth.ts`).
- **Os 7 pontos menores da revisão final (antes só citados) e o que foi feito:**
  1. Adiamentos sem condição e limite diário contado por rodada (crons sobrepostos estouravam o limite) → **corrigido** no item 5 (trava de rodada).
  2. Nada no banco impedia o mesmo contato em duas campanhas abertas → **corrigido** no item 7.
  3. Corrida no registro da tentativa abortava a rodada inteira → **corrigido** no item 9b.
  4. Agent desmarcava o `do_not_contact` pelo RLS e não ficava registrado quem → **corrigido** no item 3 (D2).
  5. O broadcast do painel comparava o telefone exato, sem variações → **corrigido** no item 4.
  6. Pausar/encerrar não interrompia uma rodada em andamento → **corrigido** no item 9a.
  7. Reação a um toque não contava como resposta → **corrigido** no item 6 (D1).
- **Banco (migrations):** `043_reactivation_send_error_code.sql`, `044_contacts_do_not_contact_guard.sql`, `045_reactivation_run_lock.sql`, `046_reactivation_one_open_per_contact.sql`, `047_reactivation_campaign_rls_draft_only.sql`.
- **Testes:** 827/827 no vitest (`TZ=UTC LC_ALL=en_US.UTF-8 npx vitest run`) + 33 asserts em pgTAP (`npx supabase test db`, pasta `supabase/tests/`). Typecheck e build ok.
- **Como testar (local):** igual à entrada abaixo. As respostas foram testadas pelo webhook real e assinado (texto, "Sair.", reação 👍, status `failed` 131026), com um `whatsapp_config` temporário.
- **Commit/branch:** branch `feat/reativacao`, PR #1 aberto (https://github.com/samuelmartins2010/wacrm/pull/1). Enviados ao GitHub em 17/11/2026 (head `dda796f`).
- **Pendências / riscos:**
  - Timeout de 15 s na Meta: se a Meta aceitar o envio mas responder devagar, o toque conta como falha temporária e pode ser reenviado no dia seguinte (duplicata rara).
  - Crash entre a Meta aceitar e o banco gravar ainda pode reenviar o toque (raro).
  - Resposta que chega nos milissegundos entre a rechecagem e o envio ainda recebe aquele toque.
  - Se o gancho do webhook falhar (erro é só registrado no log), a resposta não encerra a sequência.
  - O que o relatório do Samuel previa como "item 10" veio sem itens; nada incluído.

## 2026-11-17: Reativação de contatos inativos
- **Origem:** `features/reativacao-de-clientes-inativos` (protótipo do Builder), adaptada sem dados de venda: inatividade = dias desde a última mensagem do contato. Design: [`docs/superpowers/specs/2026-11-17-reativacao-design.md`](docs/superpowers/specs/2026-11-17-reativacao-design.md). Plano: [`docs/superpowers/plans/2026-11-17-reativacao.md`](docs/superpowers/plans/2026-11-17-reativacao.md).
- **O que mudou:**
  - Menu **Reativação** com três abas: **Painel** (contatos em faixas Atrasado/Esfriando/Sumido, filtro por etiqueta), **Campanhas** e **Ajustes** (faixas, descanso, limite diário, horário, palavras de saída).
  - Assistente de campanha em 3 passos: público → até 3 toques com template aprovado e intervalo → revisão (elegíveis, excluídos com motivo, prévia personalizada) → "Aprovar e iniciar".
  - Envio gradual pelo cron: horário comercial, limite diário por conta, sem duplicar envio, 1 retentativa no dia seguinte, campanha pausa se a Meta recusar o template. Toques aparecem no inbox como mensagem automática.
  - A sequência para quando o contato responde. "SAIR"/"PARAR"/"STOP" (só para quem está numa campanha ou recebeu toque nos últimos 30 dias) marca "Não quer receber campanhas" e responde com uma confirmação.
  - "Não quer receber campanhas" também exclui o contato das **Transmissões** (painel e API v1). Na ficha do contato aparece um selo, e o admin pode marcar/desmarcar.
  - Relatório por campanha: público, enviados, entregues, lidos, responderam, saíram, falhas, voltaram sozinhos.
- **Banco (migrations):** `040_reactivation.sql` (colunas `do_not_contact*` e `last_inbound_at` em `contacts`, com backfill; tabelas `reactivation_settings`, `reactivation_campaigns`, `reactivation_enrollments`, `reactivation_sends`; RLS), `041_reactivation_candidates.sql` (função `reactivation_candidates`) e `042_reactivation_review_fixes.sql` (`attempted_at` para o limite diário; exclusão de "envio recente" passa a contar transmissões). As correções posteriores estão em 043–047 (entrada acima).
- **Revisão final:** revisor independente encontrou 0 críticos e 6 importantes, todos corrigidos com teste (envio duplicado após erro de banco, recibos consumindo o limite diário, corrida ao aprovar, transmissões fora da exclusão, checagem de opt-out dos broadcasts que deixava passar em erro, rechecagem com dados velhos). 7 pontos menores ficaram anotados para depois; a lista e o que foi feito em cada um estão na entrada "correções da verificação" acima.
- **Arquivos principais:** `src/lib/reactivation/*` (regras, consultas, runner, webhook), `src/app/api/reactivation/*`, `src/app/(dashboard)/reactivation/*`, `src/components/reactivation/*`, ganchos em `src/app/api/whatsapp/webhook/route.ts` e nas rotas de broadcast.
- **Como testar (local):** `REACTIVATION_DRY_RUN=true` no `.env.development.local` → criar campanha em Reativação → `curl -H "x-cron-secret: <AUTOMATION_CRON_SECRET>" localhost:3000/api/reactivation/cron`. Testado ponta a ponta em 17/11/2026 com 4 contatos de teste (envio, resposta, SAIR dentro e fora de campanha, encerramento automático, relatório, selo na ficha). Na época, 756/756 testes; depois do rebase sobre o `main`, 787/787; depois das correções, 827/827 + 33 pgTAP.
- **Commit/branch:** branch `feat/reativacao`, publicada no GitHub. **PR #1 aberto** (https://github.com/samuelmartins2010/wacrm/pull/1), rebaseado sobre o `main` e com as migrations renumeradas para 040–042.
- **Pendências / riscos:**
  - Em produção, o pinger externo precisa chamar também `/api/reactivation/cron`.
  - Templates com cabeçalho de mídia ou variável no cabeçalho não são aceitos nesta versão.
  - O WhatsApp real não foi testado (local não tem número).
  - Dados de teste locais: vários contatos e campanhas de teste (ids começando com `aaaaaaaa`, `eeeeeeee`, `9…`), usuários `rls-*`/`dnc-*@clientizza.local` e o template `volta_cliente`.
  - Tradução `Contacts.detailView.tabs.tags` já faltava antes (não relacionada).

## 2026-11-17: Levantamento das features do Builder
- **Origem:** pasta `~/Documents/CRM whatsapp/features/` (19 protótipos do Builder do Núcleo de I.A)
- **O que mudou:** nenhum código. Levantamento e avaliação de implantação em [`docs/levantamento-features.md`](docs/levantamento-features.md).
- **Banco (migrations):** nenhuma.
- **Commit/branch:** commitado em `05d3c0d` (junto com o registro da Reativação), dentro do PR #1.
- **Pendências / riscos:** Samuel escolher a ordem de implantação. Sugestão: 1) Reativação de clientes inativos; 2) melhorias do inbox/agente/broadcasts.

## 2026-11-17: Ambiente de desenvolvimento local
- **O que mudou:** dev 100% local. Docker via Colima, Supabase via `npx supabase`, `.env.development.local` apontando pro Supabase local. Produção (VPS + Supabase cloud) continua pausada de propósito.
- **Como subir:** `colima start --cpu 4 --memory 4` → `npx supabase start -x vector,logflare,imgproxy,supavisor,edge-runtime` → `npm run dev` → http://localhost:3000 (login de teste: ver anotações locais, não versionado).
- **Arquivos:** `supabase/config.toml` (não commitado), `.env.development.local` e `.env.production.local` (ignorados pelo git; ver o esquema de .env na entrada mais recente).
- **Pasta de trabalho:** desde 17/11/2026, `~/Developer/wacrm` (clone novo; a pasta antiga em `~/Documents` ficou intacta). Supabase local com as migrations até a 047.
- **Atenção:** a migration 038 do `main` (RBAC do superadmin) não cadastra nenhum admin; sem uma linha em `platform_admins`, `/superadmin` redireciona para `/dashboard` (local e produção).
- **Pendências / riscos:** WhatsApp real não funciona local sem túnel (ngrok/cloudflared).
