---
name: manual-usuario-wacrm
description: Especificação do Manual do Usuário Final do WaCRM — estrutura, escopo e conteúdo de cada módulo
metadata:
  type: project
---

# Manual do Usuário WaCRM — Especificação de Design

**Data:** 2026-07-21
**Público-alvo:** Usuários finais (atendentes e vendedores)
**Idioma:** Português – Brasil
**Formato:** Documento escrito por módulo (Markdown)

---

## Visão Geral

O WaCRM é um CRM para WhatsApp com caixa de entrada compartilhada, gestão de contatos, pipelines de vendas, transmissões em massa, automações, fluxos visuais e agente de IA. Este manual cobre tudo que o usuário final acessa no sistema, organizado por módulo.

Cada capítulo segue a mesma estrutura interna:
1. **O que é** — explicação de uma linha sobre o propósito do módulo
2. **Como acessar** — onde encontrar no menu lateral
3. **O que você vê** — descrição visual da tela principal
4. **Como usar** — passo a passo das ações principais
5. **Dicas e avisos** — comportamentos importantes ou armadilhas comuns

---

## Introdução

**Conteúdo:**
- O que é o WaCRM e para que serve
- Como fazer login (tela de login, recuperação de senha)
- Visão geral da navegação: barra lateral, cabeçalho, notificações
- Requisitos de acesso (conta e WhatsApp precisam estar conectados)

---

## Módulo 1 — Dashboard

**O que é:** Painel de visão geral com métricas e gráficos do desempenho da equipe.

**Conteúdo:**
- **Cartões de métricas:** conversas ativas, novos contatos do dia, valor total de negócios abertos, mensagens enviadas hoje — com comparativo ao dia/período anterior
- **Gráfico de conversas:** volume de conversas nos últimos 7, 30 ou 90 dias (trocar o período clicando nas abas)
- **Gráfico de pipeline:** donut com distribuição de negócios por estágio e valor total
- **Gráfico de tempo de resposta:** média de tempo que a equipe leva para responder
- **Feed de atividades:** registro dos eventos recentes (novas mensagens, contatos criados, negócios movidos)
- **Ações rápidas:** atalhos para as tarefas mais comuns

---

## Módulo 2 — Caixa de Entrada

**O que é:** Central de atendimento onde todas as conversas do WhatsApp chegam e são respondidas pela equipe.

**Conteúdo:**

### Lista de conversas (painel esquerdo)
- Como as conversas aparecem (nome do contato, prévia da última mensagem, horário, badge de não lidas)
- Como clicar para abrir uma conversa
- Aviso de WhatsApp não conectado (banner amarelo no topo)

### Thread de mensagens (painel central)
- Como ler o histórico de mensagens
- Como digitar e enviar uma resposta
- Tipos de mensagens suportados (texto, áudio, imagem, documento)
- Como usar respostas rápidas (atalho para mensagens pré-definidas)
- Botão de atualização manual

### Status da conversa
- **Aberta:** conversa em andamento
- **Pendente:** aguardando resposta do contato
- **Fechada:** atendimento encerrado
- Como alterar o status (botão no cabeçalho da thread)

### Atribuição a agentes
- Como atribuir uma conversa a si mesmo ou a outro agente
- Como remover a atribuição

### Painel de contato (painel direito — desktop)
- Informações do contato (nome, telefone, e-mail, empresa, tags)
- Negócios vinculados ao contato
- Notas sobre o contato
- Como mostrar/ocultar o painel usando o botão no cabeçalho

### Uso em dispositivos móveis
- Em telas pequenas, lista e thread alternam em tela cheia
- Botão "voltar" para retornar à lista de conversas

---

## Módulo 3 — Contatos

**O que é:** Base de dados de todos os clientes e leads cadastrados.

**Conteúdo:**

### Visualizar e buscar contatos
- Tabela com nome, telefone, e-mail, empresa, tags e data de cadastro
- Campo de busca (pesquisa por nome, telefone ou e-mail)
- Filtro por tags (selecionar uma ou mais tags para filtrar)
- Paginação (25 contatos por página)

