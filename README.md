# Profile-Aware AI Assistant (MVP)

A lightweight Next.js + TypeScript MVP for generating personalized AI reports from reusable user profiles and iterative refinements.

## Included in this MVP
- Profile capture: role/industry, goals, tone, constraints, format, do/don't instructions.
- Request input: task text, verbosity, report type, cite sources toggle.
- Structured output schema: summary → assumptions → recommendation → steps → risks.
- Iteration flow: refinement instruction + revision history.
- API endpoint and prompt assembly logic for profile-aware generation.
- Prisma schema for profile and output persistence (PostgreSQL).

## Tech stack
- Next.js 14 + React 18 + TypeScript
- Tailwind CSS
- Node.js runtime (single-repo frontend + API)

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Key files
- `app/page.tsx`: main app entry
- `components/assistant-app.tsx`: profile/request/output/refinement UI
- `app/api/generate/route.ts`: generation API route
- `lib/prompt.ts`: prompt template composition
- `lib/llm.ts`: LLM service abstraction (heuristic stub; easy to replace with OpenAI SDK)
- `prisma/schema.prisma`: database models

## Next steps for production
- Replace heuristic LLM stub in `lib/llm.ts` with OpenAI SDK calls.
- Add auth and per-user profile persistence.
- Add RAG pipeline (`lib/rag.ts`) + vector search.
- Implement PDF/DOC export and source citation renderer.
- Add analytics dashboard and quality feedback loop.
