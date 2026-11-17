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

## 2026-11-17: Reativação de contatos inativos
- **Origem:** `features/reativacao-de-clientes-inativos` (protótipo do Builder), adaptada sem dados de venda: inatividade = dias desde a última mensagem do contato. Design: [`docs/superpowers/specs/2026-11-17-reativacao-design.md`](docs/superpowers/specs/2026-11-17-reativacao-design.md). Plano: [`docs/superpowers/plans/2026-11-17-reativacao.md`](docs/superpowers/plans/2026-11-17-reativacao.md).
- **O que mudou:**
  - Menu **Reativação** com três abas: **Painel** (contatos em faixas Atrasado/Esfriando/Sumido, filtro por etiqueta), **Campanhas** e **Ajustes** (faixas, descanso, limite diário, horário, palavras de saída).
  - Assistente de campanha em 3 passos: público → até 3 toques com template aprovado e intervalo → revisão (elegíveis, excluídos com motivo, prévia personalizada) → "Aprovar e iniciar".
  - Envio gradual pelo cron: horário comercial, limite diário por conta, sem duplicar envio, 1 retentativa no dia seguinte, campanha pausa se a Meta recusar o template. Toques aparecem no inbox como mensagem automática.
  - A sequência para quando o contato responde. "SAIR"/"PARAR"/"STOP" (só para quem está numa campanha ou recebeu toque nos últimos 30 dias) marca "Não quer receber campanhas" e responde com uma confirmação.
  - "Não quer receber campanhas" também exclui o contato das **Transmissões** (painel e API v1). Na ficha do contato aparece um selo, e o admin pode marcar/desmarcar.
  - Relatório por campanha: público, enviados, entregues, lidos, responderam, saíram, falhas, voltaram sozinhos.
- **Banco (migrations):** `037_reactivation.sql` (colunas `do_not_contact*` e `last_inbound_at` em `contacts`, com backfill; tabelas `reactivation_settings`, `reactivation_campaigns`, `reactivation_enrollments`, `reactivation_sends`; RLS), `038_reactivation_candidates.sql` (função `reactivation_candidates`) e `039_reactivation_review_fixes.sql` (`attempted_at` para o limite diário; exclusão de "envio recente" passa a contar transmissões).
- **Revisão final:** revisor independente encontrou 0 críticos e 6 importantes, todos corrigidos com teste (envio duplicado após erro de banco, recibos consumindo o limite diário, corrida ao aprovar, transmissões fora da exclusão, checagem de opt-out dos broadcasts que deixava passar em erro, rechecagem com dados velhos). 7 pontos menores ficaram anotados para depois.
- **Arquivos principais:** `src/lib/reactivation/*` (regras, consultas, runner, webhook), `src/app/api/reactivation/*`, `src/app/(dashboard)/reactivation/*`, `src/components/reactivation/*`, ganchos em `src/app/api/whatsapp/webhook/route.ts` e nas rotas de broadcast.
- **Como testar (local):** `REACTIVATION_DRY_RUN=true` no `.env.development.local` → criar campanha em Reativação → `curl -H "x-cron-secret: <AUTOMATION_CRON_SECRET>" localhost:3000/api/reactivation/cron`. Testado ponta a ponta em 17/11/2026 com 4 contatos de teste (envio, resposta, SAIR dentro e fora de campanha, encerramento automático, relatório, selo na ficha). 756/756 testes, typecheck e build ok.
- **Commit/branch:** branch `feat/reativacao` (local, sem push).
- **Pendências / riscos:**
  - Em produção, o pinger externo precisa chamar também `/api/reactivation/cron`.
  - Templates com cabeçalho de mídia ou variável no cabeçalho não são aceitos nesta versão.
  - O WhatsApp real não foi testado (local não tem número).
  - Dados de teste locais: 4 contatos `aaaaaaaa-…` e o template `volta_cliente`.
  - Tradução `Contacts.detailView.tabs.tags` já faltava antes (não relacionada).

## 2026-11-17: Levantamento das features do Builder
- **Origem:** pasta `~/Documents/CRM whatsapp/features/` (19 protótipos do Builder do Núcleo de I.A)
- **O que mudou:** nenhum código. Levantamento e avaliação de implantação em [`docs/levantamento-features.md`](docs/levantamento-features.md).
- **Banco (migrations):** nenhuma.
- **Commit/branch:** nenhum (arquivos ainda não commitados).
- **Pendências / riscos:** Samuel escolher a ordem de implantação. Sugestão: 1) Reativação de clientes inativos; 2) melhorias do inbox/agente/broadcasts.

## 2026-11-17: Ambiente de desenvolvimento local
- **O que mudou:** dev 100% local. Docker via Colima, Supabase via `npx supabase`, `.env.development.local` apontando pro Supabase local. Produção (VPS + Supabase cloud) continua pausada de propósito.
- **Como subir:** `colima start --cpu 4 --memory 4` → `npx supabase start -x vector,logflare,imgproxy,supavisor,edge-runtime` → `npm run dev` → http://localhost:3000 (login `admin@clientizza.local` / `clientizza123`).
- **Arquivos:** `supabase/config.toml` (não commitado), `.env.development.local` (ignorado pelo git).
- **Pendências / riscos:** WhatsApp real não funciona local sem túnel (ngrok/cloudflared).
