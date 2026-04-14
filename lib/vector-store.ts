import OpenAI from "openai";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { getEmbeddings, splitKnowledgeDocument } from "./langchain";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

const CHUNKS_PATH = path.join(process.cwd(), "data", "vector-store.json");

interface VectorChunk {
  id: string;
  documentId: string;
  userId: string;
  source: string;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

interface VectorStoreData {
  chunks: VectorChunk[];
}

interface ScoredChunk {
  source: string;
  text: string;
  score: number;
}

async function ensureChunksStore(): Promise<VectorStoreData> {
  try {
    const raw = await fs.readFile(CHUNKS_PATH, "utf-8");
    return JSON.parse(raw) as VectorStoreData;
  } catch {
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
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
  });

  return response.data[0].embedding;
}

function splitText(
  text: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 100,
): string[] {
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

function getLangChainVectorStore(supabaseClient?: SupabaseClient) {
  return new SupabaseVectorStore(getEmbeddings(), {
    client: supabaseClient || getSupabaseAdmin(),
    tableName: "knowledge_chunks",
    queryName: "match_knowledge_chunks",
  });
}

async function removeDocumentFromSupabase(
  documentId: string,
  supabaseClient?: SupabaseClient,
) {
  const { error } = await (supabaseClient || getSupabaseAdmin())
    .from("knowledge_chunks")
    .delete()
    .contains("metadata", { document_id: documentId });

  if (error) {
    throw error;
  }
}

async function addDocumentToSupabase(
  userId: string,
  source: string,
  content: string,
  documentId: string,
  supabaseClient?: SupabaseClient,
) {
  await removeDocumentFromSupabase(documentId, supabaseClient);

  const vectorStore = getLangChainVectorStore(supabaseClient);
  const docs = await splitKnowledgeDocument({
    userId,
    documentId,
    source,
    content,
  });

  await vectorStore.addDocuments(docs);
}

async function searchSupabaseVectorStore(
  userId: string,
  query: string,
  topK: number,
): Promise<ScoredChunk[]> {
  const vectorStore = getLangChainVectorStore();

  const scopedResults = await vectorStore.similaritySearchWithScore(query, topK, {
    user_id: userId,
  });

  const systemResults = await vectorStore.similaritySearchWithScore(query, topK, {
    user_id: "system",
  });

  return [...scopedResults, ...systemResults]
    .map(([doc, score]) => ({
      source: String(doc.metadata.source || "Knowledge document"),
      text: doc.pageContent,
      score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

async function isSupabaseDocumentIndexed(
  documentId: string,
  supabaseClient?: SupabaseClient,
) {
  const { count, error } = await (supabaseClient || getSupabaseAdmin())
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { document_id: documentId });

  if (error) {
    throw error;
  }

  return (count || 0) > 0;
}

async function removeDocumentFromFileStore(documentId: string) {
  const store = await ensureChunksStore();
  store.chunks = store.chunks.filter((chunk) => chunk.documentId !== documentId);
  await saveChunksStore(store);
}

async function addDocumentToFileStore(
  userId: string,
  source: string,
  content: string,
  documentId: string,
) {
  await removeDocumentFromFileStore(documentId);

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

async function searchFileVectorStore(
  userId: string,
  query: string,
  topK: number,
): Promise<ScoredChunk[]> {
  const queryEmbedding = await getEmbedding(query);
  const store = await ensureChunksStore();

  return store.chunks
    .filter((chunk) => chunk.userId === userId || chunk.userId === "system")
    .map((chunk) => ({
      source: chunk.source,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function removeDocumentFromVectorStore(
  documentId: string,
  supabaseClient?: SupabaseClient,
) {
  if (isSupabaseConfigured()) {
    await removeDocumentFromSupabase(documentId, supabaseClient);
    return;
  }

  await removeDocumentFromFileStore(documentId);
}

export async function addDocumentToVectorStore(
  userId: string,
  source: string,
  content: string,
  documentId: string,
  supabaseClient?: SupabaseClient,
) {
  if (isSupabaseConfigured()) {
    await addDocumentToSupabase(userId, source, content, documentId, supabaseClient);
    return;
  }

  await addDocumentToFileStore(userId, source, content, documentId);
}

export async function isDocumentIndexed(
  documentId: string,
  supabaseClient?: SupabaseClient,
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return isSupabaseDocumentIndexed(documentId, supabaseClient);
  }

  const store = await ensureChunksStore();
  return store.chunks.some((chunk) => chunk.documentId === documentId);
}

export async function searchVectorStoreWithScore(
  userId: string,
  query: string,
  topK: number = 3,
) {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  if (isSupabaseConfigured()) {
    return searchSupabaseVectorStore(userId, query, topK);
  }

  return searchFileVectorStore(userId, query, topK);
}

export async function searchVectorStore(
  userId: string,
  query: string,
  topK: number = 3,
) {
  const results = await searchVectorStoreWithScore(userId, query, topK);
  return results.map((result) => ({
    source: result.source,
    text: result.text,
    score: result.score,
  }));
}
