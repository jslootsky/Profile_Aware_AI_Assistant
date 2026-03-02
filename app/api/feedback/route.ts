import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionOutputId, rating, reason } = await req.json();
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true, warning: "DATABASE_URL not set" });

  await prisma.feedback.create({
    data: { userId: user.id, sessionOutputId, rating, reason }
  });

  await prisma.analyticsEvent.create({
    data: { userId: user.id, eventType: "feedback", metadata: { rating, sessionOutputId } }
  });

  return NextResponse.json({ ok: true });
}
