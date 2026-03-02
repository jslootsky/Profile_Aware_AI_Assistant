import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { email, name } = (await req.json()) as { email: string; name?: string };
  if (!email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const prisma = getPrisma();
  let userId = crypto.randomUUID();
  if (prisma) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name },
      update: { name }
    });
    userId = user.id;
  }

  const res = NextResponse.json({ ok: true, userId, email, name });
  res.cookies.set("demo_user_id", userId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
