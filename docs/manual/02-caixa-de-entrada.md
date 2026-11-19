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
