import { jsonResponse } from '../utils.js';

export async function handleOffSearch(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();

  if (!query) {
    return jsonResponse(400, { error: 'Falta o parâmetro de pesquisa.' });
  }

  try {
    const offUrl = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&page=1&langs=pt,en`;
    const res = await fetch(offUrl, {
      headers: {
        'User-Agent': 'IronLog/1.0 (personal fitness tracker app)',
      },
    });

    if (!res.ok) {
      return jsonResponse(res.status, { error: `A Open Food Facts respondeu com o estado ${res.status}.` });
    }

    const data = await res.json();
    return jsonResponse(200, data);
  } catch (e) {
    console.error('Erro ao pesquisar na Open Food Facts:', e);
    return jsonResponse(500, { error: 'Não foi possível contactar a Open Food Facts.' });
  }
}
