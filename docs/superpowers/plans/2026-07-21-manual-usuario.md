# Manual do Usuário WaCRM — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escrever o Manual do Usuário Final do WaCRM em Português (Brasil), organizado por módulo, cobrindo tudo que um atendente ou vendedor acessa no sistema.

**Architecture:** Um arquivo Markdown por módulo, armazenados em `docs/manual/`. Um arquivo `README.md` serve como índice navegável. Cada capítulo segue a mesma estrutura: visão geral, como acessar, o que você vê, como usar, dicas.

**Tech Stack:** Markdown, Português-Brasil, estrutura de pastas em `docs/manual/`

---

## Mapeamento de Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `docs/manual/README.md` | Índice geral do manual |
| `docs/manual/introducao.md` | Introdução: o que é o WaCRM, login, navegação |
| `docs/manual/01-dashboard.md` | Módulo 1: Dashboard |
| `docs/manual/02-caixa-de-entrada.md` | Módulo 2: Caixa de Entrada |
| `docs/manual/03-contatos.md` | Módulo 3: Contatos |
| `docs/manual/04-pipelines.md` | Módulo 4: Pipelines |
| `docs/manual/05-transmissoes.md` | Módulo 5: Transmissões |
| `docs/manual/06-automacoes.md` | Módulo 6: Automações |
| `docs/manual/07-flows.md` | Módulo 7: Flows (Fluxos) |
| `docs/manual/08-agente-de-ia.md` | Módulo 8: Agente de IA |
| `docs/manual/09-configuracoes.md` | Módulo 9: Configurações |

---

### Task 1: Índice e Introdução

**Files:**
- Create: `docs/manual/README.md`
- Create: `docs/manual/introducao.md`

- [ ] **Step 1: Criar o arquivo de índice**

Criar `docs/manual/README.md` com o seguinte conteúdo:

```markdown
# Manual do Usuário — WaCRM

Bem-vindo ao manual do WaCRM. Este guia cobre todas as funcionalidades disponíveis para usuários finais da plataforma.

## Capítulos

- [Introdução](./introducao.md) — O que é o WaCRM, como fazer login e navegar
- [Módulo 1 — Dashboard](./01-dashboard.md) — Métricas, gráficos e atividades
- [Módulo 2 — Caixa de Entrada](./02-caixa-de-entrada.md) — Atendimento via WhatsApp
- [Módulo 3 — Contatos](./03-contatos.md) — Gestão de clientes e leads
- [Módulo 4 — Pipelines](./04-pipelines.md) — Acompanhamento de negócios
- [Módulo 5 — Transmissões](./05-transmissoes.md) — Envio em massa de mensagens
- [Módulo 6 — Automações](./06-automacoes.md) — Regras automáticas de atendimento
- [Módulo 7 — Flows](./07-flows.md) — Construtor visual de fluxos de conversa
- [Módulo 8 — Agente de IA](./08-agente-de-ia.md) — Assistente inteligente
- [Módulo 9 — Configurações](./09-configuracoes.md) — Perfil, segurança e aparência
```

- [ ] **Step 2: Criar o capítulo de Introdução**

Criar `docs/manual/introducao.md` com o seguinte conteúdo:

```markdown
# Introdução ao WaCRM

## O que é o WaCRM?

O WaCRM é uma plataforma de atendimento e gestão de clientes integrada ao WhatsApp. Com ele, toda a equipe compartilha uma única caixa de entrada, responde clientes em tempo real, organiza contatos, acompanha negócios em andamento e envia mensagens em massa — tudo em um só lugar.

## Como fazer login

1. Acesse o endereço do sistema fornecido pelo seu administrador.
2. Na tela de login, insira seu **e-mail** e **senha**.
3. Clique em **Entrar**.

Caso tenha esquecido sua senha, clique em **Esqueci minha senha** na tela de login e siga as instruções enviadas para o seu e-mail.

## Navegação

Após o login, você verá a barra lateral esquerda com os módulos disponíveis:

| Ícone | Módulo | O que faz |
|-------|--------|-----------|
| Gráfico | Dashboard | Visão geral de métricas e desempenho |
| Mensagem | Caixa de Entrada | Conversas do WhatsApp em tempo real |
| Pessoas | Contatos | Base de clientes e leads |
| Funil | Pipelines | Negócios em andamento |
| Rádio | Transmissões | Mensagens em massa |
| Raio | Automações | Regras automáticas |
| Fluxo | Flows | Construtor visual de fluxos |
| Robô | Agente de IA | Assistente inteligente |
| Engrenagem | Configurações | Preferências da conta |

Clique em qualquer item da barra lateral para acessar o módulo correspondente.

## Requisito importante

Para que a Caixa de Entrada funcione e as mensagens sejam enviadas e recebidas, o WhatsApp da conta precisa estar conectado. Se você ver um aviso amarelo no topo da tela, entre em contato com o administrador do sistema.
```

