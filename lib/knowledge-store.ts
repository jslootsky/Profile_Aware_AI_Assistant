import crypto from "crypto";
import {
  addKnowledgeDoc as addFileKnowledgeDoc,
  deleteKnowledgeDoc as deleteFileKnowledgeDoc,
  getKnowledgeDocumentById as getFileKnowledgeDocumentById,
  listKnowedgeDocuments as listFileKnowledgeDocuments,
  updateKnowledgeDoc as updateFileKnowledgeDoc,
} from "./store";
import { KnowledgeDocument } from "./types";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

type KnowledgeRow = {
  id: string;
  user_id: string;
  source: string;
  content: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mapKnowledgeRow(row: KnowledgeRow): KnowledgeDocument {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    content: row.content,
    createdAt: row.created_at,
    embedding: [],
  };
}

export async function addKnowledgeDocument(
  doc: Omit<KnowledgeDocument, "id" | "createdAt">,
) {
  if (!isSupabaseConfigured()) {
    return addFileKnowledgeDoc(doc);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = {
    id: crypto.randomUUID(),
    user_id: doc.userId,
    source: doc.source,
    content: doc.content,
    content_hash: sha256(doc.content),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapKnowledgeRow(data as KnowledgeRow);
}

export async function listKnowledgeDocuments(userId: string) {
  if (!isSupabaseConfigured()) {
    return listFileKnowledgeDocuments(userId);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as KnowledgeRow[]).map(mapKnowledgeRow);
}

export async function getKnowledgeDocumentById(id: string) {
  if (!isSupabaseConfigured()) {
    return getFileKnowledgeDocumentById(id);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapKnowledgeRow(data as KnowledgeRow) : null;
}

export async function updateKnowledgeDocument(
  id: string,
  updates: Pick<KnowledgeDocument, "source" | "content" | "embedding">,
) {
  if (!isSupabaseConfigured()) {
    return updateFileKnowledgeDoc(id, updates);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({
      source: updates.source,
      content: updates.content,
      content_hash: sha256(updates.content),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapKnowledgeRow(data as KnowledgeRow) : null;
}

export async function deleteKnowledgeDocument(id: string) {
  if (!isSupabaseConfigured()) {
    return deleteFileKnowledgeDoc(id);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);

  if (error) {
    throw error;
  }

  return true;
}
