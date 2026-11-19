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

> Dica: exporte um contato existente para ver o formato correto do CSV antes de importar em massa.

### Ver detalhes de um contato

Clique sobre o nome de qualquer contato para abrir o painel de detalhes. Nele você pode:

- Ver e editar todos os campos (incluindo campos personalizados, se configurados pelo administrador)
- Ver o histórico de conversas vinculadas ao contato
- Ver os negócios abertos ou fechados relacionados ao contato

## Dicas

- Use **tags** para segmentar contatos por tipo (ex.: "Lead Quente", "Cliente Ativo", "Suporte") — isso facilita filtrar e criar transmissões direcionadas.
- A busca e os filtros de tag podem ser combinados: busque por nome E filtre por tag ao mesmo tempo.
- A lista sempre exibe os contatos mais recentes primeiro (ordenação por data de criação, do mais novo ao mais antigo).
