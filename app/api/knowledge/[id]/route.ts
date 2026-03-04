import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, setAuthedCookie } from "@/lib/auth";
import {
  deleteKnowledgeDoc,
  getKnowledgeDocumentById,
  updateKnowledgeDoc,
} from "@/lib/store";
import { embedForStorage } from "@/lib/rag";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser(request);
  const existing = await getKnowledgeDocumentById(params.id);

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

  const embedding =
    content === existing.content
      ? existing.embedding
      : await embedForStorage(content);

  const updated = await updateKnowledgeDoc(params.id, {
    source,
    content,
    embedding,
  });

  const response = NextResponse.json({
    id: updated?.id,
    source: updated?.source,
    hasEmbedding: Boolean(updated?.embedding?.length),
  });
  setAuthedCookie(response, user.id);
  return response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthedUser(request);
  const existing = await getKnowledgeDocumentById(params.id);

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await deleteKnowledgeDoc(params.id);
  const response = NextResponse.json({ deleted: true });
  setAuthedCookie(response, user.id);
  return response;
}
