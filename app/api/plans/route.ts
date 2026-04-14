import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import { listPlannerSessions, savePlannerSession } from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";
import { StoredSessionOutput, StructuredResponse } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const revisions = await listPlannerSessions(
      user.id,
      token ? getSupabaseUserClient(token) : undefined,
    );

    return NextResponse.json({ revisions });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const supabase = token ? getSupabaseUserClient(token) : undefined;
    const body = (await request.json()) as Partial<StoredSessionOutput> & {
      currentOutput?: StructuredResponse;
    };

    if (!body.currentOutput) {
      return NextResponse.json(
        { error: "currentOutput is required." },
        { status: 400 },
      );
    }

    const sessionId = crypto.randomUUID();
    const revision: StoredSessionOutput = {
      id: sessionId,
      userId: user.id,
      threadId: body.threadId || sessionId,
      baseTask: body.baseTask || "",
      previousOutput: body.previousOutput || null,
      currentOutput: body.currentOutput,
      revisionRequest: body.revisionRequest || "Manual save",
      createdAt: new Date().toISOString(),
    };

    await savePlannerSession(revision, supabase);

    return NextResponse.json({ revision });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
