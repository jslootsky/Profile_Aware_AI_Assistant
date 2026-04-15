import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import { deletePlannerSavedVendor } from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const deleted = await deletePlannerSavedVendor(
      user.id,
      params.id,
      token ? getSupabaseUserClient(token) : undefined,
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "Saved vendor not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
