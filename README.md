# Profile-Aware AI Assistant (MVP)

A lightweight Next.js + TypeScript MVP for generating personalized AI reports from reusable user profiles and iterative refinements.

## Included in this MVP

- Profile capture: role/industry, goals, tone, constraints, format, do/don't instructions.
- Request input: task text, verbosity, report type, cite sources toggle.
- Knowledge Management UI for adding, listing, editing, and deleting user-scoped RAG documents.
- Structured output schema: summary → assumptions → recommendation → steps → risks.
- Iteration flow: refinement instruction + revision history.
- API endpoint and prompt assembly logic for profile-aware generation.
- File-backed persistence in `data/store.json`. (eventually moving to PostgreSQL)
- Optional Supabase-backed knowledge store and vector search for production RAG.

## Tech stack

- Next.js 14 + React 18 + TypeScript
- Tailwind CSS
- Node.js runtime (single-repo frontend + API)

## Features

- OpenAI SDK based structured generation (`lib/llm.ts`).
- Cookie-based lightweight auth and per-user profile/session persistence (`lib/auth.ts`, `lib/store.ts`).
- RAG pipeline with OpenAI embeddings and cosine vector search (`lib/rag.ts`).
- PDF/DOC export endpoint and in-app citation renderer.
- Analytics dashboard + quality feedback loop (thumbs up/down stored per generation).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase + LangChain setup

1. Copy `.env.supabase.example` to `.env.local` or merge the values into your existing `.env`.
2. Paste `supabase/schema.sql` into the Supabase SQL editor and run it.
3. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
4. Install the new packages and restart the dev server.

If Supabase is not configured, the app falls back to the existing local JSON-backed knowledge store.

### Migrate existing local knowledge docs

After Supabase is configured, run:

```bash
npm run migrate:supabase-knowledge
```

The migration script reads `data/store.json`, upserts documents into `knowledge_documents`, and reindexes chunks into `knowledge_chunks` when `OPENAI_API_KEY` is available.

If you hit a row-level security error during migration, rerun the latest `supabase/schema.sql`. It now explicitly disables RLS on the internal `knowledge_documents` and `knowledge_chunks` tables used by this app.

## RAG usage and trigger

RAG retrieval runs only when `options.citeSources` is enabled in `/api/generate` requests.

- When `citeSources: false`, no retrieval is run.
- When `citeSources: true`, query embedding + similarity search runs against user-scoped docs.
- `OPENAI_API_KEY` is required for embeddings and retrieval.

## Frontend guide: use and debug the RAG pipeline

### 1) Add knowledge sources

1. Open the **Knowledge Management (RAG)** section in the UI.
2. Enter a source name and content.
3. Click **Add document**.
4. Confirm it appears in the per-user list.

You can also **Edit** and **Delete** documents from this panel.

### 2) Trigger retrieval

1. In **Request + Controls**, keep **Cite sources** enabled.
2. Submit a task.
3. Retrieved entries are injected under `Retrieved Context` in the prompt and surfaced as citations.

### 3) Debug retrieval behavior

Enable **Include RAG debug metadata** and run generation.

The output includes debug details with:

- `retrievalRan`
- `reason` (`citations-disabled`, `missing-openai-key`, `no-docs`, `no-embeddings`, `ok`)
- retrieval query
- selected sources + similarity scores

In the UI, open **View RAG debug metadata** and **View assembled prompt** to inspect what was retrieved and injected.

## API quick reference

- `GET /api/profile`: fetch profile for current cookie/header user.
- `PUT /api/profile`: save profile.
- `POST /api/generate`: generate structured response and optionally run RAG.
- `GET /api/knowledge`: list user knowledge docs.
- `POST /api/knowledge`: create user knowledge doc (`{ source, content }`).
- `PUT /api/knowledge/:id`: update source/content; re-embeds on content change.
- `DELETE /api/knowledge/:id`: remove document.

## Key files

- `app/page.tsx`: main app entry.
- `components/assistant-app.tsx`: profile/request/output UI + knowledge management + debug views.
- `app/api/generate/route.ts`: generation orchestration API.
- `app/api/knowledge/route.ts`: knowledge create/list API.
- `app/api/knowledge/[id]/route.ts`: knowledge update/delete API.
- `lib/llm.ts`: generation + profile-aware retrieval query + optional debug metadata.
- `lib/rag.ts`: embedding + retrieval and ranking logic.
- `lib/langchain.ts`: chunking and OpenAI embedding setup via LangChain.
- `lib/knowledge-store.ts`: knowledge document CRUD with Supabase fallback.
- `lib/supabase.ts`: Supabase admin client helper.
- `lib/store.ts`: file-backed persistence (profiles, sessions, docs).
- `supabase/schema.sql`: pasteable Supabase schema for documents + vector search.
- `lib/prompt.ts`: prompt template composition.

Optional environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_EMBED_MODEL` (default: `text-embedding-3-small`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAG_CHUNK_SIZE`
- `RAG_CHUNK_OVERLAP`

## Next steps for production

- Transition from a locally stored text-based storage to a proper database
- Add chunking + overlap for knowledge ingestion and retrieve top-N chunks.
- Add score thresholding and optional reranking.
- Add doc tags and profile-aware pre-filtering.
- Replace file store with DB + vector index.
- Replace lightweight identity with robust auth + tenant isolation.
- Expand automated tests for RAG, profile scoping, and API validation.
