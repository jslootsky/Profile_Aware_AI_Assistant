import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ profile: null });

  const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.json();
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true, warning: "DATABASE_URL not set" });

  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { ...payload, userId: user.id },
    update: payload
  });

  return NextResponse.json({ profile });
}
