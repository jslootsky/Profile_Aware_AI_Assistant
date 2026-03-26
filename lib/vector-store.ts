import OpenAI from "openai";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const CHUNKS_PATH = path.join(process.cwd(), "data", "vector-store.json");

interface VectorChunk {
  id: string;
  documentId: string; // link to the original document in store.json
  userId: string;
  source: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}

interface VectorStoreData {
  chunks: VectorChunk[];
}

async function ensureChunksStore(): Promise<VectorStoreData> {
  try {
    const raw = await fs.readFile(CHUNKS_PATH, "utf-8");
    return JSON.parse(raw) as VectorStoreData;
  } catch (e) {
    await fs.mkdir(path.dirname(CHUNKS_PATH), { recursive: true });
    const seed: VectorStoreData = { chunks: [] };
    await fs.writeFile(CHUNKS_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
}

async function saveChunksStore(data: VectorStoreData) {
  await fs.writeFile(CHUNKS_PATH, JSON.stringify(data, null, 2));
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
  });
  return response.data[0].embedding;
}

function splitText(text: string, chunkSize: number = 1000, chunkOverlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    if (end > text.length) {
      end = text.length;
    }
    
    chunks.push(text.substring(start, end));
    
    if (end === text.length) break;
    start = end - chunkOverlap;
  }
  
  return chunks;
}

export async function removeDocumentFromVectorStore(documentId: string) {
  const store = await ensureChunksStore();
  store.chunks = store.chunks.filter((chunk) => chunk.documentId !== documentId);
  await saveChunksStore(store);
}

export async function addDocumentToVectorStore(
  userId: string,
  source: string,
  content: string,
  documentId: string, // Now required to track which chunks belong to which doc
) {
  // First, remove any existing chunks for this documentId
  await removeDocumentFromVectorStore(documentId);

  const chunks = splitText(content);
  const store = await ensureChunksStore();

  for (const chunkText of chunks) {
    const embedding = await getEmbedding(chunkText);
    store.chunks.push({
      id: crypto.randomUUID(),
      documentId,
      userId,
      source,
      text: chunkText,
      embedding,
      metadata: { userId, source, documentId },
    });
  }

  await saveChunksStore(store);
}

export async function isDocumentIndexed(documentId: string): Promise<boolean> {
  const store = await ensureChunksStore();
  return store.chunks.some((chunk) => chunk.documentId === documentId);
}

export async function searchVectorStoreWithScore(
  userId: string,
  query: string,
  topK: number = 3
) {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  const queryEmbedding = await getEmbedding(query);
  const store = await ensureChunksStore();

  const results = store.chunks
    .filter((chunk) => chunk.userId === userId || chunk.userId === "system")
    .map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      return {
        source: chunk.source,
        text: chunk.text,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

export async function searchVectorStore(
  userId: string,
  query: string,
  topK: number = 3
) {
  const results = await searchVectorStoreWithScore(userId, query, topK);
  return results.map(r => ({
    source: r.source,
    text: r.text,
    score: r.score
  }));
}