- [ ] **Step 3: Commit**

```bash
git add docs/manual/README.md docs/manual/introducao.md
git commit -m "docs: add manual index and introduction chapter (pt-BR)"
```

---

### Task 2: Módulo 1 — Dashboard

**Files:**
- Create: `docs/manual/01-dashboard.md`

- [ ] **Step 1: Criar o capítulo do Dashboard**

Criar `docs/manual/01-dashboard.md` com o seguinte conteúdo:

```markdown
# Módulo 1 — Dashboard

## O que é

O Dashboard é a tela inicial do WaCRM. Ele apresenta um resumo do desempenho da equipe com métricas, gráficos e um registro das atividades recentes.

## Como acessar

Clique no ícone de **gráfico** no menu lateral, ou acesse a rota `/dashboard`.

## O que você vê

### Cartões de métricas

Quatro cartões no topo da página mostram os números mais importantes:

| Cartão | O que mostra |
|--------|-------------|
| **Conversas ativas** | Quantas conversas estão abertas agora, comparado ao dia anterior |
| **Novos contatos hoje** | Quantos contatos foram criados hoje, comparado a ontem |
| **Valor de negócios abertos** | Soma em dinheiro de todos os negócios em aberto nos pipelines |
| **Mensagens enviadas hoje** | Quantas mensagens a equipe enviou hoje, comparado a ontem |

Os cartões com seta para cima (verde) indicam melhora; seta para baixo (vermelho) indica queda em relação ao período anterior.

### Gráfico de Conversas

Exibe o volume de conversas ao longo do tempo. Use as abas **7 dias**, **30 dias** ou **90 dias** para mudar o período visualizado. O gráfico carrega automaticamente na primeira vez que você seleciona cada período.

### Gráfico de Pipeline

Donut que mostra a distribuição dos negócios por estágio do pipeline. Passe o mouse sobre cada fatia para ver o nome do estágio, a quantidade de negócios e o valor total.

### Gráfico de Tempo de Resposta

Mostra a média de tempo que a equipe leva para responder às mensagens dos clientes. Útil para identificar gargalos no atendimento.

### Feed de Atividades

Lista os eventos mais recentes do sistema: novas mensagens recebidas, contatos criados, negócios movidos entre estágios, automações disparadas. Use este feed para ter uma visão rápida do que está acontecendo na plataforma.

### Ações Rápidas

Atalhos para as tarefas mais comuns, como ir para a Caixa de Entrada ou criar um novo contato.

## Dicas

- O Dashboard não atualiza automaticamente; recarregue a página para ver os dados mais recentes.
- Os valores dos cartões comparam o período atual com o anterior (hoje vs. ontem, ou período selecionado vs. anterior).
- O gráfico de conversas armazena em cache os dados por período: trocar de 30 para 7 dias e voltar para 30 não refaz a consulta.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/01-dashboard.md
git commit -m "docs: add Dashboard chapter to user manual (pt-BR)"
```

---

### Task 3: Módulo 2 — Caixa de Entrada

**Files:**
- Create: `docs/manual/02-caixa-de-entrada.md`

- [ ] **Step 1: Criar o capítulo da Caixa de Entrada**

Criar `docs/manual/02-caixa-de-entrada.md` com o seguinte conteúdo:

