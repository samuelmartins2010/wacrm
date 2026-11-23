# Pronto para o primeiro cliente: critérios

Lista objetiva do que precisa estar verdadeiro antes de colocar clientes no Clientizza, em **três níveis**. Cada critério tem **como verificar** (dá sim/não), o **estado em 23/11/2026**, o **esforço** e **o que depende de você** (decisão, conta, dinheiro, advogado) e não de código.

- **Estado:** ✅ feito · 🟡 parcial · ❌ falta
- **Esforço:** **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias (inclui espera de terceiros, como aprovação da Meta)
- Os números (1.1, 2.3…) são os mesmos da primeira versão desta lista; só mudou o agrupamento.

> **Contexto.** A produção (VPS + Supabase cloud) está **pausada de propósito** desde 17/11. Tudo que é código foi testado no ambiente local (Supabase local + proxy falso da Meta). Por isso quase todo critério de produção aparece como "falta".

---

## Nível 1 — Bloqueia o piloto

Piloto = **um cliente conhecido, que sabe que é teste, com acompanhamento direto seu**. Nada aqui é opcional para ele.

### Produção no ar

| # | Critério | Como verificar | Estado | Esforço | Depende de você |
|---|---|---|---|---|---|
| 1.1 | **Migrations 040–062 aplicadas em produção, pelo guia, na ordem** | No SQL Editor do Supabase cloud, as 23 consultas de `docs/deploy-migrations-040-062.md` voltam `true` (ou a conferência final, 8 colunas `true`). | ❌ falta. 🟡 O guia agora cobre 040–062 e as 23 consultas foram conferidas no banco local; produção parou antes da 040. | M | Marcar a janela de manutenção (as 057–062 vão junto com o deploy); acesso ao painel do Supabase cloud. |
| 1.2 | **Código do `main` na VPS, depois das migrations** | `git log -1` na VPS = último commit do `main` no GitHub; o login abre em `https://clientizza.com`. | ❌ falta (VPS pausada) | P | Decidir a data de religar; acesso SSH; custo mensal da VPS. |
| 1.3 | **Variáveis de produção corretas** | No env da VPS: `META_APP_SECRET`, `ENCRYPTION_KEY` (a mesma que criptografou os tokens já salvos), `SUPABASE_SERVICE_ROLE_KEY`, `AUTOMATION_CRON_SECRET`; `REACTIVATION_DRY_RUN` e `WHATSAPP_TEMPLATES_DRY_RUN` ausentes ou `false`. Webhook sem assinatura → 401. | 🟡 parcial (chaves guardadas em `~/Developer/wacrm-secrets/env.production.backup`; não conferido na VPS) | P | Conferir que a `ENCRYPTION_KEY` guardada é a de produção (se não for, os tokens salvos não abrem). |
| 1.4 | **Os 3 crons rodando a cada 5 min** (`/api/automations/cron`, `/api/flows/cron`, `/api/reactivation/cron`) | `curl -i -H "x-cron-secret: …" https://clientizza.com/api/<rota>/cron` → 200 nas três (sem o header → 401); painel do pinger com 200 nas últimas 24 h. | ❌ falta (rotas prontas e testadas local; o pinger não chama a da Reativação) | P | Conta no serviço de pinger (ex.: cron-job.org ou UptimeRobot). |
| 1.5 | **Superadmin cadastrado** | `select * from platform_admins where active` tem a sua conta; `/superadmin` abre. Sem ele, não dá para tirar a conta do piloto do trial. | ❌ falta conferir | P | — |

### WhatsApp real, ponta a ponta

Com o número de teste da conta Meta de produção e 2–3 números próprios; fazer a ação no celular e conferir no Clientizza.

