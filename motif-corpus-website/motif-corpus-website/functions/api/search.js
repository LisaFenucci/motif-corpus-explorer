export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const motif = String(body.motif || '').trim();
    const fromYear = Number(body.fromYear || 1350);
    const toYear = Number(body.toYear || 1650);
    const batchSize = Math.min(Number(body.batchSize || 24), 48);
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const excludeReplicas = body.excludeReplicas !== false;

    if (!motif) {
      return json({ error: 'Please provide a motif.' }, 400);
    }

    const terms = await expandMotifTerms(motif, env);
    const results = [];

    if (sources.includes('Europeana')) {
      results.push(...await searchEuropeana(terms, batchSize, env));
    }

    if (sources.includes('Met Museum')) {
      results.push(...await searchMet(terms, batchSize));
    }

    const cleaned = dedupeAndFilter(results, {
      motif,
      fromYear,
      toYear,
      excludeReplicas
    }).slice(0, batchSize);

    return json({
      message: cleaned.length ? `Loaded ${cleaned.length} live image records.` : 'No results found.',
      results: cleaned,
      expandedTerms: terms
    });
  } catch (error) {
    return json({ error: error.message || 'Unexpected server error.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function expandMotifTerms(motif, env) {
  const base = motif.toLowerCase().trim();

  const builtIn = {
    'wild man': ['wild man', 'wildeman', 'wodewose', 'woodwose', 'homme sauvage', 'uomo selvatico'],
    'griffin': ['griffin', 'gryphon', 'griffon'],
    'mermaid': ['mermaid', 'siren', 'melusine'],
    'saint george': ['saint george', 'st george', 'san giorgio', 'sint joris', 'georgius'],
    'tree of life': ['tree of life', 'arbor vitae', 'boom des levens']
  };

  if (builtIn[base]) return builtIn[base];

  // Optional OpenAI expansion:
  // Set OPENAI_API_KEY to enable.
  if (env.OPENAI_API_KEY) {
    try {
      const expanded = await expandWithOpenAI(base, env.OPENAI_API_KEY);
      if (expanded.length) return Array.from(new Set([base, ...expanded])).slice(0, 12);
    } catch (_) {
      // Fall back to basic behavior.
    }
  }

  return [base];
}

async function expandWithOpenAI(motif, apiKey) {
  const prompt = `Return a JSON array of up to 10 historical, multilingual, and catalog-friendly search terms for the art-historical motif "${motif}". Keep it short.`;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: prompt
    })
  });

  if (!res.ok) return [];

  const data = await res.json();
  const text = data.output_text || '';
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return text
      .split(/\n|,/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
}

async function searchEuropeana(terms, rows, env) {
  if (!env.EUROPEANA_API_KEY) return [];

  const query = encodeURIComponent(terms.join(' OR '));
  const url =
    `https://api.europeana.eu/record/v2/search.json?wskey=${env.EUROPEANA_API_KEY}` +
    `&query=${query}&media=true&rows=${rows}`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items || []).map(item => ({
    id: item.id || crypto.randomUUID(),
    title: first(item.title) || 'Untitled',
    date: first(item.year) || first(item.edmTimespanLabel) || '',
    region: first(item.country) || '',
    medium: item.type || '',
    source: 'Europeana',
    imageUrl: first(item.edmPreview) || '',
    recordUrl: item.guid || item.link || '',
    rawText: JSON.stringify({
      title: item.title,
      description: item.dcDescription,
      type: item.type
    })
  }));
}

async function searchMet(terms, limit) {
  const q = encodeURIComponent(terms[0]);
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${q}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json();

  const ids = (searchData.objectIDs || []).slice(0, limit);
  const objects = await Promise.all(
    ids.map(async id => {
      const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (!res.ok) return null;
      return res.json();
    })
  );

  return objects.filter(Boolean).map(obj => ({
    id: String(obj.objectID),
    title: obj.title || 'Untitled',
    date: obj.objectDate || '',
    region: obj.culture || obj.country || '',
    medium: obj.medium || '',
    source: 'Met Museum',
    imageUrl: obj.primaryImageSmall || '',
    recordUrl: obj.objectURL || '',
    beginDate: obj.objectBeginDate,
    endDate: obj.objectEndDate,
    rawText: JSON.stringify({
      title: obj.title,
      medium: obj.medium,
      tags: obj.tags,
      culture: obj.culture
    })
  }));
}

function dedupeAndFilter(results, options) {
  const seen = new Set();

  return results.filter(item => {
    if (!item.imageUrl || !item.recordUrl) return false;

    const fingerprint = `${item.source}|${item.recordUrl}`.toLowerCase();
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);

    if (!withinYearRange(item, options.fromYear, options.toYear)) return false;

    const haystack = `${item.title} ${item.medium} ${item.rawText || ''}`.toLowerCase();

    if (options.excludeReplicas) {
      if (
        haystack.includes('replica') ||
        haystack.includes('reproduction') ||
        haystack.includes('museum shop') ||
        haystack.includes('modern copy')
      ) {
        return false;
      }
    }

    return true;
  });
}

function withinYearRange(item, fromYear, toYear) {
  if (typeof item.beginDate === 'number' && !Number.isNaN(item.beginDate)) {
    return item.beginDate <= toYear && (item.endDate || item.beginDate) >= fromYear;
  }

  const text = `${item.date || ''}`;
  const years = [...text.matchAll(/\b(1\d{3}|20\d{2})\b/g)].map(m => Number(m[1]));
  if (!years.length) return true;
  return years.some(y => y >= fromYear && y <= toYear);
}

function first(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}
