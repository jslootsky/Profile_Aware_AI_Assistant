import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const cwd = process.cwd();
const envFiles = [".env.local", ".env"];
const storePath = path.join(cwd, "data", "store.json");
const vectorStorePath = path.join(cwd, "data", "vector-store.json");

function parseEnvFile(raw) {
  const entries = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

async function loadLocalEnv() {
  for (const file of envFiles) {
    const fullPath = path.join(cwd, file);

    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const parsed = parseEnvFile(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      continue;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readStore() {
  const raw = await fs.readFile(storePath, "utf-8");
  return JSON.parse(raw);
}

async function readLocalVectorStore() {
  try {
    const raw = await fs.readFile(vectorStorePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.chunks) ? parsed.chunks : [];
  } catch {
    return [];
  }
}

function createEmbeddings() {
  return new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  });
}

function createSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: Number(process.env.RAG_CHUNK_SIZE || 1000),
    chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP || 150),
  });
}

async function migrateDocument({ supabase, vectorStore, splitter, doc }) {
  const now = doc.createdAt || new Date().toISOString();
  const payload = {
    id: doc.id,
    user_id: doc.userId,
    source: doc.source,
    content: doc.content,
    content_hash: sha256(doc.content),
    created_at: now,
    updated_at: now,
  };

  const { error: documentError } = await supabase
    .from("knowledge_documents")
    .upsert(payload, { onConflict: "id" });

  if (documentError) {
    throw documentError;
  }

  const { error: deleteChunkError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .contains("metadata", { document_id: doc.id });

  if (deleteChunkError) {
    throw deleteChunkError;
  }

  if (!vectorStore || !splitter) {
    return { chunkCount: 0, indexed: false };
  }

  const splitDocs = await splitter.createDocuments([doc.content], [
    {
      user_id: doc.userId,
      document_id: doc.id,
      source: doc.source,
    },
  ]);

  const langchainDocs = splitDocs.map((item, index) => ({
    pageContent: item.pageContent,
    metadata: {
      ...item.metadata,
      chunk_index: index,
    },
  }));

  await vectorStore.addDocuments(langchainDocs);

  return { chunkCount: langchainDocs.length, indexed: true };
}

async function migrateExistingChunks({ supabase, doc, chunks }) {
  if (!chunks.length) {
    return { chunkCount: 0, indexed: false };
  }

  const payload = chunks.map((chunk) => ({
    content: chunk.text,
    embedding: chunk.embedding,
    metadata: {
      ...(chunk.metadata || {}),
      user_id: doc.userId,
      document_id: doc.id,
      source: doc.source,
    },
  }));

  const { error } = await supabase.from("knowledge_chunks").insert(payload);

  if (error) {
    throw error;
  }

  return { chunkCount: payload.length, indexed: true };
}

async function main() {
  await loadLocalEnv();

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const store = await readStore();
  const docs = Array.isArray(store.docs) ? store.docs : [];
  const localChunks = await readLocalVectorStore();
  const chunksByDocumentId = new Map();

  for (const chunk of localChunks) {
    if (!chunk?.documentId || !Array.isArray(chunk.embedding)) continue;

    const existing = chunksByDocumentId.get(chunk.documentId) || [];
    existing.push(chunk);
    chunksByDocumentId.set(chunk.documentId, existing);
  }

  if (!docs.length) {
    console.log("No local documents found in data/store.json.");
    return;
  }

  const docsMissingLocalEmbeddings = docs.filter(
    (doc) => !(chunksByDocumentId.get(doc.id)?.length > 0),
  ).length;
  const canIndex = Boolean(process.env.OPENAI_API_KEY);
  const splitter = canIndex ? createSplitter() : null;
  const vectorStore = canIndex
    ? new SupabaseVectorStore(createEmbeddings(), {
        client: supabase,
        tableName: "knowledge_chunks",
        queryName: "match_knowledge_chunks",
      })
    : null;

  if (!canIndex && docsMissingLocalEmbeddings > 0) {
    console.warn(
      "OPENAI_API_KEY is not set. Documents without local embeddings will be migrated without chunk indexing.",
    );
  }

  let migrated = 0;
  let indexed = 0;
  let chunkTotal = 0;
  let reusedLocalEmbeddings = 0;

  for (const doc of docs) {
    const existingChunks = chunksByDocumentId.get(doc.id) || [];
    const result =
      existingChunks.length > 0
        ? await migrateExistingChunks({
            supabase,
            doc,
            chunks: existingChunks,
          })
        : await migrateDocument({
            supabase,
            vectorStore,
            splitter,
            doc,
          });

    migrated += 1;
    chunkTotal += result.chunkCount;
    if (result.indexed) {
      indexed += 1;
    }
    if (existingChunks.length > 0) {
      reusedLocalEmbeddings += 1;
    }

    console.log(
      `Migrated document ${migrated}/${docs.length}: ${doc.source} (${result.chunkCount} chunks${existingChunks.length > 0 ? ", reused local embeddings" : ""})`,
    );
  }

  console.log("");
  console.log(`Documents migrated: ${migrated}`);
  console.log(`Documents indexed: ${indexed}`);
  console.log(`Chunks written: ${chunkTotal}`);
  console.log(`Documents using local embeddings: ${reusedLocalEmbeddings}`);
}

main().catch((error) => {
  console.error("Supabase migration failed.");
  console.error(error);
  process.exit(1);
});