| # | Critério | Como verificar | Estado | Esforço | Depende de você |
|---|---|---|---|---|---|
| 2.1 | **Webhook ligado** | Meta → WhatsApp → Configuração: "Verificar e salvar" aceita `https://clientizza.com/api/whatsapp/webhook`; campo `messages` assinado. | ❌ falta | P | Acesso ao app no Meta for Developers. |
| 2.2 | **Recebimento** | "oi" de um número próprio aparece no Inbox em até 5 s, em "Aguardando" e "Sem dono", com os contadores subindo. | ❌ falta (só webhook simulado) | P | Celulares/chips de teste. |
| 2.3 | **Resposta** | Responder pelo Inbox → chega no celular; status entregue/lido; sai de "Aguardando". | ❌ falta | P | — |
| 2.4 | **Automação** | Automação de mensagem recebida ou palavra-chave → a mensagem certa chega; log "sucesso" na tela da automação. | ❌ falta | P | — |
| 2.5 | **Fluxo** | Fluxo com botões por palavra-chave → botões chegam; tocar avança; entrega para atendente atribui e aparece na conversa. | ❌ falta | P | — |
| 2.6 | **Template** | Template criado no Clientizza aprovado pela Meta; enviado pela página do contato a um número sem conversa → chega. | ❌ falta | M (espera da aprovação) | Texto do template; custo das conversas iniciadas pela empresa (a Meta cobra por conversa). |
| 2.7 | **Reativação** | Campanha com 2–3 números e o `volta_cliente` aprovado: toque chega; resposta marca "respondida" sem novo toque; número sem WhatsApp falha com 131026 sem retentativa. | ❌ falta (roteiro em "Para religar a VPS", item 4) | M | Os mesmos da 2.6. |
| 2.8 | **SAIR** | "SAIR" recebe **só** a confirmação (sem automação nem I.A); o contato fica "não contatar" e some das transmissões e campanhas seguintes. | ❌ falta (testado local) | P | — |
| 2.9 | **Transmissão** | Transmissão para 3 números (um com "não contatar") → 2 recebem, 1 fica de fora; o relatório mostra isso. | ❌ falta (1.255 contatos testados local com Meta falsa) | P | — |

### Dados, consentimento e erros

| # | Critério | Como verificar | Estado | Esforço | Depende de você |
|---|---|---|---|---|---|
| 3.1 | **Backup automático do banco de produção** | Supabase → Database → Backups mostra backup diário recente. | ❌ falta conferir | P | **Dinheiro/decisão:** no plano gratuito não há backup restaurável pelo painel; o Pro tem backups diários. |
| 3.2 | **Restauração testada** | Restaurar o backup mais recente num projeto separado (ou `pg_dump` → `psql` num banco vazio); logar, abrir o Inbox, ver as conversas; anotar quanto tempo levou. | ❌ falta (só houve restauração no banco **local**, em 18/11) | M | Projeto Supabase extra para o teste (custo) ou acesso para o `pg_dump`. |
| 4.2 | **Conectar o WhatsApp do piloto** | Em Configurações → WhatsApp, conectar o número do piloto (token, ID do número, WABA) → status "conectado"; o webhook recebe dele. | ❌ falta (nunca feito com número real) | M | **Do cliente:** acesso ao Business Manager dele e um número que ainda não esteja preso a outro app. |
| 5.1 | **Monitoramento mínimo de erros** | Um erro forçado no servidor aparece num painel ou alerta (ex.: Sentry, ou e-mail) em até 5 min, com rota e mensagem. | ❌ falta (hoje só `console.error` no log da VPS) | M | Escolher a ferramenta e criar a conta (o Sentry tem plano gratuito). |
| 6.3 | **Opt-out funcionando de verdade** | Mesmo teste da 2.8, conferindo também que o contato não entra na próxima campanha nem na próxima transmissão. | 🟡 parcial (feito e testado local) | P | — |
| 6.4 | **Consentimento (opt-in) registrado para Reativação e Transmissões** | Todo contato que recebe toque da Reativação ou transmissão de marketing tem consentimento registrado (origem e data); quem não tem fica de fora e aparece contado como "sem consentimento". | ❌ falta (não há campo de consentimento) | G | **Decisões:** o que conta como consentimento, o texto da declaração na importação e o que fazer com a base atual (ver a proposta abaixo). Idealmente validar com o advogado da 6.2. |

## Nível 2 — Bloqueia vender para clientes desconhecidos

Cliente que chega sozinho, sem você do lado.

