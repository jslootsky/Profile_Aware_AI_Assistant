import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import { listPlannerSessions } from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";

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
