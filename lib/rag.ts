/**
 * rag.ts
 *
 * Purpose
 * -------
 * This file implements a very simple Retrieval-Augmented Generation (RAG) system.
 * RAG allows the AI to retrieve relevant pieces of stored knowledge before
 * generating a response so that answers can reference previously stored documents.
 *
 * Instead of sending *all* stored documents to the LLM, we:
 *   1. Convert the user query into a vector embedding.
 *   2. Compare that vector to embeddings of stored documents.
 *   3. Select the most semantically similar documents.
 *   4. Return the top results to be injected into the prompt sent to the LLM.
 *
 * Dependencies
 * ------------
 * 1. OpenAI SDK
 *    Used to generate embeddings for queries and documents.
 *    Specifically calls:
 *        client.embeddings.create(...)
 *
 * 2. store.ts
 *    Provides access to stored knowledge documents via:
 *        listKnowedgeDocuments(userId)
 *
 *    Each stored document is expected to look roughly like:
 *        {
 *          source: string      // document title or filename
 *          content: string     // full text of the document
 *          embedding?: number[] // vector representation of the content
 *        }
 *
 * 3. Environment Variables
 *    Requires:
 *        OPENAI_API_KEY
 *        OPENAI_EMBEDDING_MODEL (optional)
 *
 * Data Flow
 * ---------
 *
 * When retrieveContext() is called:
 *
 *    user query
 *        ↓
 *    convert query → embedding
 *        ↓
 *    compare with stored document embeddings
 *        ↓
 *    compute cosine similarity scores
 *        ↓
 *    return the most relevant documents
 *
 * What retrieveContext() expects
 * ------------------------------
 * retrieveContext(userId, query, topK)
 *
 * Parameters:
 *   userId : string
 *       Used to fetch the correct user's stored documents.
 *
 *   query : string
 *       The user's current request (task + refinement).
 *       This is embedded and compared to stored documents.
 *
 *   topK : number (default = 3)
 *       Maximum number of most relevant snippets to return.
 *
 * What retrieveContext() returns
 * ------------------------------
 * Promise<RetrievedSnippet[]>
 *
 * Each snippet contains:
 *
 *   {
 *      source: string
 *          where the text came from (document name)
 *
 *      text: string
 *          the document content
 *
 *      score: number
 *          cosine similarity score between query and document
 *          (higher = more relevant)
 *   }
 *
 * These snippets are later inserted into the LLM prompt like:
 *
 *    Retrieved Context:
 *    [1] document1: text...
 *    [2] document2: text...
 *
 * Other Functions
 * ---------------
 *
 * cosineSimilarity()
 *   Computes semantic similarity between two embeddings.
 *
 * getEmbedding()
 *   Calls OpenAI to generate an embedding vector for text.
 *
 * embedForStorage()
 *   Used when storing documents so they already have embeddings.
 *   This prevents recomputing embeddings every time retrieval happens.
 *
 * Behavior Without OpenAI Key
 * ---------------------------
 * If OPENAI_API_KEY is not defined:
 *
 *   retrieveContext() → returns []
 *   embedForStorage() → returns undefined
 *
 * This allows the app to run without RAG enabled.
 */

import {
  searchVectorStoreWithScore,
  addDocumentToVectorStore,
  removeDocumentFromVectorStore,
  isDocumentIndexed,
} from "./vector-store";

export interface RetrievedSnippet {
  source: string;
  text: string;
  score: number;
}

export interface RetrievalResult {
  snippets: RetrievedSnippet[];
  reason: "missing-openai-key" | "no-docs" | "no-embeddings" | "ok";
}

export async function retrieveContextDetailed(
  userId: string,
  query: string,
  topK = 3,
): Promise<RetrievalResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { snippets: [], reason: "missing-openai-key" };
  }

  try {
    const snippets = await searchVectorStoreWithScore(userId, query, topK);
    if (!snippets.length) {
      return { snippets: [], reason: "no-docs" };
    }
    return { snippets, reason: "ok" };
  } catch (error) {
    console.error("Vector search error:", error);
    return { snippets: [], reason: "no-docs" };
  }
}

export async function retrieveContext(
  userId: string,
  query: string,
  topK = 3,
): Promise<RetrievedSnippet[]> {
  const result = await retrieveContextDetailed(userId, query, topK);
  return result.snippets;
}

export async function embedForStorage(
  userId: string,
  source: string,
  content: string,
  documentId: string, // now required
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  await addDocumentToVectorStore(userId, source, content, documentId);
}

export async function removeFromStorage(documentId: string): Promise<void> {
  await removeDocumentFromVectorStore(documentId);
}

export async function isIndexed(documentId: string): Promise<boolean> {
  return isDocumentIndexed(documentId);
}
