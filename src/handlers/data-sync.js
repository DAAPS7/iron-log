import { verifyToken, jsonResponse } from '../utils.js';

async function getAuthedRecord(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const uKey = await verifyToken(token, env);
  if (!uKey) return { error: jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' }) };

  const raw = await env.USERS_KV.get(uKey);
  if (!raw) return { error: jsonResponse(404, { error: 'Conta não encontrada.' }) };

  return { uKey, record: JSON.parse(raw) };
}

export async function handleDataSyncGet(request, env) {
  const { error, record } = await getAuthedRecord(request, env);
  if (error) return error;
  return jsonResponse(200, { displayName: record.displayName, data: record.data, settings: record.settings });
}

export async function handleDataSyncPost(request, env) {
  const { error, uKey, record } = await getAuthedRecord(request, env);
  if (error) return error;

  try {
    const body = await request.json();
    if (body.data !== undefined) record.data = body.data;
    if (body.settings !== undefined) record.settings = body.settings;
    record.updatedAt = new Date().toISOString();

    await env.USERS_KV.put(uKey, JSON.stringify(record));
    return jsonResponse(200, { ok: true, updatedAt: record.updatedAt });
  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: 'Erro ao guardar dados.' });
  }
}
