/**
 * POST /api/knowledge
 *
 * Purpose
 * -------
 * This API route allows a user to store a new "knowledge document"
 * that can later be retrieved by the RAG (Retrieval-Augmented Generation)
 * system when generating AI responses.
 *
 * When a document is uploaded:
 *   1. The user is authenticated (or auto-created via cookie).
 *   2. The document text is embedded using OpenAI.
 *   3. The document + embedding are stored in the local data store.
 *   4. The document ID is returned to the client.
 *
 * This allows the AI assistant to later retrieve relevant knowledge
 * from previously stored documents using vector similarity search.
 *
 * Dependencies
 * ------------
 *
 * auth.ts
 *   getAuthedUser(request)
 *      Retrieves the current user based on the request cookie.
 *      If no user exists, a new one may be created.
 *
 *   setAuthedCookie(response, userId)
 *      Writes a cookie back to the client so future requests
 *      remain associated with the same user.
 *
 * store.ts
 *   addKnowledgeDoc(...)
 *      Saves a document in the application's data store
 *      (currently data/store.json).
 *
 * rag.ts
 *   embedForStorage(content)
 *      Generates an OpenAI embedding vector for the document text
 *      so it can later be used in semantic search.
 *
 * Request Body (JSON)
 * -------------------
 *
 * {
 *   "source": "document title or filename",
 *   "content": "full document text"
 * }
 *
 * source
 *   A label identifying the document (e.g. "company_policy.md").
 *
 * content
 *   The text content of the document to store.
 *
 * Behavior
 * --------
 *
 * 1. The route first identifies the user using cookies.
 *
 * 2. It validates that both source and content exist.
 *    If either is missing:
 *
 *       HTTP 400
 *       { error: "Source and content required." }
 *
 * 3. The document text is converted into an embedding vector
 *    using OpenAI via embedForStorage().
 *
 * 4. The document is saved using addKnowledgeDoc() with:
 *
 *       {
 *         userId,
 *         source,
 *         content,
 *         embedding
 *       }
 *
 * 5. The response returns the ID of the stored document.
 *
 * Response
 * --------
 *
 * Success:
 *
 *   {
 *     "id": "document-id"
 *   }
 *
 * This ID can later be used to reference the document if needed.
 *
 * How this connects to the RAG system
 * -----------------------------------
 *
 * This endpoint stores documents that will later be retrieved by:
 *
 *     retrieveContext(userId, query)
 *
 * inside rag.ts.
 *
 * During AI generation:
 *
 *     user question
 *         ↓
 *     retrieveContext()
 *         ↓
 *     find similar documents
 *         ↓
 *     inject them into the LLM prompt
 *
 * This enables the AI assistant to answer questions using
 * previously stored knowledge instead of relying only on
 * the base language model.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, setAuthedCookie } from "@/lib/auth";
import { addKnowledgeDoc } from "@/lib/store";
import { embedForStorage } from "@/lib/rag";

export async function POST(request: NextRequest) {
  const user = await getAuthedUser(request);
  const { source, content } = (await request.json()) as {
    source: string;
    content: string;
  };
  if (!source || !content)
    return NextResponse.json(
      { error: "Source and content required." },
      { status: 400 },
    );
  const embedding = await embedForStorage(content);
  const doc = await addKnowledgeDoc({
    userId: user.id,
    source,
    content,
    embedding,
  });
  const response = NextResponse.json({ id: doc.id });
  setAuthedCookie(response, user.id);
  return response;
}
