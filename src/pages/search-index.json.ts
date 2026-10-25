import type { APIRoute } from 'astro';
import { SEARCH_INDEX } from '../search-index';

// Every tool as the search reads it. One small file the browser fetches the first time a search box gets focus, then
// caches for every page, so the list costs nothing on pages where nobody searches.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(SEARCH_INDEX), { headers: { 'Content-Type': 'application/json' } });
