import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 150;

export function getEmbeddings() {
  return new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  });
}

export function getChunkSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: Number(process.env.RAG_CHUNK_SIZE || DEFAULT_CHUNK_SIZE),
    chunkOverlap: Number(
      process.env.RAG_CHUNK_OVERLAP || DEFAULT_CHUNK_OVERLAP,
    ),
  });
}

export async function splitKnowledgeDocument(params: {
  userId: string;
  documentId: string;
  source: string;
  content: string;
}) {
  const splitter = getChunkSplitter();
  const docs = await splitter.createDocuments([params.content], [
    {
      user_id: params.userId,
      document_id: params.documentId,
      source: params.source,
    },
  ]);

  return docs.map(
    (doc, index) =>
      new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          chunk_index: index,
        },
      }),
  );
}
