# Iron Log — deploy no Cloudflare (Workers + Assets)

**Nota importante:** o Cloudflare tem vindo a unificar "Pages" e "Workers" num
único produto. Os projetos novos ligados a um repositório Git são publicados
como **Workers com ficheiros estáticos** (`[assets]` no `wrangler.toml`), já
não como "Pages" no sentido antigo com uma pasta `functions/`. Este projeto
está preparado para esse modelo atual.

```
iron-log-cloudflare/
├── wrangler.toml            ← configuração (nome, entrada do Worker, KV, assets)
├── package.json
├── public/                  ← ficheiros estáticos (servidos automaticamente)
│   ├── index.html
│   └── favicon.svg
└── src/
    ├── worker.js             ← ponto de entrada: encaminha /api/* ou entrega ficheiros estáticos
    ├── utils.js              ← hashing de password + tokens de sessão (Web Crypto)
    └── handlers/
        ├── auth-register.js
        ├── auth-login.js
        ├── data-sync.js
        └── off-search.js
```

Todos os pedidos que não comecem por `/api/` são entregues diretamente da
pasta `public/` (via `env.ASSETS.fetch(request)` dentro do `worker.js`). Os
pedidos a `/api/...` são tratados pelo próprio Worker.

## Passo 1 — Cria o namespace do KV

Precisas da [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
(`npm install -g wrangler`, depois `wrangler login`).

```
wrangler kv namespace create USERS_KV
```

Copia o `id` devolvido para o `wrangler.toml`, substituindo
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

## Passo 2 — Publica

### Opção A: linha de comandos (mais direto)

```
wrangler deploy
```

Isto lê o `wrangler.toml`, publica o Worker e os ficheiros de `public/`.

Depois define o segredo da sessão:
```
wrangler secret put SESSION_SECRET
```
(cola quando pedido uma string aleatória longa — podes gerar uma com
`openssl rand -hex 32`)

### Opção B: ligar a um repositório Git no painel

1. **Workers & Pages → Create → Import a repository** (ou o botão equivalente
   para ligar um repositório Git).
2. O Cloudflare deteta o `wrangler.toml` automaticamente — não precisas de
   configurar comando de build nem pasta de output manualmente.
3. Depois do primeiro deploy, vai a **Settings → Variables and Secrets** e
   adiciona `SESSION_SECRET` (como "Secret", não "Text").
4. Em **Settings → Bindings**, confirma que a ligação ao KV (`USERS_KV`)
   está presente — se o `id` no `wrangler.toml` estiver correto, isto já
   deve vir configurado automaticamente a partir do ficheiro.
5. Volta a fazer deploy se precisares de repetir depois de mudar variáveis.

## Testar localmente

```
wrangler dev
```

Isto corre o Worker localmente (com o KV emulado localmente também, não
mexe nos dados reais em produção).

## Se continuares a ver "Missing entry-point..."

Esse erro específico significa que o Cloudflare tentou publicar isto como um
Worker sem saber onde está o código — geralmente porque falta o campo `main`
no `wrangler.toml`, ou porque o ficheiro `wrangler.toml` não foi encontrado
na raiz do projeto que está a ser publicado. Confirma que o `wrangler.toml`
está mesmo na raiz do repositório (não dentro de uma subpasta) e que tem a
linha `main = "src/worker.js"`.

## Diferenças da versão Netlify

- **Armazenamento**: Netlify Blobs → **Cloudflare KV**.
- **Hashing de password**: `scrypt` (Node) → **PBKDF2 via Web Crypto API**
  nativa, porque o runtime do Cloudflare não tem o módulo `crypto` do Node
  disponível por omissão.
- **Rotas**: um único `worker.js` decide, por código, se um pedido é para a
  API ou para os ficheiros estáticos — não há ficheiro de redirects nem
  pasta de rotas por convenção.
- **Sem dependências npm** — tudo usa APIs nativas do runtime (KV, Web
  Crypto, fetch, `env.ASSETS`).
