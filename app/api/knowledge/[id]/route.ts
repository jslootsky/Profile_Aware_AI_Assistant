import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import {
  deleteKnowledgeDocument,
  getKnowledgeDocumentById,
  updateKnowledgeDocument,
} from "@/lib/knowledge-store";
import { embedForStorage, removeFromStorage, isIndexed } from "@/lib/rag";
import { getSupabaseUserClient } from "@/lib/supabase";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const supabase = token ? getSupabaseUserClient(token) : undefined;
    const existing = await getKnowledgeDocumentById(params.id, supabase);

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const body = (await request.json()) as { source?: string; content?: string };
    const source = body.source?.trim() || existing.source;
    const content = body.content?.trim() || existing.content;

    if (!source || !content) {
      return NextResponse.json(
        { error: "Source and content required." },
        { status: 400 },
      );
    }

    if (content !== existing.content || source !== existing.source) {
      await embedForStorage(user.id, source, content, params.id);
    }

    const updated = await updateKnowledgeDocument(params.id, {
      source,
      content,
      embedding: [],
    }, supabase);

    return NextResponse.json({
      id: updated?.id,
      source: updated?.source,
      hasEmbedding: await isIndexed(params.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const supabase = token ? getSupabaseUserClient(token) : undefined;
    const existing = await getKnowledgeDocumentById(params.id, supabase);

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    await deleteKnowledgeDocument(params.id, supabase);
    await removeFromStorage(params.id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
