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