### Adicionar um contato
- Clicar em "Adicionar contato"
- Preencher nome, telefone (obrigatório), e-mail, empresa, tags
- Salvar

### Editar um contato
- Abrir o menu de ações (⋯) na linha do contato → Editar
- Ou clicar no contato para abrir a visão de detalhe e editar por lá

### Excluir um contato
- Menu de ações (⋯) → Excluir → Confirmar na caixa de diálogo
- **Atenção:** a exclusão é permanente

### Seleção em massa
- Marcar a caixa de seleção em um ou mais contatos
- Usar a ação "Excluir selecionados" na barra que aparece

### Importar contatos via CSV
- Clicar em "Importar"
- Fazer upload de arquivo CSV com as colunas esperadas (nome, telefone, e-mail, empresa)
- Confirmar a importação

### Visão de detalhe do contato
- Clicar sobre o nome do contato para abrir o painel de detalhe
- Ver e editar todos os campos, incluindo campos personalizados
- Ver histórico de conversas e negócios vinculados

---

## Módulo 4 — Pipelines

**O que é:** Quadro kanban para acompanhar negócios em progresso, do primeiro contato até o fechamento.

**Conteúdo:**

### Entendendo o quadro
- Colunas representam estágios (ex.: Novo Lead, Qualificado, Proposta Enviada, Negociação, Ganho)
- Cada card é um negócio com nome, contato vinculado e valor
- Cor da coluna identifica o estágio

### Selecionar um pipeline
- Dropdown no canto superior esquerdo para alternar entre pipelines cadastrados

### Criar um negócio
- Clicar em "+ Adicionar Negócio" no topo ou no "+" dentro de uma coluna
- Preencher nome do negócio, contato vinculado, valor, data prevista de fechamento, responsável
- Salvar

### Mover um negócio entre estágios
- Arrastar o card de uma coluna para outra
- O estágio é salvo automaticamente

### Editar ou excluir um negócio
- Clicar no card para abrir o formulário de edição
- Alterar os campos e salvar, ou excluir o negócio

### Indicadores de performance (analytics)
- Resumo acima do quadro: total de negócios por estágio e valor acumulado
- Ajuda a identificar gargalos no funil

---

## Módulo 5 — Transmissões

**O que é:** Ferramenta para enviar mensagens em massa para um grupo de contatos via WhatsApp.

**Conteúdo:**

### Lista de transmissões
- Tabela com nome, template usado, número de destinatários, taxa de entrega, taxa de leitura, status e data
- Status possíveis: rascunho, enviando, concluída, falha
- Barra de progresso animada no topo quando uma transmissão está sendo enviada

### Criar uma transmissão
- Clicar em "Nova Transmissão"
- Nomear a transmissão
- Selecionar o template de mensagem aprovado pelo WhatsApp
- Selecionar os destinatários (por tag ou lista de contatos)
- Enviar

### Acompanhar resultados
- Clicar em uma transmissão para ver o detalhamento
- Taxas de entrega e leitura exibidas como barras de progresso
- A página atualiza automaticamente enquanto o envio está em curso

---

## Módulo 6 — Automações

**O que é:** Regras automáticas que executam ações (como enviar mensagens) quando determinados eventos acontecem.

**Conteúdo:**

### Lista de automações
- Cards com nome, descrição, tipo de gatilho, número de execuções, data da última execução e status ativo/inativo

### Templates prontos
- **Mensagem de boas-vindas:** dispara ao receber a primeira mensagem de um contato
- **Fora do escritório:** responde automaticamente fora do horário comercial
- **Qualificador de leads:** faz perguntas iniciais para classificar o lead
- **Lembrete de acompanhamento:** envia mensagem de follow-up após período de inatividade
- Clicar em um template para criar uma automação pré-configurada

### Criar uma automação do zero
- Clicar em "Criar automação"
- Nomear e descrever
- Escolher o gatilho (tipo de evento que dispara a automação)
- Definir as ações (ex.: enviar mensagem, atribuir agente)
- Salvar

