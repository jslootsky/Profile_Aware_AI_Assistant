import { NextRequest, NextResponse } from "next/server";
import { generateStructuredResponse } from "@/lib/llm";
import { GenerateRequest, UserProfile } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { retrieveContext } from "@/lib/rag";

const fallbackProfile: UserProfile = {
  roleIndustry: "",
  goals: "",
  tone: "Professional and concise",
  constraints: "",
  preferredFormat: "report",
  dos: "",
  donts: ""
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await request.json()) as GenerateRequest;
  if (!payload?.task?.trim()) {
    return NextResponse.json({ error: "Task is required." }, { status: 400 });
  }

  const prisma = getPrisma();
  const profileRecord = prisma ? await prisma.userProfile.findUnique({ where: { userId: user.id } }) : null;
  const profile = profileRecord
    ? {
        roleIndustry: profileRecord.roleIndustry,
        goals: profileRecord.goals,
        tone: profileRecord.tone,
        constraints: profileRecord.constraints,
        preferredFormat: profileRecord.preferredFormat as UserProfile["preferredFormat"],
        dos: profileRecord.dos || "",
        donts: profileRecord.donts || ""
      }
    : fallbackProfile;

  const context = payload.options.citeSources ? await retrieveContext(payload.task, user.id) : [];
  const result = await generateStructuredResponse(payload, profile, context);

  if (prisma) {
    const saved = await prisma.sessionOutput.create({
      data: {
        userId: user.id,
        task: payload.task,
        refinement: payload.refinement,
        prompt: result.prompt,
        reportJson: result.response,
        citations: result.response.citations
      }
    });

    await prisma.analyticsEvent.create({
      data: { userId: user.id, eventType: "generate", metadata: { sessionOutputId: saved.id } }
    });

    return NextResponse.json({ ...result, sessionOutputId: saved.id });
  }

  return NextResponse.json(result);
}
