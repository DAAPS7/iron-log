import { verifyToken, getUserRecord, putUserRecord, defaultSocial, exerciseNameFromKey, jsonResponse } from '../utils.js';

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function getAuthedRecord(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const uKey = await verifyToken(token, env);
  if (!uKey) return { error: jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' }) };

  const record = await getUserRecord(env, uKey);
  if (!record) return { error: jsonResponse(404, { error: 'Conta não encontrada.' }) };

  return { uKey, record };
}

// Compara os PRs antigos com os novos e devolve os que subiram de peso —
// usado para avisar os amigos automaticamente quando alguém bate um recorde.
function findNewPRs(oldPRs, newPRs) {
  const improved = [];
  const oldMap = oldPRs || {};
  const newMap = newPRs || {};
  for (const key of Object.keys(newMap)) {
    const oldWeight = oldMap[key] ? oldMap[key].weight : 0;
    const newEntry = newMap[key];
    if (newEntry && newEntry.weight > oldWeight) {
      improved.push({ key, ...newEntry });
    }
  }
  return improved;
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
    const oldPRs = record.data ? record.data.exercisePRs : null;

    if (body.data !== undefined) record.data = body.data;
    if (body.settings !== undefined) record.settings = body.settings;
    record.updatedAt = new Date().toISOString();

    await putUserRecord(env, uKey, record);

    // Notifica os amigos se algum PR subiu neste guardar.
    const newPRs = findNewPRs(oldPRs, record.data ? record.data.exercisePRs : null);
    const friends = record.friends || [];
    if (newPRs.length && friends.length) {
      for (const pr of newPRs) {
        const exerciseName = exerciseNameFromKey(pr.key);
        for (const friendKey of friends) {
          const friendRecord = await getUserRecord(env, friendKey);
          if (!friendRecord) continue;
          const friend = { ...defaultSocial(), ...friendRecord };
          friend.notifications.push({
            id: uid(),
            type: 'pr',
            message: `${record.displayName} bateu um novo PR em ${exerciseName}: ${pr.weight} ${pr.unit}${pr.reps ? ` (${pr.reps} reps)` : ''}`,
            read: false,
            createdAt: new Date().toISOString(),
          });
          await putUserRecord(env, friendKey, friend);
        }
      }
    }

    return jsonResponse(200, { ok: true, updatedAt: record.updatedAt });
  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: 'Erro ao guardar dados.' });
  }
}
