# Budget Wedding Planner

A Next.js + TypeScript wedding planning app focused on practical affordability, explicit tradeoffs, and constraint-aware recommendations.

## What the app does

- Starts with a survey-first onboarding flow before planning begins.
- Uses a schema-driven wedding survey so questions can be edited in one place.
- Persists a wedding profile with budget, guest count, location, season/date, priorities, alcohol preference, DIY willingness, style, and constraints.
- Generates structured wedding plans that stay grounded in that saved profile across turns.
- Supports iterative follow-ups like making the plan cheaper, increasing guest count, or protecting a priority category.
- Provides deterministic budget math before the model responds.
- Uses lightweight vendor and venue retrieval from a local structured knowledge base plus optional user-added RAG notes.

## Current planner flow

1. Land on a signed-out homepage with a Google sign-in button.
2. Authenticate with Google through Supabase Auth.
3. Complete the wedding survey one question at a time.
4. Save survey progress or finish onboarding.
5. Generate a wedding plan using the saved profile as persistent context.
6. Refine the plan with follow-up requests while preserving the same wedding context.
7. Add local vendor or venue notes to improve retrieval grounding.

## Structured output

Planner responses are rendered in these sections:

- `summary`
- `budgetBreakdown`
- `vendorSuggestions`
- `tradeoffs`
- `savingsOptions`
- `nextSteps`

## Storage model

- Knowledge documents and embeddings can use Supabase when configured, with local JSON fallback.
- Wedding profiles and planner sessions can also use Supabase when configured, with local JSON fallback.
- Local fallback storage still lives in:
  - `data/store.json`
  - `data/vector-store.json`

## Key modules

- `components/wedding-planner-app.tsx`: survey-first wedding planner UI
- `lib/wedding-survey-schema.ts`: editable survey schema
- `lib/wedding-profile.ts`: profile defaults, merge logic, onboarding completeness
- `lib/wedding-validation.ts`: API validation for survey/profile and generation payloads
- `lib/wedding-calculator.ts`: deterministic wedding budget and tradeoff logic
- `lib/wedding-retrieval.ts`: structured vendor/venue retrieval plus document retrieval
- `data/wedding-knowledge.ts`: local wedding vendor and venue knowledge base
- `lib/prompt.ts`: wedding planner system prompt and prompt assembly
- `lib/llm.ts`: wedding planning orchestration and structured response generation
- `lib/planner-store.ts`: Supabase-or-local persistence for profiles and sessions
- `lib/knowledge-store.ts`: Supabase-or-local persistence for knowledge docs
- `lib/vector-store.ts`: Supabase-or-local vector indexing and search

## Run locally

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Required for live LLM generation:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `OPENAI_EMBED_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAG_CHUNK_SIZE`
- `RAG_CHUNK_OVERLAP`

Use `.env.example` as a template, but copy values into `.env.local` or `.env`.

## Supabase setup

1. Open Supabase SQL Editor.
2. Paste and run `supabase/schema.sql`.
3. In Supabase Auth, enable Google under Authentication > Providers.
4. Add your site URL and local callback URL in Supabase Auth settings.
5. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to your real env file.
6. Restart the app.

The current schema includes:

- `wedding_profiles`
- `planner_sessions`
- `knowledge_documents`
- `knowledge_chunks`

Notes:

- `knowledge_chunks.embedding` uses `vector(1536)` for `text-embedding-3-small`.
- Planner data is keyed to `auth.users` and RLS is enabled in the SQL schema.
- The browser uses the anon key for Google sign-in; the server verifies bearer tokens with the service-role key.
- Use the service-role key on the server only. Do not expose it in client code.

## Testing

Run the deterministic planner tests with:

```bash
npm test
```

Current tests cover:

- priority-sensitive category allocation
- cheaper-plan scenario calculation
- guest-count increase tradeoff behavior

## API quick reference

- `GET /api/profile`: fetch the current wedding profile
- `PUT /api/profile`: save survey progress or completed wedding profile
- `POST /api/generate`: generate a structured wedding plan
- `POST /api/feedback`: attach thumbs up/down feedback to a planner session
- `GET /api/knowledge`: list local knowledge notes
- `POST /api/knowledge`: create a knowledge note
- `PUT /api/knowledge/:id`: update a knowledge note
- `DELETE /api/knowledge/:id`: delete a knowledge note

## Verification

Validated in this repo with:

- `npm run typecheck`
- `npm run lint`

## Next steps for production

- Add score thresholding and optional reranking.
- Expand automated tests for RAG, profile scoping, and API validation.
- remotely hosted
