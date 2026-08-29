import { verifyPassword, signToken, jsonResponse } from '../../shared/utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Pedido inválido.' });
  }

  const uKey = (body.username || '').trim().toLowerCase();
  const password = body.password || '';

  try {
    const raw = await env.USERS_KV.get(uKey);
    if (!raw) {
      return jsonResponse(401, { error: 'Conta não encontrada.' });
    }
    const record = JSON.parse(raw);
    if (!(await verifyPassword(password, record.salt, record.hash))) {
      return jsonResponse(401, { error: 'Palavra-passe incorreta.' });
    }
    const token = await signToken(uKey, env);
    return jsonResponse(200, { token, displayName: record.displayName, data: record.data, settings: record.settings });
  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
}
