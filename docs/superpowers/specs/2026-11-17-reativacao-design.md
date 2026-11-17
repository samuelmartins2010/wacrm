# Reativação de contatos inativos: design

Data: 17/11/2026 · Status: rascunho para aprovação do Samuel
Origem: protótipo `~/Documents/CRM whatsapp/features/reativacao-de-clientes-inativos` (Builder Núcleo de I.A), adaptado.
Levantamento: [`docs/levantamento-features.md`](../../levantamento-features.md), item 1 da ordem recomendada.

## 1. Intenção

As empresas que usam o Clientizza acumulam contatos que pararam de conversar. Esta feature mostra **quem sumiu**, separado em faixas de tempo, e permite montar uma **campanha de reativação de até 3 toques** pelo WhatsApp. A campanha passa por aprovação antes de enviar, **para sozinha quando o contato responde** e respeita quem pede para sair. O sucesso é medido em **respostas**: o contato voltou a conversar e caiu no inbox para a equipe atender.

Decisões do Samuel:
- **Sem dados de venda.** Nada de compras, valor gasto ou ciclo de recompra. Inatividade é medida só pela conversa.
- **Foco em automatizar conversas.**
- **Abordagem B:** módulo próprio "Reativação", com painel, campanha, aprovação e relatório. Não é um gatilho dentro de Automações.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. Painel com contatos inativos em faixas (Atrasado / Esfriando / Sumido), com filtros por faixa e etiqueta.
2. Campanha com 1–3 toques. Cada toque usa um **template aprovado pela Meta**, com intervalo em dias entre eles.
3. Revisão do público antes de iniciar: lista de elegíveis, lista de excluídos com motivo e opção de remover pessoas da lista.
4. Envio automático gradual, com limite diário e janela de horário.
5. A sequência para quando o contato responde ou pede para sair.
6. Opt-out ("SAIR") vale para a conta inteira.
7. Relatório por campanha.

**Não-objetivos (agora)**
- Registro de vendas/compras, faixa de valor e ciclo de recompra.
- Texto gerado por I.A ou texto livre por contato. Fora da janela de 24 h, a Meta só aceita template.
- Aprovação mensagem a mensagem. A aprovação é da campanha, com remoção individual.
- Gatilho "contato inativo" dentro de Automações (abordagem C, fica para depois).
- Importação de base externa (HubSpot/CSV). Os contatos já estão no Clientizza.
- Restringir a feature por plano SaaS.

**Anti-objetivos (se acontecer, falhou mesmo "funcionando")**
- Disparar para a base inteira sem passar pela revisão.
- Mandar qualquer coisa para quem pediu para sair.
- Continuar mandando toques depois que o contato respondeu.
- Enviar o mesmo toque duas vezes para o mesmo contato (cron sobreposto, retry).
- Um contato receber toques de duas campanhas de reativação ao mesmo tempo.

## 3. Restrições

- **Stack do repo:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de codar, ver `AGENTS.md`), Supabase com RLS, `next-intl` (`messages/pt-BR.json` + `en.json`).
- **Multi-tenant:** tudo tem `account_id`. RLS via `is_account_member(account_id, 'agent' | 'admin')`, padrão das migrations 017+.
- **WhatsApp Cloud API:** contato inativo está fora da janela de 24 h, então **só template aprovado** (`message_templates` com status aprovado). Templates de categoria MARKETING podem ser limitados pela Meta. Isso é aceitável e aparece como falha no relatório.
- **Envio:** reaproveitar `sendTemplateMessage` (`src/lib/whatsapp/meta-api.ts`), `phoneVariants` / `isRecipientNotAllowedError` (`phone-utils.ts`) e o montador de parâmetros de template já usado em broadcasts (`template-send-builder.ts`, `step3-personalize.tsx`).
- **Agendamento:** mesmo modelo do cron de automações (`/api/automations/cron`). Endpoint GET protegido por header `x-cron-secret`, disparado por pinger externo/VPS. Ver `docs/automations-and-cron.md`.
- **Dev local:** não há WhatsApp real. Precisa de modo simulado para testar o fluxo inteiro.
- **Testes:** Vitest; rodar com `TZ=UTC LC_ALL=en_US.UTF-8`.

