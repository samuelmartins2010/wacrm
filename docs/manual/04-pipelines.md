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
