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