## 4. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| A | Novo gatilho "contato inativo" em Automações, sequência com passos existentes | Mais barata; reaproveita o motor | Sem painel de inativos, sem revisão do público, sem relatório; fácil disparar para a base toda |
| **B** | **Módulo "Reativação" próprio** | Guiado e seguro; revisão + parada automática + relatório | Tabelas, telas e cron novos |
| C | B e depois o gatilho de A | Cobre usuários avançados | Mais escopo; C pode vir depois sem retrabalho |

**Escolhida: B** (decisão do Samuel). Reativação é uma campanha (público, aprovação, resultado), e isso não cabe num gatilho solto. O risco de envio em massa pede revisão.

## 5. Design

### 5.1 Medida de inatividade

- **Dias inativo = hoje − data da última mensagem recebida do contato** (`messages.sender_type = 'customer'`), em qualquer conversa da conta. *Minha decisão:* contar só mensagens do cliente. Se contasse qualquer mensagem, um broadcast enviado pela empresa "zeraria" a inatividade de quem nunca respondeu.
- *Minha decisão (técnica):* `messages` não tem `contact_id`. Por isso, entra a coluna **`contacts.last_inbound_at`**, atualizada pelo webhook a cada mensagem recebida e preenchida na migration a partir de `messages` ⨝ `conversations`. A lista de inativos lê só `contacts`, o que é barato.
- Contatos **sem nenhuma mensagem recebida** ficam fora. Nunca conversaram, então não há o que reativar.
- **Faixas** (configuráveis por conta; padrões são *minha decisão*):
  - Atrasado: ≥ 30 dias
  - Esfriando: ≥ 60 dias
  - Sumido: ≥ 120 dias
  - Abaixo de 30 dias: "Ativo", não aparece como inativo.
- O cálculo é feito no banco (view ou RPC `reactivation_inactive_contacts(account_id)`), não no cliente. Contas podem ter milhares de contatos.

### 5.2 Elegibilidade (o que exclui um contato)

Um contato inativo é **elegível** para uma campanha se não cair em nenhuma exclusão. A tela mostra cada excluído com o motivo:

1. `do_not_contact = true` (pediu para sair).
2. Sem telefone válido E.164.
3. Já está em outra campanha de reativação **ativa** (inscrição em `ativo` ou `pendente`).
4. Está "descansando": a **inscrição dele** em alguma campanha terminou (concluída, respondeu, falhou, saiu ou cancelada) há menos de **N dias** (padrão 60, configurável). O descanso conta do fim da inscrição, não do fim da campanha.
5. Recebeu mensagem nossa (agente, bot, broadcast ou automação) nos últimos **7 dias** (configurável). Evita somar toques em cima de um broadcast recente.
6. Removido manualmente na revisão.

A elegibilidade é **reconferida imediatamente antes de cada envio**: saiu, respondeu ou entrou em outra campanha → não envia.

### 5.3 Fluxo do usuário

```
Reativação (menu lateral)
├── Painel        cards por faixa (qtd) · lista de inativos (nome, telefone, dias, faixa, etiquetas, situação)
│                 filtros: faixa, etiqueta · ação: "Criar campanha com este filtro"
├── Campanhas     lista (nome, status, público, enviados, respostas) → detalhe/relatório
│   └── Nova campanha (assistente em 3 passos)
│       1. Público     faixas + etiquetas (incluir/excluir) → contagem elegíveis/excluídos
│       2. Toques      1–3 toques: template aprovado + variáveis ({{1}} = primeiro nome, etc.) + "esperar X dias" entre toques
│       3. Revisão     lista de elegíveis (remover individualmente) · excluídos com motivo · prévia de cada toque
│                      limite diário · janela de horário · botão "Aprovar e iniciar"
└── Ajustes       limites das faixas · dias de descanso · limite diário padrão · janela de horário
                  palavras de saída (padrão: SAIR, PARAR, STOP, CANCELAR) · texto de confirmação de saída
```