### Ativar e desativar
- Toggle (chave) na lista de automações — ligado = ativa, desligado = pausada
- A mudança é imediata

### Duplicar uma automação
- Menu de ações (⋯) → Duplicar
- Útil para criar variações de uma automação existente

### Ver logs de execução
- Menu de ações (⋯) → Ver logs
- Mostra cada vez que a automação foi disparada e o resultado

---

## Módulo 7 — Flows (Fluxos)

**O que é:** Construtor visual de fluxos de conversa — permite criar sequências de mensagens e decisões usando blocos conectados, disparados por gatilhos específicos.

> **Beta:** este módulo está em fase de lançamento gradual. Algumas funcionalidades podem mudar.

**Conteúdo:**

### Lista de fluxos
- Cards com nome, status (rascunho / ativo / arquivado), tipo de gatilho e número de execuções
- Status ativo = fluxo funcionando em produção; rascunho = ainda em edição

### Criar um fluxo
- Clicar em "Novo Fluxo"
- Escolher entre partir de um template ou em branco
- Nomear o fluxo e abrir o editor visual

### Tipos de gatilho
- **Palavra-chave:** dispara quando o contato envia uma mensagem contendo a palavra definida
- **Primeira mensagem recebida:** dispara na primeira vez que um contato entra em contato
- **Manual:** acionado manualmente por um agente

### Editor visual
- Tela com blocos (nós) conectados por linhas
- Cada bloco representa uma ação ou decisão (enviar mensagem, fazer pergunta, bifurcar fluxo)
- Arrastar e conectar blocos para montar o fluxo
- Salvar e publicar para ativar

### Editar e excluir um fluxo
- Clicar em "Editar" no card do fluxo para abrir o editor
- "Excluir" remove permanentemente — confirmação necessária

---

## Módulo 8 — Agente de IA

**O que é:** Assistente de inteligência artificial que pode responder conversas automaticamente com base em um contexto configurado.

**Conteúdo:**

### Playground
- Interface de chat para testar como o agente responde antes de ativar em produção
- Digite uma mensagem e veja a resposta gerada pelo modelo configurado
- Útil para validar o comportamento antes de usar com clientes reais

### Configuração (aba Configurar)
- Definir o modelo de IA a ser usado
- Inserir o contexto/instruções do agente (o que ele sabe, como deve responder, tom de voz)
- Salvar configuração

### Uso (aba Uso — apenas administradores)
- Gráfico de tokens consumidos pelo agente ao longo do tempo
- Ajuda a monitorar o custo de uso da IA

---

## Módulo 9 — Configurações

**O que é:** Página de preferências pessoais e configurações da conta acessíveis ao usuário final.

> Algumas seções (WhatsApp, Templates, Campos, Membros, Chaves de API) são exclusivas de administradores e não estão cobertas neste manual.

**Conteúdo:**

### Perfil
- Alterar nome de exibição, foto de perfil e e-mail
- Salvar alterações

### Segurança
- Alterar senha
- Configurações de autenticação

### Aparência
- Alternar entre tema claro, escuro ou automático (seguir preferência do sistema)

### Respostas Rápidas
- Lista de mensagens pré-definidas reutilizáveis na Caixa de Entrada
- Adicionar uma nova resposta rápida (título + conteúdo)
- Editar e excluir respostas existentes
- Como usar na Caixa de Entrada: clicar no botão de ações do compositor (ícone ⚡) e selecionar "Respostas Rápidas"

---

## Decisões de Design

- **Escopo:** apenas funcionalidades acessíveis ao usuário final; funcionalidades de administrador (configurar WhatsApp, gerenciar membros, chaves de API) serão cobertas em um manual separado
- **Tom:** direto e prático, sem jargão técnico
- **Formato de saída:** Markdown, um arquivo por módulo para facilitar manutenção futura
- **Screenshots:** não incluídas na especificação; devem ser adicionadas durante a produção final do manual
