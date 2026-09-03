import { verifyToken, getUserRecord, defaultSocial, jsonResponse } from '../utils.js';

export async function handleSocial(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const selfKey = await verifyToken(token, env);
  if (!selfKey) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' });
  }

  const raw = await getUserRecord(env, selfKey);
  if (!raw) return jsonResponse(404, { error: 'Conta não encontrada.' });
  const social = { ...defaultSocial(), ...raw };

  // Para cada amigo, devolve também o displayName atual (o username sozinho
  // não é amigável de mostrar na interface).
  const friends = [];
  for (const friendKey of social.friends) {
    const friendRaw = await getUserRecord(env, friendKey);
    friends.push({
      username: friendKey,
      displayName: friendRaw ? friendRaw.displayName : friendKey,
    });
  }

  return jsonResponse(200, {
    friends,
    incoming: social.friendRequestsIncoming,
    outgoing: social.friendRequestsOutgoing,
    notifications: [...social.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    sharedWorkoutsInbox: social.sharedWorkoutsInbox,
  });
}