| # | Critério | Como verificar | Estado | Esforço | Depende de você |
|---|---|---|---|---|---|
| 3.3 | **Plano de volta (rollback) de deploy** | Documento curto: voltar o código para o commit anterior na VPS e o que fazer se uma migration falhar (o guia já tem "Se uma falhar no meio"). | 🟡 parcial | P | — |
| 4.1 | **Cadastro** | Conta nova em `/signup` com um e-mail novo → confirmação chega → login → onboarding. | 🟡 parcial (telas existem; e-mail de produção não conferido) | P | Provedor de e-mail transacional de produção (conta/SMTP). |
| 4.3 | **Primeiros passos sem ajuda** | Uma pessoa de fora, só com `docs/manual/`, importa contatos, cria etiqueta, responde uma conversa e cria uma automação simples em até 30 min. | ❌ falta | M | Achar a pessoa e acompanhar. |
| 4.4 | **Convidar atendente** | Convite por e-mail → atendente entra na conta certa, responde e transfere; quem só visualiza não consegue. | 🟡 parcial (regras testadas no banco; convite não testado em produção) | P | — |
| 4.5 | **Trial e cobrança** | Conta nova com trial de 10 dias; ao vencer, cai em `/trial-expired`; cobrança funcionando. | 🟡 parcial (telas e superadmin existem; sem cobrança automática) | M | **Decisão e dinheiro:** preço, planos e meio de cobrança. |
| 5.2 | **Aviso de cron parado** | Se um dos 3 crons ficar 30 min sem 200, chega um alerta. | ❌ falta | P | Configurar no pinger (conta da 1.4). |
| 5.4 | **Canal de suporte** | Cliente sabe onde pedir ajuda (contato de suporte nas Configurações) e a mensagem chega a você. | 🟡 parcial (`SUPPORT_PHONE`/`SUPPORT_EMAIL` existem no env; não conferido em produção) | P | Número/e-mail de suporte e quem responde. |
| 6.1 | **Aceite dos termos e da política no cadastro** | `/termos` e `/privacidade` abrem sem login; o cadastro só conclui com o aceite marcado, e o aceite fica gravado (data, versão). | 🟡 parcial (páginas existem, com CNPJ, controlador/operador, direitos do art. 18 e encarregado; **o cadastro não tem aceite**) | P | Texto final dos termos (vem da 6.2). |
| 6.2 | **Revisão jurídica** | Um advogado leu termos, política e contrato (papel de operador; subprocessadores: Supabase, Meta, provedor de I.A, VPS). | ❌ falta | M | **Advogado e dinheiro.** |
| 6.5 | **Atender pedido do titular** | Roteiro para exportar e apagar os dados de um contato a pedido (acesso e eliminação), com prazo. | ❌ falta (dá para apagar pela tela; não há exportação nem roteiro) | M | Prazo e canal de pedido (definir com o advogado). |

## Nível 3 — Pode vir depois

| # | Critério | Como verificar | Estado | Esforço | Depende de você |
|---|---|---|---|---|---|
| 2.10 | **I.A com provedor real** | Com a I.A ligada e uma chave real: o cliente pergunta e a I.A responde; "Assumir" no Inbox faz a I.A parar. Sobe para o nível 1 se o piloto for usar a I.A. | ❌ falta | P | Chave do provedor de I.A (custo por uso). |
| 5.3 | **Logs da VPS guardados** | Logs do app retidos por pelo menos 7 dias e consultáveis (`journalctl` ou arquivo com rotação). | ❌ falta conferir | P | — |

---

## Resumo

| Nível | Critérios | ✅ | 🟡 | ❌ |
|---|---|---|---|---|
| 1. Bloqueia o piloto | 20 | 0 | 2 (1.3, 6.3) | 18 |
| 2. Bloqueia vender para desconhecidos | 10 | 0 | 6 (3.3, 4.1, 4.4, 4.5, 5.4, 6.1) | 4 |
| 3. Pode vir depois | 2 | 0 | 0 | 2 |
| **Total** | **32** | **0** | **8** | **24** |

**Caminho mais curto para o piloto:**
1. Decidir o plano do Supabase (3.1).
2. Religar a VPS com as migrations 040–062 e os 3 crons (1.1–1.5).
3. Rodar o roteiro do WhatsApp real (2.1–2.9, 6.3).
4. Restaurar um backup de teste (3.2).
5. Instalar o monitoramento de erros (5.1).
6. Implementar o consentimento (6.4) e conectar o número do piloto (4.2).

A 6.4 é a única peça grande de código. As outras dependem principalmente de contas, acessos e testes no celular.

---

## Proposta: registro de consentimento (opt-in), mínimo viável

**Status:** proposta para decisão. Nada disso está implementado.

### Por que
A Reativação e as Transmissões são mensagens que **a empresa inicia**. A política do WhatsApp Business exige opt-in antes delas, e a LGPD exige base legal registrada. Hoje o sistema só registra a **saída** (`do_not_contact`, com data, origem e quem marcou). Falta registrar a **entrada**.

### Campos (tabela `contacts`)
| Campo | Tipo | Para quê |
|---|---|---|
| `marketing_consent` | `granted` · `unknown` | Se pode receber mensagem iniciada pela empresa. Padrão `unknown`. A revogação continua sendo o `do_not_contact` que já existe, e ele sempre vence. |
| `marketing_consent_at` | data/hora | Quando o consentimento foi dado. |
| `marketing_consent_source` | texto curto | De onde veio (lista abaixo). |
| `marketing_consent_evidence` | texto | A prova: a mensagem do contato, o nome do arquivo e a declaração da importação, quem marcou à mão. |
| `marketing_consent_by` | usuário | Quem registrou, quando foi uma pessoa. |

