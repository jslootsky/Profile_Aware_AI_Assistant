import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { upsertKnowledgeChunk } from "@/lib/rag";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { source, content } = await req.json();
  if (!source || !content) return NextResponse.json({ error: "source and content required" }, { status: 400 });

  await upsertKnowledgeChunk(user.id, source, content);
  return NextResponse.json({ ok: true });
}
