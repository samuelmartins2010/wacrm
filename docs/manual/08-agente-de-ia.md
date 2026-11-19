# Módulo 8 — Agente de IA

## O que é

O Agente de IA é um assistente inteligente que pode ser configurado para responder conversas do WhatsApp automaticamente, com base em um contexto e instruções definidos pela equipe.

## Como acessar

Clique no ícone de **robô** no menu lateral, ou acesse a rota `/agents`.

## O que você vê

A página possui três abas:

| Aba | Conteúdo |
|-----|----------|
| **Playground** | Interface de chat para testar o agente |
| **Configurar** | Definir o modelo de IA e as instruções |
| **Uso** | Estatísticas de consumo (apenas administradores) |

> Se o agente ainda não foi configurado, a página abre direto na aba **Configurar**. Após configurar, ela abre no **Playground**.

---

## Como usar

### Testar o agente (Playground)

O Playground simula como o agente responde a mensagens reais.

1. Clique na aba **Playground**.
2. Digite uma mensagem no campo de chat e pressione Enter.
3. O agente responde com base nas instruções configuradas.

Use o Playground para:
- Verificar se o agente entende as perguntas dos clientes
- Ajustar o contexto e as instruções antes de ativar o agente em produção
- Testar casos extremos (perguntas fora do escopo, linguagem informal, etc.)

### Configurar o agente

1. Clique na aba **Configurar**.
2. Preencha os campos:
   - **Modelo:** selecione o modelo de IA que o agente vai usar
   - **Contexto / Instruções:** descreva quem é o agente, o que ele sabe e como deve responder (ex.: "Você é um assistente de atendimento da Empresa X. Responda apenas sobre nossos produtos. Seja cordial e objetivo.")
3. Clique em **Salvar**.

Após salvar, volte ao Playground para testar as mudanças.

### Ver estatísticas de uso (apenas administradores)

A aba **Uso** exibe:
- Gráfico de tokens consumidos pelo agente ao longo do tempo
- Total acumulado no período

Esta aba é visível apenas para usuários com perfil de administrador.

## Dicas

- Quanto mais específico for o contexto nas instruções, melhor o agente responde. Inclua: o que ele pode e não pode responder, o tom de voz esperado, e exemplos de perguntas frequentes.
- Sempre teste no Playground antes de ativar o agente para atendimento real.
- Se o agente der respostas incorretas, revise as instruções na aba **Configurar** — provavelmente faltam informações ou há ambiguidade no contexto fornecido.
