import { jsonResponse } from './utils.js';
import { handleAuthRegister } from './handlers/auth-register.js';
import { handleAuthLogin } from './handlers/auth-login.js';
import { handleDataSyncGet, handleDataSyncPost } from './handlers/data-sync.js';
import { handleOffSearch } from './handlers/off-search.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === '/api/auth-register' && method === 'POST') return await handleAuthRegister(request, env);
      if (pathname === '/api/auth-login' && method === 'POST') return await handleAuthLogin(request, env);
      if (pathname === '/api/data-sync' && method === 'GET') return await handleDataSyncGet(request, env);
      if (pathname === '/api/data-sync' && method === 'POST') return await handleDataSyncPost(request, env);
      if (pathname === '/api/off-search' && method === 'GET') return await handleOffSearch(request);

      if (pathname.startsWith('/api/')) {
        return jsonResponse(404, { error: 'Rota não encontrada.' });
      }
    } catch (e) {
      console.error('Erro não tratado numa rota da API:', e);
      return jsonResponse(500, { error: 'Erro interno do servidor.' });
    }

    // Não é uma rota da API — entrega os ficheiros estáticos (pasta public/)
    return env.ASSETS.fetch(request);
  },
};
