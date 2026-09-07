import { verifyToken, getUserRecord, putUserRecord, listSnapshots, getSnapshot, jsonResponse } from '../utils.js';

async function authed(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const uKey = await verifyToken(token, env);
  if (!uKey) return { error: jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' }) };
  return { uKey };
}

// Lista as datas com cópia de segurança disponível para o utilizador atual.
export async function handleSnapshotsList(request, env) {
  const { error, uKey } = await authed(request, env);
  if (error) return error;
  const dates = await listSnapshots(env, uKey);
  return jsonResponse(200, { dates });
}

// Restaura uma cópia de uma data específica, tornando-a nos dados atuais.
// Antes de o fazer, guarda uma cópia extra do estado atual (rótulo próprio,
// fora do ciclo diário normal), para a própria restauração ser reversível.
export async function handleSnapshotsRestore(request, env) {
  const { error, uKey } = await authed(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Pedido inválido.' });
  }
  const dateStr = body.date;
  if (!dateStr) return jsonResponse(400, { error: 'Falta a data a restaurar.' });

  const snapshot = await getSnapshot(env, uKey, dateStr);
  if (!snapshot) return jsonResponse(404, { error: 'Não existe nenhuma cópia guardada para essa data.' });

  const record = await getUserRecord(env, uKey);
  if (!record) return jsonResponse(404, { error: 'Conta não encontrada.' });

  // Rede de segurança sobre a rede de segurança: guarda o estado de antes
  // de restaurar, para poderes desfazer se te enganaste na data.
  await env.USERS_KV.put(
    `snapshot:${uKey}:antes-de-restaurar-${Date.now()}`,
    JSON.stringify({ data: record.data, settings: record.settings, savedAt: new Date().toISOString() }),
    { expirationTtl: 14 * 24 * 60 * 60 },
  );

  record.data = snapshot.data;
  record.settings = snapshot.settings;
  record.updatedAt = new Date().toISOString();
  await putUserRecord(env, uKey, record);

  return jsonResponse(200, { ok: true, data: record.data, settings: record.settings });
}
