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

> **Atenção:** a exclusão é permanente.

## Dicas

- Comece pelos templates — eles cobrem os casos mais comuns e são uma boa referência de como estruturar um fluxo.
- Um fluxo com gatilho de **Palavra-chave** sem nenhuma palavra configurada nunca disparará. Verifique as palavras na configuração do gatilho.
- Flows e Automações podem coexistir: use Automações para ações simples de um passo e Flows para jornadas de múltiplos passos.
