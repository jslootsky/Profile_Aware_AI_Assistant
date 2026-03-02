import OpenAI from "openai";
import { getPrisma } from "./db";
import { Citation } from "./types";

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-12);
}

async function embed(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return response.data[0]?.embedding ?? null;
}

export async function retrieveContext(query: string, userId: string): Promise<Citation[]> {
  const prisma = getPrisma();
  if (!prisma) return [];

  const chunks = await prisma.knowledgeChunk.findMany({ where: { userId }, take: 50, orderBy: { createdAt: "desc" } });
  if (!chunks.length) return [];

  const queryEmbedding = await embed(query);

  const ranked = chunks
    .map((chunk: { embedding: unknown; content: string; source: string }) => {
      if (queryEmbedding && Array.isArray(chunk.embedding)) {
        const chunkEmbedding = (chunk.embedding as unknown[]).map((v) => Number(v));
        return { chunk, score: cosineSimilarity(queryEmbedding, chunkEmbedding) };
      }

      const overlap = query
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token && chunk.content.toLowerCase().includes(token)).length;
      return { chunk, score: overlap };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 5);

  return ranked.map(({ chunk }: { chunk: { source: string; content: string } }) => ({
    source: chunk.source,
    excerpt: chunk.content.slice(0, 320)
  }));
}

export async function upsertKnowledgeChunk(userId: string, source: string, content: string) {
  const prisma = getPrisma();
  if (!prisma) return;

  const vector = await embed(content);
  await prisma.knowledgeChunk.create({
    data: {
      userId,
      source,
      content,
      embedding: vector ?? undefined
    }
  });
}