```markdown
# Módulo 2 — Caixa de Entrada

## O que é

A Caixa de Entrada é o coração do WaCRM. É onde todas as conversas do WhatsApp chegam e são respondidas pela equipe. Múltiplos agentes podem atender ao mesmo tempo, cada um em conversas diferentes.

## Como acessar

Clique no ícone de **mensagem** no menu lateral, ou acesse a rota `/inbox`.

## O que você vê

A tela é dividida em até três painéis:

| Painel | Localização | Conteúdo |
|--------|-------------|----------|
| **Lista de conversas** | Esquerda | Todas as conversas da conta |
| **Thread de mensagens** | Centro | Histórico e campo de resposta |
| **Informações do contato** | Direita (desktop) | Dados, tags e negócios do contato |

> **Em dispositivos móveis**, apenas um painel é exibido por vez. Selecione uma conversa para abrir a thread; use o botão **← Voltar** para retornar à lista.

## Aviso de WhatsApp desconectado

Se o WhatsApp não estiver conectado, um banner amarelo aparecerá no topo da tela. Neste caso, não é possível enviar nem receber mensagens. Contate o administrador do sistema.

---

## Como usar

### Abrir uma conversa

Na lista à esquerda, clique sobre qualquer conversa para abri-la. O número em azul ao lado do nome indica mensagens não lidas. Ao clicar, o contador zera automaticamente.

### Ler e responder mensagens

Com a conversa aberta no painel central:

1. Role para cima para ver o histórico de mensagens.
2. Digite sua resposta no campo na parte inferior da tela.
3. Pressione **Enter** ou clique no botão de envio para enviar.

### Tipos de mensagens que você pode enviar

| Tipo | Como enviar |
|------|-------------|
| Texto | Digite diretamente no campo de mensagem |
| Imagem | Clique no ícone de clipe e selecione uma imagem (PNG, JPG, WebP) |
| Vídeo | Clique no ícone de clipe e selecione um vídeo (MP4) |
| Documento | Clique no ícone de clipe e selecione um arquivo (PDF, Word, Excel, etc.) |
| Áudio | Clique no ícone de microfone para gravar uma mensagem de voz |

### Usar respostas rápidas

Respostas rápidas são mensagens pré-definidas que agilizam o atendimento.

1. No campo de mensagem, clique no **ícone ⚡** (raio) no menu de ações.
2. Selecione **Respostas Rápidas**.
3. Escolha a resposta desejada na lista.
4. O texto é inserido automaticamente no campo — edite se necessário e envie.

> Para criar novas respostas rápidas, acesse **Configurações → Respostas Rápidas**.

### Alterar o status da conversa

O status indica em que etapa do atendimento a conversa se encontra. Você pode alterá-lo pelo botão no cabeçalho da thread:

| Status | Significado |
|--------|-------------|
| **Aberta** | Conversa em andamento, aguardando resposta da equipe |
| **Pendente** | Aguardando retorno do cliente |
| **Fechada** | Atendimento encerrado |

### Atribuir uma conversa a um agente

Para organizar quem está responsável por cada conversa:

1. No cabeçalho da thread, clique no campo de atribuição.
2. Selecione o agente responsável (incluindo você mesmo).
3. Para remover a atribuição, selecione a opção sem agente.

### Painel de informações do contato (desktop)

O painel direito exibe dados do contato ativo: nome, telefone, e-mail, empresa, tags e negócios vinculados.

- Para **mostrar ou ocultar** o painel, clique no ícone de painel no cabeçalho da thread.
- A preferência é salva automaticamente para a próxima vez que você acessar a página.

### Atualização manual

Se suspeitar que mensagens novas não apareceram, clique no botão **↻ Atualizar** no cabeçalho da thread para forçar uma nova busca no banco de dados.

## Dicas

- A Caixa de Entrada atualiza em **tempo real**: novas mensagens aparecem automaticamente sem precisar recarregar a página.
- Se a conexão cair e voltar, a tela sincroniza automaticamente as mensagens perdidas.
- Quando você abre uma conversa, o contador de não lidas zera imediatamente para todos os membros da equipe que estiverem olhando a mesma tela.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/02-caixa-de-entrada.md
git commit -m "docs: add Caixa de Entrada chapter to user manual (pt-BR)"
```

---

### Task 4: Módulo 3 — Contatos

**Files:**
- Create: `docs/manual/03-contatos.md`

- [ ] **Step 1: Criar o capítulo de Contatos**

Criar `docs/manual/03-contatos.md` com o seguinte conteúdo:

```markdown
# Módulo 3 — Contatos

## O que é

A seção de Contatos é a base de dados de todos os clientes e leads cadastrados na plataforma. Aqui você encontra, adiciona, edita e organiza as pessoas com quem sua equipe se relaciona.

## Como acessar

Clique no ícone de **pessoas** no menu lateral, ou acesse a rota `/contacts`.

## O que você vê

Uma tabela com os contatos cadastrados. As colunas exibidas são:

| Coluna | Conteúdo |
|--------|----------|
| Nome | Nome completo do contato |
| Telefone | Número de WhatsApp |
| E-mail | Endereço de e-mail (se cadastrado) |
| Empresa | Nome da empresa (se cadastrado) |
| Tags | Etiquetas coloridas vinculadas ao contato |
| Criado em | Data de cadastro |

A tabela exibe **25 contatos por página**. Use os botões de navegação no rodapé para avançar ou voltar.

---

## Como usar

### Buscar um contato

Use o campo de busca no topo da página. A pesquisa funciona por **nome**, **telefone** ou **e-mail**. Os resultados aparecem à medida que você digita.

### Filtrar por tags

1. Clique no botão **Filtrar por tags** ao lado do campo de busca.
2. Marque uma ou mais tags.
3. A tabela exibe apenas os contatos que possuem pelo menos uma das tags selecionadas.
4. Para remover um filtro, clique no **x** ao lado da tag ou em **Limpar tudo**.

### Adicionar um contato

1. Clique no botão **+ Adicionar contato** no canto superior direito.
2. Preencha os campos:
   - **Telefone** (obrigatório): número no formato internacional (ex.: +5511999999999)
   - **Nome**, **E-mail**, **Empresa**: opcionais
   - **Tags**: selecione ou crie etiquetas para categorizar o contato
3. Clique em **Salvar**.

> Se o telefone informado já existir no sistema, o WaCRM exibirá o contato existente em vez de criar uma duplicata.

### Editar um contato

**Opção 1:** Clique no menu **⋯** na linha do contato → **Editar**.

**Opção 2:** Clique sobre o nome do contato para abrir a visão de detalhe → edite os campos diretamente.

Após editar, clique em **Salvar**.

### Excluir um contato

1. Clique no menu **⋯** na linha do contato → **Excluir**.
2. Confirme a exclusão na caixa de diálogo.

> **Atenção:** a exclusão é permanente e não pode ser desfeita.

### Excluir vários contatos de uma vez (seleção em massa)

1. Marque a caixa de seleção à esquerda de cada contato que deseja excluir.
   - Para selecionar todos os da página atual, marque a caixa no cabeçalho da tabela.
2. Uma barra de ações aparecerá no topo com o número de selecionados.
3. Clique em **Excluir selecionados** e confirme.

### Importar contatos via CSV

1. Clique no botão **Importar** no canto superior direito.
2. Faça o upload de um arquivo `.csv` com as seguintes colunas:
   - `name` — nome do contato
   - `phone` — telefone (formato internacional)
   - `email` — e-mail (opcional)
   - `company` — empresa (opcional)
3. Confirme a importação.

> Dica: exporte um contato existente para ver o formato correto do CSV antes de importar.

### Ver detalhes de um contato

Clique sobre o nome de qualquer contato para abrir o painel de detalhes. Nele você pode:

- Ver e editar todos os campos (incluindo campos personalizados, se configurados pelo administrador)
- Ver o histórico de conversas vinculadas ao contato
- Ver os negócios abertos ou fechados relacionados ao contato

## Dicas

- Use **tags** para segmentar contatos por tipo (ex.: "Lead Quente", "Cliente Ativo", "Suporte") — isso facilita filtrar e criar transmissões direcionadas.
- A busca e os filtros de tag podem ser combinados: busque por nome E filtre por tag ao mesmo tempo.
- A lista sempre exibe os contatos mais recentes primeiro (ordenação por data de criação, do mais novo ao mais antigo).
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/03-contatos.md
git commit -m "docs: add Contatos chapter to user manual (pt-BR)"
```

---

### Task 5: Módulo 4 — Pipelines

**Files:**
- Create: `docs/manual/04-pipelines.md`

- [ ] **Step 1: Criar o capítulo de Pipelines**

Criar `docs/manual/04-pipelines.md` com o seguinte conteúdo:

```markdown
# Módulo 4 — Pipelines

## O que é

Pipelines são quadros kanban para acompanhar negócios em diferentes estágios — desde o primeiro contato com um lead até o fechamento da venda. Cada negócio é representado por um card que avança pelas colunas conforme o processo de venda evolui.

## Como acessar

Clique no ícone de **funil** no menu lateral, ou acesse a rota `/pipelines`.

## O que você vê

### Seletor de pipeline

No canto superior esquerdo há um menu suspenso com todos os pipelines cadastrados. Clique para alternar entre eles. O sistema cria automaticamente um pipeline padrão chamado **Sales Pipeline** quando você acessa a página pela primeira vez.

### Indicadores de performance

Acima do quadro, uma barra de resumo mostra para cada estágio: quantos negócios existem e o valor total acumulado. Use esses números para identificar onde os negócios estão represados.

### Quadro kanban

O quadro exibe colunas que representam os estágios do pipeline. Os estágios padrão são:

| Estágio | Cor | Significado |
|---------|-----|-------------|
| New Lead | Azul | Primeiro contato identificado |
| Qualified | Amarelo | Lead com potencial confirmado |
| Proposal Sent | Laranja | Proposta enviada ao cliente |
| Negotiation | Roxo | Em negociação ativa |
| Won | Verde | Negócio fechado com sucesso |

Cada card de negócio exibe: nome do negócio, contato vinculado, valor e responsável.

---

## Como usar

### Criar um negócio

**Opção 1:** Clique no botão **+ Adicionar Negócio** no canto superior direito.

**Opção 2:** Clique no ícone **+** dentro de uma coluna específica para já criar o negócio naquele estágio.

Preencha os campos do formulário:

| Campo | Descrição |
|-------|-----------|
| **Nome** | Título do negócio (ex.: "Proposta Empresa ABC") |
| **Contato** | Cliente vinculado ao negócio — selecione da lista de contatos |
| **Valor** | Valor estimado do negócio |
| **Estágio** | Coluna onde o negócio começa |
| **Responsável** | Agente responsável por esse negócio |
| **Data prevista** | Prazo esperado para fechamento |

Clique em **Salvar** para criar o card no quadro.

### Mover um negócio entre estágios

Clique e **arraste o card** de uma coluna para outra. O sistema salva o novo estágio automaticamente assim que você solta o card.

### Editar um negócio

Clique sobre qualquer card para abrir o formulário de edição. Altere os campos desejados e clique em **Salvar**.

### Excluir um negócio

Abra o formulário de edição do card e clique em **Excluir**. Confirme na caixa de diálogo.

> **Atenção:** a exclusão é permanente.

### Alternar entre pipelines

Clique no seletor de pipeline no canto superior esquerdo e escolha outro pipeline da lista. O quadro carrega automaticamente os estágios e negócios do pipeline selecionado.

## Dicas

- Se um estágio tem muitos cards com datas de fechamento vencidas, é sinal de que os negócios naquele ponto precisam de atenção.
- O valor exibido nos indicadores acima do quadro é a soma de **todos** os negócios do estágio, não apenas os vencidos ou próximos do prazo.
- Você pode ter múltiplos pipelines para diferentes produtos, regiões ou equipes (a criação de novos pipelines é feita pelo administrador).
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/04-pipelines.md
git commit -m "docs: add Pipelines chapter to user manual (pt-BR)"
```

---

### Task 6: Módulo 5 — Transmissões

**Files:**
- Create: `docs/manual/05-transmissoes.md`

- [ ] **Step 1: Criar o capítulo de Transmissões**

Criar `docs/manual/05-transmissoes.md` com o seguinte conteúdo:

```markdown
# Módulo 5 — Transmissões

## O que é

Transmissões permitem enviar uma mensagem para muitos contatos de uma vez pelo WhatsApp, usando templates aprovados pelo Meta. É ideal para comunicados, promoções, lembretes e campanhas.

## Como acessar

Clique no ícone de **rádio** no menu lateral, ou acesse a rota `/broadcasts`.

## O que você vê

Uma tabela com todas as transmissões criadas, exibindo:

| Coluna | Conteúdo |
|--------|----------|
| Nome | Identificador da transmissão |
| Template | Nome do template usado |
| Destinatários | Número total de contatos que receberam |
| Entrega | Percentual de mensagens entregues ao dispositivo do contato |
| Leitura | Percentual de mensagens abertas pelo contato |
| Status | Estado atual da transmissão |
| Data | Data de criação |

### Status possíveis

| Status | Significado |
|--------|-------------|
| **Enviando** | Transmissão em andamento (ponto amarelo piscando) |
| **Concluída** | Todos os envios foram processados |
| **Rascunho** | Criada mas ainda não enviada |
| **Falha** | Erro no processamento |

Enquanto uma transmissão está sendo enviada, uma **barra de progresso animada** aparece no topo da página.

---

## Como usar

### Criar e enviar uma transmissão

1. Clique no botão **+ Nova Transmissão** no canto superior direito.
2. Preencha o formulário:
   - **Nome:** um título interno para identificar a transmissão (não aparece para o cliente)
   - **Template:** selecione o template de mensagem aprovado pelo WhatsApp que será enviado
   - **Destinatários:** escolha os contatos que vão receber a mensagem (por tag ou seleção direta)
3. Revise o resumo e clique em **Enviar**.

> Os templates precisam ser previamente aprovados pelo WhatsApp Business (Meta) e configurados pelo administrador. Você não pode enviar texto livre em transmissões — apenas templates aprovados.

### Acompanhar o progresso

Durante o envio, a tabela atualiza automaticamente a cada 5 segundos. As taxas de **entrega** e **leitura** aumentam conforme os destinatários recebem e abrem as mensagens.

### Ver detalhes de uma transmissão

Clique sobre qualquer linha da tabela para abrir o relatório detalhado da transmissão, com estatísticas por destinatário.

## Dicas

- Use **tags** nos contatos para segmentar bem os destinatários — isso evita enviar mensagens irrelevantes e reduz o risco de bloqueio pelo WhatsApp.
- A taxa de **leitura** pode demorar horas para subir, pois depende de o contato abrir o aplicativo e visualizar a mensagem.
- Transmissões com status **Falha** geralmente indicam problema de configuração do WhatsApp. Contate o administrador.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/05-transmissoes.md
git commit -m "docs: add Transmissões chapter to user manual (pt-BR)"
```