- Campanha começa em **rascunho**. Só "Aprovar e iniciar" cria inscrições e começa a enviar. *Minha decisão:* criar/aprovar exige papel **admin**; agentes só visualizam.
- Campanha ativa pode ser **pausada**, **retomada** ou **encerrada**. Encerrar cancela os toques pendentes.
- O público é **congelado na aprovação**. Contatos que ficarem inativos depois não entram na campanha já iniciada.
- A campanha **encerra sozinha** (`finished`) quando todas as inscrições chegam a um estado final. O cron confere isso a cada rodada.

### 5.4 Execução (cron)

- Endpoint `GET /api/reactivation/cron` com o mesmo esquema de segredo do cron de automações. *Minha decisão:* reusar `AUTOMATION_CRON_SECRET` para não exigir configuração nova.
- A cada chamada, processa inscrições com `next_run_at <= agora` de campanhas `ativas`, em lotes:
  1. Respeita a **janela de horário** da campanha (padrão do protótipo, fuso America/Sao_Paulo: seg–sex 9h–19h, sáb 9h–13h, domingo não envia). Fora da janela, adia para a próxima abertura.
  2. Respeita o **limite diário da conta** (em `reactivation_settings`, padrão 50 envios/dia, *minha decisão*). O limite é compartilhado por todas as campanhas ativas, porque a qualidade do número na Meta é por número. Toda tentativa conta, inclusive as que falharam. O que passar do limite fica para o dia seguinte.
  3. **Reconfere a elegibilidade** (5.2) e se respondeu desde a inscrição.
  4. **Trava a inscrição** antes de enviar (UPDATE condicional de status/step, como o claim do cron de automações) e registra o envio com chave única `(enrollment_id, step)`. Assim um envio não se repete.
  5. Envia o template com as variáveis resolvidas e guarda `whatsapp_message_id`. Grava a mensagem na conversa do contato seguindo o padrão de **`src/lib/whatsapp/send-message.ts`** (o `broadcast-core.ts` não grava no inbox): cria ou reabre a conversa e grava com `sender_type = 'bot'`. Assim o toque aparece no inbox e a equipe vê o contexto quando o contato responder. Mensagem de saída não dispara automações.
  - **Falhas** (*minha decisão*):
    - Número inválido ou sem WhatsApp (`isRecipientNotAllowedError`) → inscrição `failed`, para.
    - Erro temporário ou limite de MARKETING da Meta (ex.: 131049) → tenta o **mesmo toque mais 1 vez no dia seguinte**, atualizando a mesma linha de `reactivation_sends` (`attempts`). Se falhar de novo → `failed`.
    - Template não aprovado/pausado → **pausa a campanha** e mostra o motivo na tela.
  6. Agenda o próximo toque (`next_run_at = agora + intervalo`) ou conclui a inscrição.
- Atualizações de status da Meta (entregue/lido/falhou) chegam pelo webhook existente. `handleStatusUpdate` passa a atualizar também `reactivation_sends` pelo `whatsapp_message_id`.
- **Modo simulado (dev):** com `REACTIVATION_DRY_RUN=true`, não chama a Meta. Marca o envio como enviado, com id fictício, e grava a mensagem na conversa com marcação de simulado. *Minha decisão:* flag própria, porque `WHATSAPP_TEMPLATES_DRY_RUN` hoje só afeta o cadastro de templates.

### 5.5 Resposta e saída (webhook)

Em `processMessage` (`src/app/api/whatsapp/webhook/route.ts`), junto de `flagBroadcastReplyIfAny`, best-effort sem quebrar o fluxo:

- **Saída:** vale **só para contatos com inscrição de reativação ativa ou que receberam um toque nos últimos 30 dias**. Assim, um cliente que escreve "parar" numa conversa de suporte comum não é descadastrado por engano (*minha decisão*). Se o texto recebido, sem espaços e ignorando maiúsculas/acentos, for **exatamente** uma das palavras de saída da conta (padrão: SAIR, PARAR, STOP; "CANCELAR" saiu dos padrões porque é comum em pedidos):
  - marca o contato como `do_not_contact = true` (com data e origem `reativacao_sair`);
  - encerra as inscrições ativas dele com status `saiu`;
  - responde com o texto de confirmação, que é permitido porque o contato acabou de abrir a janela de 24 h. Padrão: "Pronto, você não vai mais receber nossas mensagens de campanha."
