import { verifyToken, jsonResponse } from '../utils.js';

export async function handleFriendsSearch(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const selfKey = await verifyToken(token, env);
  if (!selfKey) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) {
    return jsonResponse(400, { error: 'Escreve pelo menos 2 caracteres para pesquisar.' });
  }

  try {
    const list = await env.USERS_KV.list({ prefix: q, limit: 15 });
    const results = list.keys
      .filter((k) => k.name !== selfKey)
      .map((k) => ({
        username: k.name,
        displayName: (k.metadata && k.metadata.displayName) || k.name,
      }));
    return jsonResponse(200, { results });
  } catch (e) {
    console.error('Erro na pesquisa de amigos:', e);
    return jsonResponse(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
}
