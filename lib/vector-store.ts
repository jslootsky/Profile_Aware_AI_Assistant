import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs/promises";

const VECTOR_STORE_PATH = path.join(process.cwd(), "data", "vectorstore");

export async function getVectorStore() {
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  });

  try {
    // Check if the vector store directory exists
    await fs.access(VECTOR_STORE_PATH);
    return await HNSWLib.load(VECTOR_STORE_PATH, embeddings);
  } catch (error) {
    // If not, create a new one (we need at least one document to initialize)
    // We'll initialize with a dummy document and then we can add more
    const initialDoc = new Document({
      pageContent: "Initial document",
      metadata: { userId: "system", source: "system" },
    });
    const vectorStore = await HNSWLib.fromDocuments([initialDoc], embeddings);
    await vectorStore.save(VECTOR_STORE_PATH);
    return vectorStore;
  }
}

export async function addDocumentToVectorStore(
  userId: string,
  source: string,
  content: string,
) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  const docs = await splitter.createDocuments(
    [content],
    [{ userId, source }]
  );

  const vectorStore = await getVectorStore();
  await vectorStore.addDocuments(docs);
  await vectorStore.save(VECTOR_STORE_PATH);
}

export async function searchVectorStore(
  userId: string,
  query: string,
  topK: number = 3
) {
  const vectorStore = await getVectorStore();
  // Filter by userId in metadata
  const results = await vectorStore.similaritySearch(query, topK, (doc) => {
    return doc.metadata.userId === userId;
  });

  return results.map((doc) => ({
    source: doc.metadata.source,
    text: doc.pageContent,
    score: 1.0, // HNSWLib similaritySearch doesn't always return score in this call, but we can use similaritySearchWithScore
  }));
}

export async function searchVectorStoreWithScore(
  userId: string,
  query: string,
  topK: number = 3
) {
  const vectorStore = await getVectorStore();
  const results = await vectorStore.similaritySearchWithScore(query, topK, (doc) => {
    return doc.metadata.userId === userId;
  });

  return results.map(([doc, score]) => ({
    source: doc.metadata.source,
    text: doc.pageContent,
    score: 1 - score, // HNSWLib returns distance, so 1 - distance is similarity
  }));
}
