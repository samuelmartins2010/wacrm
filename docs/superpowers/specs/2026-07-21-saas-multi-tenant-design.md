# Design: SaaS Multi-Tenant (Opção 1 — Super Admin Enxuto)

**Data:** 2026-07-21
**Status:** Aprovado
**Autor:** Samuel

---

## Contexto e Objetivo

O wacrm é atualmente configurado para uso de conta única. O objetivo é transformá-lo em uma plataforma SaaS multi-tenant compartilhada, onde o operador (Samuel) gerencia múltiplas contas de clientes a partir de um único painel de administração, sem que cada cliente veja ou acesse dados dos outros.

**Casos de uso iniciais:** venda de cursos odontológicos (uso próprio) e futuramente distribuição para clínicas odontológicas e serviços relacionados.

**Modelo escolhido:**
- Infraestrutura compartilhada (um Supabase, um servidor)
- Cobrança por assinatura recorrente gerenciada manualmente fora do sistema
- Onboarding de clientes feito pelo operador (não self-service)

---

## Arquitetura Geral

O wacrm já isola dados por `account_id` com RLS no Supabase. A estratégia é aproveitar essa estrutura e adicionar uma camada de gestão por cima, sem refatorar o núcleo.

```
Antes: 1 instalação = 1 conta
Depois: 1 instalação = N contas
```

**Três novos blocos:**

1. **Super Admin Panel** — rota `/superadmin`, acessível apenas ao operador
2. **Subscription layer** — campos de status/plano/vencimento na tabela `accounts`
3. **Client onboarding** — wizard de primeiro acesso para clientes novos

Toda a lógica existente (inbox, contatos, automações, pipelines, AI) permanece inalterada para cada conta.

---

## Bloco 1 — Subscription Layer (Banco de Dados)

### Campos adicionados à tabela `accounts`

| Campo | Tipo | Descrição |
|---|---|---|
| `status` | enum | `active`, `suspended`, `trial` |
| `plan` | enum | `basic`, `pro` |
| `renewal_date` | date | Data de vencimento da assinatura |
| `notes` | text | Observações internas do operador |
| `suspended_at` | timestamptz | Quando foi suspenso (para histórico) |

### Middleware

O `src/middleware.ts` existente ganha uma verificação adicional: em toda request autenticada de cliente, consulta `account.status`. Se `suspended`, redireciona para `/suspended`.

```
Request do cliente
       ↓
middleware verifica account.status
       ↓
  "suspended"? → /suspended
  "active"?    → continua normalmente
  "trial"?     → continua (com banner de trial)
```

A verificação é cacheada por sessão para não gerar roundtrip a cada request.

**Exceção:** o webhook `/api/webhooks/meta` nunca é bloqueado — mensagens continuam sendo salvas durante suspensão para evitar perda de dados.

---

## Bloco 2 — Super Admin Panel (`/superadmin`)

### Acesso

Protegido por variável de ambiente `SUPER_ADMIN_EMAIL`. Qualquer usuário autenticado com esse e-mail acessa o painel; qualquer outro recebe 403. Nenhuma tabela extra necessária.

### Tela principal — Lista de Contas

Tabela com todas as contas cadastradas, exibindo:
- Nome da conta
- E-mail do dono
- Plano (Basic / Pro)
- Status (Ativo / Suspenso / Trial) com cor indicativa
- Data de vencimento (amarelo se ≤ 7 dias, vermelho se vencido)
- Ações: Editar, Suspender/Ativar

### Criar Nova Conta (modal)

Campos:
- Nome da conta
- E-mail do dono (destinatário do convite)
- Plano: Basic / Pro
- Data de vencimento
- Observações internas

Ao confirmar: cria a conta no Supabase, gera o link de convite existente e envia o e-mail automaticamente.

### Editar Conta (drawer lateral)

- Alterar plano, vencimento, observações
- Reenviar link de convite
- Ver métricas básicas: nº de contatos, agentes, conversas no mês
- Histórico de suspensões (data de suspensão / reativação)

### Alertas automáticos

- Contas vencendo em ≤ 7 dias: badge amarelo
- Contas vencidas e ainda ativas: badge vermelho com aviso no topo do painel

---

## Bloco 3 — Tela de Suspensão (`/suspended`)

Página fora do layout do CRM, exibida a qualquer cliente com `account.status = 'suspended'`.

**Conteúdo:**
- Aviso claro de conta suspensa
- Telefone e e-mail de suporte (configurados via `SUPPORT_PHONE` e `SUPPORT_EMAIL` no `.env`)
- Botão de atalho para WhatsApp do suporte

O cliente não consegue acessar nenhuma rota do CRM enquanto suspenso. Suas mensagens recebidas continuam sendo salvas normalmente.

**Fluxo de reativação:**
```
Operador clica "Ativar" no /superadmin
        ↓
account.status → "active", renewal_date atualizado
        ↓
Cliente acessa normalmente na próxima request
```

---

## Bloco 4 — Onboarding do Cliente Novo

Acionado quando: cliente autenticado com `whatsapp_phone_number_id` vazio na conta (indicador de primeiro acesso). O sistema redireciona automaticamente para `/onboarding`.

### Wizard de 3 passos

**Passo 1 — Perfil do Negócio**
- Nome do negócio
- Segmento (Clínica / Cursos / Serviços / Outro)

**Passo 2 — Conectar WhatsApp Business**
- Phone Number ID
- WhatsApp Business Account ID
- Token de Acesso
- Botão "Testar conexão" — faz ping na Meta API antes de salvar
- Link para guia de configuração do Meta

**Passo 3 — Conclusão**
- Confirmação de sucesso
- Três ações sugeridas: importar contatos, configurar respostas rápidas, convidar equipe
- Botão para entrar no dashboard

O wizard não substitui a documentação completa — apenas garante o mínimo para o cliente começar a usar.

---

## Variáveis de Ambiente Novas

| Variável | Descrição |
|---|---|
| `SUPER_ADMIN_EMAIL` | E-mail com acesso ao `/superadmin` |
| `SUPPORT_PHONE` | Telefone exibido na tela de suspensão |
| `SUPPORT_EMAIL` | E-mail exibido na tela de suspensão |

---

## O Que Não Muda

- Toda a lógica de inbox, contatos, automações, pipelines, broadcasts e AI
- O sistema de roles existente (owner/admin/agent/viewer) dentro de cada conta
- O mecanismo de convite por link já implementado
- RLS do Supabase — continua isolando dados por `account_id`

---

## Fora do Escopo (para versão futura)

- Integração com gateway de pagamento (Hotmart, Kiwify, Stripe)
- Suspensão automática por vencimento
- Portal do cliente para gerenciar assinatura
- Planos com limites de uso (contatos, mensagens, agentes)
- White-label por conta (logo/cores por cliente)
