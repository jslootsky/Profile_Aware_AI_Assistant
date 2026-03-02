import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ generatedReports: 0, feedbackCount: 0, positiveFeedback: 0, negativeFeedback: 0 });
  }

  const [generatedReports, feedbacks] = await Promise.all([
    prisma.sessionOutput.count({ where: { userId: user.id } }),
    prisma.feedback.findMany({ where: { userId: user.id } })
  ]);

  const positiveFeedback = feedbacks.filter((f: { rating: string }) => f.rating === "up").length;
  const negativeFeedback = feedbacks.filter((f: { rating: string }) => f.rating === "down").length;

  return NextResponse.json({ generatedReports, feedbackCount: feedbacks.length, positiveFeedback, negativeFeedback });
}
