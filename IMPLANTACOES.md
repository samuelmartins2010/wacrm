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