---

### Task 7: Módulo 6 — Automações

**Files:**
- Create: `docs/manual/06-automacoes.md`

- [ ] **Step 1: Criar o capítulo de Automações**

Criar `docs/manual/06-automacoes.md` com o seguinte conteúdo:

```markdown
# Módulo 6 — Automações

## O que é

Automações são regras que executam ações automaticamente quando um determinado evento acontece — por exemplo, enviar uma mensagem de boas-vindas toda vez que um novo contato manda a primeira mensagem.

## Como acessar

Clique no ícone de **raio** no menu lateral, ou acesse a rota `/automations`.

## O que você vê

Uma lista de cards, cada um representando uma automação. Cada card exibe:

- Nome e descrição da automação
- Tipo de gatilho (evento que dispara a automação)
- Número de execuções até agora
- Data da última execução
- Indicador pulsante (automação ativa) ou estático (pausada)
- Toggle de ativar/desativar

---

## Como usar

### Usar um template pronto

O WaCRM oferece quatro templates para os cenários mais comuns. Eles aparecem automaticamente na página quando você tem menos de três automações criadas:

| Template | O que faz |
|----------|-----------|
| **Mensagem de boas-vindas** | Envia uma mensagem automática quando um contato manda a primeira mensagem |
| **Fora do escritório** | Responde automaticamente fora do horário comercial informando o retorno |
| **Qualificador de leads** | Faz perguntas iniciais para identificar o interesse do lead |
| **Lembrete de acompanhamento** | Envia uma mensagem de follow-up após um período sem resposta do contato |

Para usar um template:
1. Clique no card do template desejado.
2. O formulário de criação abre com os campos já pré-preenchidos.
3. Revise e ajuste o que precisar.
4. Clique em **Salvar**.

### Criar uma automação do zero

1. Clique no botão **+ Criar automação** no canto superior direito.
2. Preencha:
   - **Nome:** título interno da automação
   - **Descrição:** (opcional) o que ela faz
   - **Gatilho:** o evento que vai disparar a automação
   - **Ações:** o que acontece quando o gatilho ocorre (ex.: enviar mensagem, atribuir conversa)
3. Clique em **Salvar**.

### Ativar e desativar uma automação

Use o **toggle** (chave liga/desliga) no canto direito de cada card:
- **Ligado (azul):** automação ativa — será disparada quando o gatilho ocorrer
- **Desligado:** automação pausada — o gatilho é ignorado

A mudança é salva imediatamente.

### Editar uma automação

Clique sobre o nome ou descrição do card para abrir o editor da automação. Faça as alterações e salve.

### Duplicar uma automação

Clique no menu **⋯** no card → **Duplicar**. Uma cópia é criada com o prefixo "Cópia de" no nome. Útil para criar variações de uma regra existente.

### Ver logs de execução

Clique no menu **⋯** no card → **Ver logs**. A página de logs mostra cada vez que a automação foi disparada, com data, hora e resultado (sucesso ou erro).

### Excluir uma automação

Clique no menu **⋯** no card → **Excluir** → Confirme.

> **Atenção:** a exclusão é permanente. Se quiser parar temporariamente, prefira **desativar** em vez de excluir.

## Dicas

- Desative uma automação antes de editá-la para evitar que ela dispare com configurações incompletas durante a edição.
- Os logs são a principal ferramenta para diagnosticar por que uma automação não está funcionando como esperado.
- Uma automação ativa só dispara se o gatilho configurado ocorrer — criá-la não executa nada imediatamente.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/06-automacoes.md
git commit -m "docs: add Automações chapter to user manual (pt-BR)"
```

---

### Task 8: Módulo 7 — Flows

**Files:**
- Create: `docs/manual/07-flows.md`

- [ ] **Step 1: Criar o capítulo de Flows**

Criar `docs/manual/07-flows.md` com o seguinte conteúdo:

```markdown
# Módulo 7 — Flows (Fluxos)

> **Beta:** Este módulo está em fase de lançamento gradual. Funcionalidades podem mudar em versões futuras.

## O que é

Flows são fluxos de conversa criados visualmente — sequências de mensagens, perguntas e decisões que o sistema executa automaticamente quando um gatilho é ativado. Diferente das Automações (que executam uma ação simples), os Flows permitem criar jornadas de conversa com múltiplos passos e bifurcações.

## Como acessar

Clique no ícone de **fluxo** no menu lateral, ou acesse a rota `/flows`.

## O que você vê

Uma grade de cards, cada um representando um fluxo. Cada card exibe:

- Nome e descrição do fluxo
- **Status:** Rascunho (cinza), Ativo (verde), Arquivado (cinza escuro)
- Tipo de gatilho que dispara o fluxo
- Número de execuções

### Status dos fluxos

| Status | Significado |
|--------|-------------|
| **Rascunho** | Fluxo em edição, ainda não publicado |
| **Ativo** | Funcionando em produção — disparará quando o gatilho ocorrer |
| **Arquivado** | Desativado e fora de uso, mas mantido para histórico |

---

## Como usar

### Criar um fluxo

1. Clique no botão **+ Novo Fluxo** no canto superior direito.
2. Escolha como começar:

**A partir de um template:** clique em um dos templates disponíveis. Cada template já vem com blocos pré-configurados para casos de uso comuns (ex.: menu de atendimento, captura de dados do lead).

**Em branco:** digite um nome para o fluxo no campo de texto e clique em **Criar em branco**. O editor visual abre com uma tela vazia.

### Tipos de gatilho

Ao criar ou editar um fluxo, você define o que dispara sua execução:

| Gatilho | Quando dispara |
|---------|----------------|
| **Palavra-chave** | Quando o contato envia uma mensagem contendo a palavra definida (ex.: "oi", "preço", "suporte") |
| **Primeira mensagem recebida** | Na primeira vez que um contato entra em contato pelo WhatsApp |
| **Manual** | Apenas quando um agente aciona o fluxo manualmente para um contato específico |

### Editor visual

O editor é uma tela onde você monta o fluxo conectando **blocos**:

- Cada bloco representa uma ação ou decisão (ex.: enviar mensagem, fazer uma pergunta, aguardar resposta)
- Arraste blocos da barra lateral para a tela
- Conecte blocos clicando na saída de um e arrastando até a entrada do próximo
- Configure cada bloco clicando sobre ele

Quando terminar, clique em **Publicar** para ativar o fluxo (muda o status de Rascunho para Ativo).

### Editar um fluxo existente

Clique no botão **Editar** no card do fluxo. O editor abre com a configuração atual. Faça as alterações e publique novamente.

> Editar um fluxo ativo o coloca em modo rascunho até você publicar novamente. Durante a edição, o fluxo continua rodando com a versão anterior.

### Excluir um fluxo

Clique no botão **Excluir** no card do fluxo. Confirme na caixa de diálogo.

> **Atenção:** a exclusão é permanente. Se quiser parar o fluxo temporariamente, prefira arquivá-lo.

## Dicas

- Comece pelos templates — eles cobrem os casos mais comuns e são uma boa referência de como estruturar um fluxo.
- Um fluxo com gatilho de **Palavra-chave** sem nenhuma palavra configurada nunca disparará. Verifique as palavras na configuração do gatilho.
- Flows e Automações podem coexistir: use Automações para ações simples de um passo e Flows para jornadas de múltiplos passos.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/07-flows.md
git commit -m "docs: add Flows chapter to user manual (pt-BR)"
```

---

### Task 9: Módulo 8 — Agente de IA

**Files:**
- Create: `docs/manual/08-agente-de-ia.md`

- [ ] **Step 1: Criar o capítulo do Agente de IA**

Criar `docs/manual/08-agente-de-ia.md` com o seguinte conteúdo:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/08-agente-de-ia.md
git commit -m "docs: add Agente de IA chapter to user manual (pt-BR)"
```

---

### Task 10: Módulo 9 — Configurações

**Files:**
- Create: `docs/manual/09-configuracoes.md`

- [ ] **Step 1: Criar o capítulo de Configurações**

Criar `docs/manual/09-configuracoes.md` com o seguinte conteúdo:

```markdown
# Módulo 9 — Configurações

## O que é

A página de Configurações reúne as preferências pessoais e opções de conta disponíveis para o usuário final. Seções exclusivas de administradores (WhatsApp, Templates, Campos, Membros, Chaves de API) não são abordadas neste manual.

## Como acessar

