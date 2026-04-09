# Profile-Aware AI Assistant

A Next.js + TypeScript app for generating structured, profile-aware AI reports with optional user-scoped RAG.

## Current state

- Profile capture and persistence for role, goals, tone, constraints, format, and do/don't instructions.
- Structured report generation with sections for summary, assumptions, recommendation, steps, risks, and optional citations.
- Iterative refinement flow with saved revision history in the UI.
- User-scoped knowledge management for adding, editing, listing, and deleting RAG documents.
- Optional RAG debug output showing retrieval reason, retrieval query, and selected sources.
- Lightweight cookie-based identity.
- Feedback endpoint for thumbs up/down on generated sessions.

## Storage model

- Profiles, generated sessions, and feedback are currently stored locally in `data/store.json`.
- Local fallback chunk embeddings are stored in `data/vector-store.json`.
- Knowledge documents and vector search can optionally be moved to Supabase.
- When Supabase is configured, document records are stored in `knowledge_documents` and chunk vectors are stored in `knowledge_chunks`.
- If Supabase is not configured, knowledge storage falls back to the local JSON files.

## Tech stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- OpenAI SDK
- LangChain JS for chunking and Supabase vector-store integration
- Supabase Postgres + pgvector for optional production RAG storage

## Project structure

- `app/page.tsx`: main app entry
- `components/assistant-app.tsx`: primary UI for profile input, generation, knowledge management, and debug views
- `app/api/generate/route.ts`: report generation endpoint
- `app/api/profile/route.ts`: profile fetch/save endpoint
- `app/api/knowledge/route.ts`: knowledge list/create endpoint
- `app/api/knowledge/[id]/route.ts`: knowledge update/delete endpoint
- `app/api/feedback/route.ts`: session feedback endpoint
- `lib/llm.ts`: prompt orchestration and model call
- `lib/rag.ts`: retrieval orchestration used by generation
- `lib/vector-store.ts`: vector store abstraction with Supabase primary path and local fallback
- `lib/langchain.ts`: chunk splitting and embedding configuration
- `lib/knowledge-store.ts`: knowledge document CRUD with Supabase primary path and local fallback
- `lib/store.ts`: local JSON persistence for users, profiles, sessions, and fallback docs
- `lib/supabase.ts`: Supabase admin client helper
- `supabase/schema.sql`: pasteable SQL schema for Supabase setup
- `scripts/migrate-knowledge-to-supabase.mjs`: migration script for local knowledge docs

## Run locally

1. Install dependencies:

```bash
npm install --legacy-peer-deps
```

2. Set environment variables in `.env.local` or `.env`.

3. Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Required for model generation:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `OPENAI_EMBED_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAG_CHUNK_SIZE`
- `RAG_CHUNK_OVERLAP`

Use [ .env.supabase.example ](/C:/Users/Joshu/Documents/Assignments/Foundations%20of%20Deep%20Learning/Homework/Profile_Aware_AI_Assistant/.env.supabase.example#L1) as a template, but copy those values into a real env file. The app does not read the example file automatically.

## Supabase setup

1. Open Supabase SQL Editor.
2. Paste and run [schema.sql](/C:/Users/Joshu/Documents/Assignments/Foundations%20of%20Deep%20Learning/Homework/Profile_Aware_AI_Assistant/supabase/schema.sql#L1).
3. Add these to your real env file:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
4. Restart the dev server.

Notes:

- The schema uses `vector(1536)`, which matches `text-embedding-3-small`.
- The schema explicitly disables RLS on the internal knowledge tables used by this app.
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is the service-role key, not the anon key.

## Migrate existing local knowledge docs to Supabase

After Supabase is configured, run:

```bash
npm run migrate:supabase-knowledge
```

What the migration does:

- Reads documents from `data/store.json`
- Upserts them into `knowledge_documents`
- Reuses existing local chunk embeddings from `data/vector-store.json` when available
- Re-embeds only documents that do not already have local chunk embeddings and only if `OPENAI_API_KEY` is available

If OpenAI quota is unavailable, documents can still migrate without fresh indexing if they already have local embeddings.

## RAG behavior

RAG retrieval runs only when `options.citeSources` is enabled in `POST /api/generate`.

- When `citeSources: false`, no retrieval runs.
- When `citeSources: true`, the app builds a retrieval query from the task, refinement, and selected profile fields.
- Retrieved chunks are injected into the assembled prompt under `Retrieved Context`.
- Returned citations are based on the retrieved chunk sources.

## Debugging retrieval

Enable `Include RAG debug metadata` in the UI to inspect:

- `retrievalRan`
- `reason`
- retrieval query
- selected sources and similarity scores

The generated output also exposes the fully assembled prompt for inspection.

## API quick reference

- `GET /api/profile`: fetch the current user's profile
- `PUT /api/profile`: save the current user's profile
- `POST /api/generate`: generate a structured response and optionally run retrieval
- `GET /api/knowledge`: list the current user's knowledge docs
- `POST /api/knowledge`: create a knowledge doc
- `PUT /api/knowledge/:id`: update a knowledge doc and reindex it
- `DELETE /api/knowledge/:id`: delete a knowledge doc and remove its indexed chunks
- `POST /api/feedback`: attach thumbs up/down feedback to a generated session

## Verification

Validated during this session with:

- `npm install --legacy-peer-deps`
- `npm run typecheck`
- `npm run lint`

## Next steps for production

- Transition from a locally stored text-based storage to a proper database
- Add chunking + overlap for knowledge ingestion and retrieve top-N chunks.
- Add score thresholding and optional reranking.
- Add doc tags and profile-aware pre-filtering.
- Replace file store with DB + vector index.
- Replace lightweight identity with robust auth + tenant isolation.
- Expand automated tests for RAG, profile scoping, and API validation.