Mais um **histórico simples** (`contact_consent_events`: contato, de → para, origem, prova, quem, quando). Assim dá para provar o consentimento mesmo depois de mudar. Escrita só pelo servidor, como o `conversation_events`.

### De onde vem o opt-in de cada contato
| Origem (`source`) | Como acontece | Prova guardada |
|---|---|---|
| `keyword` | O contato responde "SIM" (ou toca no botão "Quero receber") a uma pergunta de consentimento, por exemplo num fluxo ou numa resposta do atendente dentro da janela de 24 h. | A mensagem recebida (id da Meta + texto). |
| `import_declared` | Importação CSV com a coluna `consentimento` = sim, **e** a pessoa que importa marca a declaração "Declaro que estes contatos autorizaram receber mensagens da minha empresa pelo WhatsApp". | Nome do arquivo, data, usuário e o texto exato da declaração. |
| `manual` | Admin marca na ficha do contato, escolhendo a origem (balcão, formulário em papel, site) e um campo livre. | Usuário + origem + texto. |
| `api` | `POST /api/v1/contacts` com `marketing_consent: { source, evidence }`. | O que a integração mandar, com a chave de API usada. |

**Não conta como consentimento** só o contato ter mandado mensagem. Isso abre a janela de 24 h para conversa, mas não autoriza marketing depois dela. **Decisão sua**, idealmente com o advogado: se aceitar, basta acrescentar a origem `inbound` com regras de prazo.

### Como a Reativação e as Transmissões passam a respeitar
- **Regra única no servidor:** só recebe mensagem iniciada pela empresa quem tem `marketing_consent = granted` **e** `do_not_contact = false`. Ela entra no mesmo lugar que hoje filtra o `do_not_contact` (`loadOptedOut` nas transmissões e a lista de elegíveis da Reativação, rechecada antes de cada toque). Assim não dá para burlar pela tela nem pela API.
- **Transmissões:**
  - a estimativa do passo 4 e a confirmação mostram "X sem consentimento ficam de fora";
  - o relatório conta esses contatos à parte (como já faz com "não contatar").
  - **Decisão sua:** se modelos de categoria **Utilidade** (aviso de pedido, cobrança) ficam isentos. A proposta é que sim, porque não são marketing.
- **Reativação:**
  - quem não tem consentimento não entra na campanha, e a tela mostra quantos ficaram de fora por isso;
  - quem perder o consentimento no meio (SAIR) já sai pelo `do_not_contact`, como hoje.
- **Por conta:** uma chave "Exigir consentimento" nas configurações, **ligada por padrão** em contas novas. Ela existe só para a transição das contas atuais e não fica visível para o cliente desligar depois.

### O que fazer com os contatos que já existem
1. **Todos começam `unknown`.** A partir da ativação da regra, ninguém recebe Reativação nem Transmissão sem consentimento.
2. **O dono da conta regulariza a base atual** por um destes caminhos:
   - **reimportar** o CSV com a coluna `consentimento` e a declaração;
   - **marcar em lote** um filtro ou etiqueta, com a mesma declaração e o registro de quem fez;
   - **pedir o consentimento pelo WhatsApp** a quem conversou nas últimas 24 h (mensagem livre, sem custo de template). Fora da janela, só com um template **Utilidade** aprovado que pergunte se a pessoa quer continuar recebendo. A Meta aprova pedido de opt-in como utilidade em alguns casos; é preciso testar o texto.
3. **No piloto:** você e o cliente fazem a regularização juntos, com a declaração assinada por ele.

### Esforço estimado
**G** no total:
- migration com campos, histórico e regra no servidor: M;
- telas (ficha do contato, importação, lote, contagens nas transmissões e na Reativação): M;
- testes de banco e ponta a ponta: P a M.

Fora da conta: a aprovação de um template de opt-in pela Meta, se você quiser esse caminho.

### Decisões que são suas
1. O que conta como consentimento (em especial: "mandou mensagem" conta?).
2. O texto da declaração na importação e no lote.
3. Se modelos **Utilidade** ficam isentos.
4. Se vale pedir o opt-in por template (custo e aprovação da Meta).
5. Validação com o advogado (6.2) antes de vender para clientes desconhecidos.
