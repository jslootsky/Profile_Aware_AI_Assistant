import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import {
  getPlannerProfile,
  listPlannerSavedVendors,
  listPlannerSessions,
} from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";
import { VendorChatMessage } from "@/lib/types";
import { generateVendorChatResponse } from "@/lib/vendor-chat";
import { VENDOR_CHAT_INITIAL_MESSAGE } from "@/lib/vendor-chat-shared";
import { mergeWeddingProfile } from "@/lib/wedding-profile";

export async function GET() {
  return NextResponse.json({ initialMessage: VENDOR_CHAT_INITIAL_MESSAGE });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const supabase = token ? getSupabaseUserClient(token) : undefined;
    const body = (await request.json()) as { messages?: VendorChatMessage[] };
    const messages = (body.messages || []).filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string" &&
        message.content.trim(),
    );

    if (!messages.some((message) => message.role === "user")) {
      return NextResponse.json(
        { error: "At least one user message is required." },
        { status: 400 },
      );
    }

    const [profile, plans, savedVendors] = await Promise.all([
      getPlannerProfile(user.id, supabase),
      listPlannerSessions(user.id, supabase),
      listPlannerSavedVendors(user.id, supabase),
    ]);

    const result = await generateVendorChatResponse({
      userId: user.id,
      profile: mergeWeddingProfile(profile),
      latestPlan: plans[0] || null,
      savedVendors,
      messages: [
        { role: "assistant", content: VENDOR_CHAT_INITIAL_MESSAGE },
        ...messages,
      ],
      supabaseClient: supabase,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
