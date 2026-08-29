# Iron Log — deploy no Cloudflare Pages

Este projeto usa **Cloudflare Pages** para servir o site e **Pages Functions**
(pasta `functions/`) como "servidor", com o **Cloudflare KV** a guardar as
contas e os dados de cada utilizador (equivalente ao que era o Netlify Blobs
na versão anterior).

```
iron-log-cloudflare/
├── wrangler.toml            ← configuração (nome do projeto, ligação ao KV)
├── package.json
├── public/                  ← o site (pasta de output)
│   ├── index.html
│   └── favicon.svg
├── shared/
│   └── utils.js             ← hashing de password + tokens de sessão (Web Crypto)
└── functions/api/
    ├── auth-register.js     ← POST /api/auth-register
    ├── auth-login.js        ← POST /api/auth-login
    ├── data-sync.js         ← GET/POST /api/data-sync
    └── off-search.js        ← GET /api/off-search (proxy para a Open Food Facts)
```

Boas notícias: como as rotas em `/api/*` são detetadas automaticamente pela
estrutura de pastas dentro de `functions/`, **não precisas de nenhum ficheiro
de redirects** — ao contrário do Netlify, aqui não há passo de configuração
extra para isso.

## Passo 1 — Cria o namespace do KV

Precisas da [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
(`npm install -g wrangler`, depois `wrangler login`).

```
wrangler kv namespace create USERS_KV
```

Isto devolve algo como:
```
{ binding = "USERS_KV", id = "abcd1234..." }
```

Copia esse `id` para o `wrangler.toml` (substitui `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`).

## Passo 2 — Publica o site

### Opção A: painel do Cloudflare (mais simples)

1. Vai a **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Escolhe o teu repositório.
3. Nas definições de build:
   - **Build command**: (deixa vazio — não há build)
   - **Build output directory**: `public`
4. Depois do primeiro deploy, vai a **Settings → Functions → KV namespace
   bindings** e adiciona uma ligação:
   ```
   Variable name: USERS_KV
   KV namespace: (escolhe o que criaste no Passo 1)
   ```
5. Em **Settings → Environment variables**, adiciona:
   ```
   SESSION_SECRET = <uma string aleatória e longa>
   ```
   Podes gerar uma boa com `openssl rand -hex 32`.
6. Volta a fazer deploy (Settings → Deployments → Retry deployment) para as
   Functions passarem a usar a ligação ao KV e o segredo.

### Opção B: linha de comandos (Wrangler)

```
wrangler pages deploy public --project-name=iron-log
```

Depois define a ligação ao KV e o `SESSION_SECRET` da mesma forma que na
Opção A (painel → Settings), ou via CLI:
```
wrangler pages secret put SESSION_SECRET --project-name=iron-log
```

## Testar localmente

```
wrangler pages dev public --kv USERS_KV
```

Isto corre o site e as Functions localmente, com o KV também emulado
localmente (não mexe nos dados reais em produção).

## Diferenças da versão Netlify

- **Armazenamento**: Cloudflare KV em vez de Netlify Blobs. Mesma ideia
  (chave → valor em JSON), API ligeiramente diferente, mas o resultado para
  o utilizador é idêntico.
- **Hashing de password**: passou de `scrypt` (módulo `crypto` do Node) para
  `PBKDF2` via Web Crypto API nativa — porque o runtime do Cloudflare não tem
  o módulo `crypto` do Node disponível por omissão. Continua a ser um método
  robusto e adequado para uma app pessoal.
- **Rotas**: já não precisas de nenhum `netlify.toml`/redirects — a estrutura
  de pastas em `functions/api/` já define as rotas automaticamente.
- **Sem dependências npm**: a versão Netlify precisava do pacote
  `@netlify/blobs`; esta versão não tem nenhuma dependência — tudo usa APIs
  nativas do runtime (KV, Web Crypto, fetch).

## Nota sobre o bug do Netlify Blobs

Se vieste da versão Netlify, sabes que houve ali um bug conhecido
(`MissingBlobsEnvironmentError`) que obrigou a configurar manualmente um
`BLOBS_SITE_ID`/`BLOBS_TOKEN`. O Cloudflare KV não tem esse problema — a
ligação via `wrangler.toml` (dev local) ou via painel (produção) é direta,
sem esse tipo de contorno necessário.
