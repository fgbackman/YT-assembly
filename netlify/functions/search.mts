interface SearchResult {
  youtubeId: string;
  title: string;
  channel: string;
  description: string;
  duration: string;
  views: string;
  publishedDate: string;
  thumbnailUrl: string;
}

const json = (body: unknown, status = 200, cacheSeconds = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=0, must-revalidate',
      ...(cacheSeconds
        ? { 'netlify-cdn-cache-control': `public, durable, s-maxage=${cacheSeconds}, stale-while-revalidate=86400` }
        : {}),
    },
  });

const text = (node: any): string =>
  node?.simpleText ?? node?.runs?.map((r: any) => r.text).join('') ?? '';

// Walks YouTube's initial page data and collects every videoRenderer node.
const collectVideoRenderers = (node: any, out: any[]) => {
  if (!node || typeof node !== 'object' || out.length >= 40) return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return;
  }
  if (node.videoRenderer?.videoId) {
    out.push(node.videoRenderer);
    return;
  }
  for (const key in node) collectVideoRenderers(node[key], out);
};

async function searchViaScrape(query: string): Promise<SearchResult[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      cookie: 'CONSENT=YES+1',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`YouTube responded ${res.status}`);
  const html = await res.text();

  const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!match) throw new Error('Could not parse YouTube results');
  const data = JSON.parse(match[1]);

  const renderers: any[] = [];
  collectVideoRenderers(data?.contents, renderers);

  return renderers.map((r) => ({
    youtubeId: r.videoId,
    title: text(r.title),
    channel: text(r.ownerText) || text(r.longBylineText),
    description: text(r.detailedMetadataSnippets?.[0]?.snippetText) || text(r.descriptionSnippet),
    duration: text(r.lengthText) || 'LIVE',
    views: text(r.shortViewCountText) || text(r.viewCountText),
    publishedDate: text(r.publishedTimeText),
    thumbnailUrl: `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
  }));
}

async function searchViaApi(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '24', q: query, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`YouTube API responded ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((item: any) => ({
    youtubeId: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    description: item.snippet.description,
    duration: '',
    views: '',
    publishedDate: item.snippet.publishedAt ? new Date(item.snippet.publishedAt).toLocaleDateString('en-US') : '',
    thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
  }));
}

export default async (req: Request) => {
  const query = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 200);
  if (!query) return json({ results: [] });

  const apiKey = process.env.YOUTUBE_API_KEY;
  try {
    const results = apiKey ? await searchViaApi(query, apiKey) : await searchViaScrape(query);
    return json({ results }, 200, 3600);
  } catch (err) {
    // Fall back to scraping if the API key is rejected or over quota.
    if (apiKey) {
      try {
        return json({ results: await searchViaScrape(query) }, 200, 3600);
      } catch {}
    }
    return json({ results: [], error: (err as Error).message }, 502);
  }
};

export const config = {
  path: '/api/search',
};
