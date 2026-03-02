# Profile-Aware AI Assistant (MVP+)

This project now includes profile personalization, authenticated user sessions, OpenAI-backed generation, RAG retrieval, report exports, and analytics/feedback.

## Features delivered
- **Auth + per-user persistence** via cookie login endpoints and Prisma models.
- **OpenAI SDK integration** replacing heuristic generation (`lib/llm.ts`).
- **RAG pipeline + vector search** using stored knowledge chunks with embeddings and cosine similarity fallback.
- **Structured report output** with citation rendering in UI.
- **PDF and DOC export** endpoint for generated reports.
- **Analytics + feedback loop** with stored user feedback and summary dashboard.

## Required environment variables
```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

## Run locally
```bash
npm install
npx prisma generate
npm run dev
```

## API endpoints
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/profile`
- `POST /api/generate`
- `POST /api/knowledge`
- `POST /api/feedback`
- `GET /api/analytics`
- `POST /api/export`