- **Resposta:** qualquer outra mensagem de um contato com inscrição ativa marca a inscrição como `replied`, com `replied_step` = último toque enviado, e cancela os toques restantes. A conversa segue normal no inbox. Agentes de I.A e automações continuam atuando como hoje.
  - Se o contato escrever **antes do primeiro toque** sair, a inscrição vira `cancelled` (motivo "voltou sozinho"). Não conta como resposta da campanha, mas aparece no relatório.
- **Alcance do `do_not_contact`** (*minha decisão*): bloqueia **envios em massa**, ou seja, reativação e broadcasts (assistente passo 2 e API v1 de broadcasts). **Não** bloqueia mensagens 1:1 do inbox, automações nem fluxos, que respondem a uma conversa iniciada pelo próprio contato. A ficha do contato mostra um selo "Não quer receber campanhas" e o **admin pode desmarcar**, com `do_not_contact_source = 'manual'` registrando quem desmarcou. O admin também pode marcar manualmente.

### 5.6 Relatório da campanha

Contagens: público aprovado · enviados por toque · entregues · lidos · **responderam** (e em qual toque) · saíram · falhas (com motivo da Meta) · em andamento. Lista de inscrições com status e link para a conversa.

### 5.7 Dados (migration `037_reactivation.sql`)

- `contacts`: `do_not_contact BOOLEAN NOT NULL DEFAULT false`, `do_not_contact_at TIMESTAMPTZ`, `do_not_contact_source TEXT` (`reativacao_sair` | `manual`), `last_inbound_at TIMESTAMPTZ` (com backfill).
- `reactivation_settings` (1 por conta): faixas (3 ints), `rest_days`, `recent_outbound_days` (padrão 7), `daily_limit`, janela padrão (JSON), `optout_keywords TEXT[]`, `optout_reply TEXT`.
- `reactivation_campaigns`: `account_id`, `name`, `status` (`draft` | `active` | `paused` | `finished`), `pause_reason`, filtros (faixas, etiquetas incluir/excluir), `steps JSONB` (1–3 × {template_id, params, wait_days}), janela, `approved_by`, `approved_at`, `created_by`, timestamps.
- `reactivation_enrollments`: `account_id`, `campaign_id`, `contact_id`, `status` (`pending` | `active` | `replied` | `completed` | `opted_out` | `failed` | `removed` | `cancelled`), `current_step`, `next_run_at`, `replied_at`, `replied_step`, `ended_at` (base do descanso), `end_reason`, timestamps. UNIQUE `(campaign_id, contact_id)`.
- `reactivation_sends`: `account_id`, `enrollment_id`, `step`, `attempts`, `whatsapp_message_id`, `message_id`, `status` (`sent` | `delivered` | `read` | `failed`), `error`, timestamps. UNIQUE `(enrollment_id, step)`.
- RLS: leitura `is_account_member(account_id, 'agent')`. Escrita de campanhas/ajustes `'admin'`. Inscrições/envios só pelo servidor (service role), sem INSERT/UPDATE pelo cliente.
- Índices: `reactivation_enrollments(status, next_run_at)`, `reactivation_enrollments(contact_id, ended_at)`, `contacts(account_id, last_inbound_at)`.

### 5.8 Código (onde fica)

- Regras puras em `src/lib/reactivation/`: faixa a partir de dias, elegibilidade e motivos, janela de horário/próxima abertura, normalização da palavra de saída, cálculo do próximo toque. **Com testes unitários.**
- Cron em `src/app/api/reactivation/cron/route.ts`. Ações de UI via rotas `src/app/api/reactivation/*` ou server actions, seguindo o que o repo já usa.
- Telas em `src/app/(dashboard)/reactivation/` (painel, campanhas, nova, detalhe, ajustes). Item no menu lateral. Textos em `messages/pt-BR.json` + `en.json`.
- Registrar em `IMPLANTACOES.md` ao concluir.

## 6. Decidido pelo Samuel
- Sem vendas; foco em automação de conversas.
- Abordagem B (módulo próprio).

## 7. Deixado para quem constrói
- Detalhes visuais seguindo o design system atual (verde Clientizza, componentes existentes).
- View × RPC para a lista de inativos, paginação, batch size do cron.
- Formato exato dos filtros salvos na campanha.