Clique no ícone de **engrenagem** no menu lateral, ou acesse a rota `/settings`.

## O que você vê

Uma barra de navegação lateral com as seções disponíveis. Clique em cada seção para acessá-la.

---

## Seções disponíveis

### Perfil

Gerencie suas informações pessoais de exibição:

1. Acesse **Configurações → Perfil**.
2. Edite os campos desejados:
   - **Nome de exibição:** como seu nome aparece para outros agentes e nos registros do sistema
   - **Foto de perfil:** imagem associada à sua conta
   - **E-mail:** endereço de e-mail da conta
3. Clique em **Salvar** para confirmar as alterações.

---

### Segurança

Gerencie sua senha e configurações de acesso:

1. Acesse **Configurações → Segurança**.
2. Para alterar a senha:
   - Informe a **senha atual**
   - Digite a **nova senha**
   - Confirme a nova senha
3. Clique em **Salvar**.

> Use uma senha forte: mínimo de 8 caracteres, com letras maiúsculas, minúsculas, números e símbolos.

---

### Aparência

Escolha o tema visual da plataforma:

1. Acesse **Configurações → Aparência**.
2. Selecione uma das opções:
   - **Claro:** interface com fundo branco
   - **Escuro:** interface com fundo escuro (mais confortável em ambientes com pouca luz)
   - **Automático:** segue a preferência configurada no sistema operacional do seu dispositivo
3. A mudança é aplicada imediatamente.

---

### Respostas Rápidas

Gerencie as mensagens pré-definidas disponíveis na Caixa de Entrada:

#### O que são

Respostas Rápidas são textos que você pode inserir na Caixa de Entrada com apenas alguns cliques, sem precisar digitar a mensagem inteira toda vez. Úteis para saudações, despedidas, políticas de entrega, perguntas frequentes, etc.

#### Como criar uma resposta rápida

1. Acesse **Configurações → Respostas Rápidas**.
2. Clique em **+ Adicionar**.
3. Preencha:
   - **Título:** nome interno para identificar a resposta (ex.: "Saudação inicial")
   - **Conteúdo:** o texto da mensagem que será enviada
4. Clique em **Salvar**.

#### Como editar ou excluir

- Clique no ícone de **lápis** ao lado da resposta para editar.
- Clique no ícone de **lixeira** para excluir — a exclusão é permanente.

#### Como usar na Caixa de Entrada

1. Abra uma conversa na Caixa de Entrada.
2. No compositor de mensagens, clique no **ícone ⚡** (raio) no menu de ações.
3. Selecione **Respostas Rápidas**.
4. Clique na resposta desejada — o texto é inserido automaticamente no campo de mensagem.
5. Revise e envie.

## Dicas

- Crie respostas rápidas para as mensagens que você escreve com mais frequência — isso economiza tempo e mantém a comunicação padronizada.
- O título da resposta rápida não aparece para o cliente, então use nomes descritivos que ajudem você a encontrá-la rapidamente na lista.
- Qualquer membro da equipe pode usar as respostas rápidas cadastradas — elas são compartilhadas entre todos os agentes da conta.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual/09-configuracoes.md
git commit -m "docs: add Configurações chapter to user manual (pt-BR)"
```

---

## Self-Review

### Cobertura do spec

| Seção do spec | Task que implementa |
|---------------|---------------------|
| Introdução | Task 1 |
| Módulo 1 — Dashboard | Task 2 |
| Módulo 2 — Caixa de Entrada | Task 3 |
| Módulo 3 — Contatos | Task 4 |
| Módulo 4 — Pipelines | Task 5 |
| Módulo 5 — Transmissões | Task 6 |
| Módulo 6 — Automações | Task 7 |
| Módulo 7 — Flows | Task 8 |
| Módulo 8 — Agente de IA | Task 9 |
| Módulo 9 — Configurações | Task 10 |
| Índice (README) | Task 1 |

Cobertura: 100%. Sem gaps.

### Placeholder scan

Nenhum TBD, TODO ou referência incompleta encontrado. Todo o conteúdo dos capítulos está escrito por extenso.

### Consistência

- "Respostas Rápidas" usa ⚡ (ícone de raio) em todos os capítulos onde é mencionado — consistente com o código (`Zap` icon no `message-composer.tsx`)
- Todos os caminhos de rota (`/inbox`, `/contacts`, `/pipelines`, etc.) correspondem às rotas encontradas no código
- Status de transmissão (enviando, concluída, rascunho, falha) correspondem aos valores `sending`, `done`, `draft`, `failed` no código
- Status de flows (draft, active, archived) correspondem aos valores no código
