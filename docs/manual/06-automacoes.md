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
