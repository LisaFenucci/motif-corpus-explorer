const motifInput = document.getElementById('motif');
const fromYearInput = document.getElementById('fromYear');
const toYearInput = document.getElementById('toYear');
const batchSizeInput = document.getElementById('batchSize');
const excludeReplicasInput = document.getElementById('excludeReplicas');
const includeEdgeCasesInput = document.getElementById('includeEdgeCases');
const promptBox = document.getElementById('promptBox');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const resultsEl = document.getElementById('results');
const searchBtn = document.getElementById('searchBtn');

function getSelectedSources() {
  return Array.from(document.querySelectorAll('input[type="checkbox"][value]:checked')).map(el => el.value);
}

function buildPrompt() {
  const motif = motifInput.value.trim() || 'motif';
  const fromYear = fromYearInput.value || '1350';
  const toYear = toYearInput.value || '1650';
  const batchSize = batchSizeInput.value || '24';
  const selectedSources = getSelectedSources();
  const excludeReplicas = excludeReplicasInput.checked;
  const includeEdgeCases = includeEdgeCasesInput.checked;

  return `You are a digital art history research assistant specialized in late medieval and early modern visual and material culture (ca. ${fromYear}–${toYear}).

TASK
Collect and display as many images as possible of the motif "${motif}" within the period ${fromYear}–${toYear}.

STRICT RULES
- Return image records only
- No analysis
- No summaries
- No clustering
- Work in batches of up to ${batchSize}
${excludeReplicas ? '- Exclude replicas, modern reproductions, museum shop items, and fantasy imagery\n' : ''}${includeEdgeCases ? '- Include ambiguous or miscatalogued edge cases, but mark them clearly\n' : ''}SOURCES
- ${selectedSources.join('\n- ')}

FOR EACH RESULT RETURN
- title
- date
- region
- medium
- source/database
- record link or ID
- image URL

FINAL RULE
This is corpus construction, not explanation.`;
}

function renderPrompt() {
  promptBox.value = buildPrompt();
}

function renderStats(resultsCount) {
  const motif = motifInput.value.trim() || 'motif';
  const fromYear = fromYearInput.value || '1350';
  const toYear = toYearInput.value || '1650';

  statsEl.innerHTML = `
    <span class="stat-pill">${resultsCount} records</span>
    <span class="stat-pill">${motif}</span>
    <span class="stat-pill">${fromYear}–${toYear}</span>
  `;
}

function renderResults(items) {
  if (!items.length) {
    resultsEl.innerHTML = '<div class="empty">No results found.</div>';
    return;
  }

  resultsEl.innerHTML = `
    <div class="results-grid">
      ${items.map(item => `
        <a class="result-card" href="${item.recordUrl}" target="_blank" rel="noreferrer">
          <div class="result-image">
            <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" loading="lazy" />
          </div>
          <div class="result-body">
            <h3 class="result-title">${escapeHtml(item.title)}</h3>
            <div class="result-source">${escapeHtml(item.source)}</div>
            <div class="result-meta">
              <div>${escapeHtml(item.date || '')}</div>
              <div>${escapeHtml(item.region || '')}</div>
              <div>${escapeHtml(item.medium || '')}</div>
            </div>
            <div class="result-footer">
              <span class="badge">${escapeHtml(item.source)}</span>
              <span>Open record ↗</span>
            </div>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function runSearch() {
  const payload = {
    motif: motifInput.value.trim(),
    fromYear: Number(fromYearInput.value || 1350),
    toYear: Number(toYearInput.value || 1650),
    batchSize: Number(batchSizeInput.value || 24),
    sources: getSelectedSources(),
    excludeReplicas: excludeReplicasInput.checked,
    includeEdgeCases: includeEdgeCasesInput.checked
  };

  statusEl.textContent = 'Searching live sources…';
  searchBtn.disabled = true;
  resultsEl.innerHTML = '<div class="empty">Loading…</div>';

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Search failed.');
    }

    renderResults(data.results || []);
    renderStats((data.results || []).length);
    statusEl.textContent = data.message || `Loaded ${(data.results || []).length} image records.`;
  } catch (error) {
    resultsEl.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    renderStats(0);
    statusEl.textContent = 'Search failed.';
  } finally {
    searchBtn.disabled = false;
  }
}

[
  motifInput,
  fromYearInput,
  toYearInput,
  batchSizeInput,
  excludeReplicasInput,
  includeEdgeCasesInput,
  ...document.querySelectorAll('input[type="checkbox"][value]')
].forEach(el => {
  el.addEventListener('input', renderPrompt);
  el.addEventListener('change', renderPrompt);
});

searchBtn.addEventListener('click', runSearch);

renderPrompt();
renderStats(0);
renderResults([]);
