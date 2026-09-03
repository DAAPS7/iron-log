import { verifyToken, getUserRecord, putUserRecord, defaultSocial, jsonResponse } from '../utils.js';

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Garante que registos criados antes desta funcionalidade têm todos os
// campos sociais (contas antigas não os têm no KV).
function withSocial(record) {
  return { ...defaultSocial(), ...record };
}

export async function handleFriendsAction(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const selfKey = await verifyToken(token, env);
  if (!selfKey) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicia sessão novamente.' });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Pedido inválido.' });
  }

  const selfRaw = await getUserRecord(env, selfKey);
  if (!selfRaw) return jsonResponse(404, { error: 'Conta não encontrada.' });
  const self = withSocial(selfRaw);

  const action = body.action;

  try {
    if (action === 'request') {
      const targetKey = (body.targetUsername || '').trim().toLowerCase();
      if (!targetKey || targetKey === selfKey) {
        return jsonResponse(400, { error: 'Nome de utilizador inválido.' });
      }
      const targetRaw = await getUserRecord(env, targetKey);
      if (!targetRaw) return jsonResponse(404, { error: 'Não existe nenhuma conta com esse nome.' });
      const target = withSocial(targetRaw);

      if (self.friends.includes(targetKey)) {
        return jsonResponse(409, { error: 'Já são amigos.' });
      }
      if (self.friendRequestsOutgoing.includes(targetKey)) {
        return jsonResponse(409, { error: 'Já enviaste um pedido a este utilizador.' });
      }
      if (target.friendRequestsIncoming.some((r) => r.username === selfKey)) {
        return jsonResponse(409, { error: 'Já tens um pedido pendente deste utilizador — vai aceitá-lo.' });
      }

      self.friendRequestsOutgoing.push(targetKey);
      target.friendRequestsIncoming.push({
        username: selfKey,
        displayName: self.displayName,
        sentAt: new Date().toISOString(),
      });

      await putUserRecord(env, selfKey, self);
      await putUserRecord(env, targetKey, target);
      return jsonResponse(200, { ok: true });
    }

    if (action === 'respond') {
      const fromKey = (body.fromUsername || '').trim().toLowerCase();
      const accept = !!body.accept;
      const fromRaw = await getUserRecord(env, fromKey);
      if (!fromRaw) return jsonResponse(404, { error: 'Utilizador não encontrado.' });
      const from = withSocial(fromRaw);

      self.friendRequestsIncoming = self.friendRequestsIncoming.filter((r) => r.username !== fromKey);
      from.friendRequestsOutgoing = from.friendRequestsOutgoing.filter((u) => u !== selfKey);

      if (accept) {
        if (!self.friends.includes(fromKey)) self.friends.push(fromKey);
        if (!from.friends.includes(selfKey)) from.friends.push(selfKey);
      }

      await putUserRecord(env, selfKey, self);
      await putUserRecord(env, fromKey, from);
      return jsonResponse(200, { ok: true });
    }

    if (action === 'remove') {
      const otherKey = (body.username || '').trim().toLowerCase();
      const otherRaw = await getUserRecord(env, otherKey);
      self.friends = self.friends.filter((u) => u !== otherKey);
      await putUserRecord(env, selfKey, self);
      if (otherRaw) {
        const other = withSocial(otherRaw);
        other.friends = other.friends.filter((u) => u !== selfKey);
        await putUserRecord(env, otherKey, other);
      }
      return jsonResponse(200, { ok: true });
    }

    if (action === 'share-workout') {
      const friendKey = (body.friendUsername || '').trim().toLowerCase();
      const workout = body.workout;
      if (!workout || !workout.name) return jsonResponse(400, { error: 'Treino inválido.' });
      if (!self.friends.includes(friendKey)) {
        return jsonResponse(403, { error: 'Só podes partilhar treinos com amigos.' });
      }
      const friendRaw = await getUserRecord(env, friendKey);
      if (!friendRaw) return jsonResponse(404, { error: 'Amigo não encontrado.' });
      const friend = withSocial(friendRaw);

      friend.sharedWorkoutsInbox.push({
        id: uid(),
        fromUsername: selfKey,
        fromDisplayName: self.displayName,
        workout,
        receivedAt: new Date().toISOString(),
      });
      await putUserRecord(env, friendKey, friend);
      return jsonResponse(200, { ok: true });
    }

    if (action === 'dismiss-shared-workout') {
      self.sharedWorkoutsInbox = self.sharedWorkoutsInbox.filter((s) => s.id !== body.id);
      await putUserRecord(env, selfKey, self);
      return jsonResponse(200, { ok: true });
    }

    if (action === 'mark-notifications-read') {
      if (body.id) {
        self.notifications = self.notifications.map((n) =>
          n.id === body.id ? { ...n, read: true } : n
        );
      } else {
        self.notifications = self.notifications.map((n) => ({ ...n, read: true }));
      }
      await putUserRecord(env, selfKey, self);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: 'Ação desconhecida.' });
  } catch (e) {
    console.error('Erro numa ação social:', e);
    return jsonResponse(500, { error: 'Erro no servidor. Tenta novamente.' });
  }
}
