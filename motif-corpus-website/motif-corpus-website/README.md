# Motif Corpus Explorer

A plain website frontend plus a Cloudflare Pages Function backend.

## Files
- `index.html` — website UI
- `style.css` — styles
- `script.js` — frontend logic
- `functions/api/search.js` — backend search endpoint for Cloudflare Pages

## What it does
- lets you enter any motif
- filters by year range
- queries live data sources
- excludes likely replicas
- returns image records in a grid

## Live sources included
- Europeana
- Met Museum

## Setup

### 1. Put these files in a Cloudflare Pages project
Recommended structure:

- index.html
- style.css
- script.js
- functions/api/search.js

### 2. Add environment variables
In Cloudflare Pages project settings:

- `EUROPEANA_API_KEY` = your Europeana API key
- `OPENAI_API_KEY` = optional, only if you want AI term expansion

### 3. Deploy
Push to GitHub and connect the repo to Cloudflare Pages.

## Local testing
You can open `index.html` directly for the UI, but the search button needs the backend route.

For local backend testing with Wrangler:
- install Wrangler
- run `wrangler pages dev .`

## Notes
- The OpenAI call is optional and only used for better motif-term expansion.
- If `OPENAI_API_KEY` is not set, the site still works with built-in synonym maps.
- If `EUROPEANA_API_KEY` is not set, Europeana results will be skipped.
