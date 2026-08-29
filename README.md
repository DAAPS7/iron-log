# Iron Log — deploy no Netlify

Este projeto já não é um único ficheiro HTML: tem uma pasta `public/` (o site)
e uma pasta `netlify/functions/` (o "servidor", em forma de funções serverless
que usam Netlify Blobs para guardar contas e dados). Por isso **não dá para
arrastar só o `.html` para o Netlify Drop** — precisa de ser publicado como
projeto.

## Passo a passo (mais simples: Netlify CLI)

1. Extrai o `.zip` e abre um terminal dentro da pasta `iron-log-netlify/`.
2. Instala as dependências:
   ```
   npm install
   ```
3. Instala a Netlify CLI (se ainda não tiveres):
   ```
   npm install -g netlify-cli
   netlify login
   ```
4. Faz o deploy:
   ```
   netlify deploy
   ```
   Segue as instruções (escolhe "create a new site"). Isto cria um deploy de
   pré-visualização. Quando estiveres satisfeito:
   ```
   netlify deploy --prod
   ```

## Alternativa: ligar a um repositório Git

1. Cria um repositório no GitHub e faz `git push` desta pasta.
2. No painel do Netlify: **Add new site → Import an existing project** → escolhe o repositório.
3. O Netlify vai detetar o `netlify.toml` automaticamente (publish dir `public`, functions dir `netlify/functions`). Não precisas de configurar mais nada de build.

## Importante: configura o acesso às Netlify Blobs (BLOBS_SITE_ID / BLOBS_TOKEN)

O Netlify devia injetar automaticamente o acesso às Blobs nas funções em
produção — mas há um bug conhecido e recorrente da plataforma em que isso
falha com o erro `MissingBlobsEnvironmentError`, mesmo com tudo configurado
corretamente (ver [issue no GitHub](https://github.com/netlify/blobs/issues/175)
e vários tópicos no fórum de suporte do Netlify sobre isto). Por isso, este
projeto está preparado para configurar isso manualmente — e vais precisar de
fazer isso para funcionar de forma fiável:

1. **Site ID**: no painel do Netlify, vai a **Project configuration → General
   → Project information** e copia o **Project ID** (também chamado Site ID).
2. **Personal Access Token**: vai a **User settings → Applications → Personal
   access tokens → New access token**, dá-lhe um nome (ex: "iron-log-blobs")
   e copia o token gerado (só o vês uma vez).
3. Volta ao site → **Site settings → Environment variables** e cria duas
   variáveis:
   ```
   BLOBS_SITE_ID = <o Project ID que copiaste>
   BLOBS_TOKEN   = <o Personal Access Token que copiaste>
   ```
4. Faz um novo deploy (ou "Trigger deploy" no painel) para as funções
   passarem a usar estas variáveis.

Se, mesmo assim, continuares a ver `MissingBlobsEnvironmentError`, é
provável que seja um incidente de plataforma do lado do Netlify nesse
momento — vale a pena confirmar em https://www.netlifystatus.com/ e nos
tópicos recentes de suporte antes de continuar a mexer no código.

## Importante: define o SESSION_SECRET

Depois do primeiro deploy, vai a **Site settings → Environment variables** no
painel do Netlify e cria uma variável:

```
SESSION_SECRET = <uma string aleatória e longa>
```

Podes gerar uma boa localmente com:
```
openssl rand -hex 32
```

Isto é usado para assinar as sessões de login. Se não definires nada, o site
usa um valor por omissão inseguro (definido em `netlify/functions/utils.js`)
— funciona para testar, mas **não deixes isso em produção**.

Depois de adicionar a variável, faz um novo deploy (ou "Trigger deploy" no
painel) para as funções passarem a usá-la.

## Testar localmente antes de publicar

Como a app depende das funções serverless (`/api/...`), abrir o
`public/index.html` diretamente no browser não é suficiente — os pedidos de
login/registo vão falhar. Para testar tudo localmente, com as funções a
correr:

```
netlify dev
```

Isto abre o site em `localhost` com as funções e o Netlify Blobs a funcionar
como em produção (o Blobs tem um modo local automático).

## Como os dados ficam guardados

- Cada conta fica guardada como um "blob" JSON no armazenamento do site
  (`iron-log-users`), com a password protegida (nunca em texto simples).
- O browser guarda uma cópia local (cache) para abrir instantaneamente e
  continuar a funcionar offline; sincroniza com o servidor sempre que
  gravas algo.
- Nas Definições da app tens também "Exportar/Importar cópia (.json)" para
  fazeres um backup pessoal dos teus próprios dados.
