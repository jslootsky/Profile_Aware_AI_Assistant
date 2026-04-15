import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import {
  listPlannerSavedVendors,
  savePlannerVendor,
} from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";
import { VendorChatOption } from "@/lib/types";

function cleanVendor(input: Partial<VendorChatOption>) {
  return {
    name: String(input.name || "").trim(),
    category: String(input.category || "Other").trim(),
    region: String(input.region || "not provided").trim(),
    websiteUrl: String(input.websiteUrl || "").trim(),
    description: String(input.description || "").trim(),
    source: String(input.source || "Vendor chatbot").trim(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const vendors = await listPlannerSavedVendors(
      user.id,
      token ? getSupabaseUserClient(token) : undefined,
    );

    return NextResponse.json({ vendors });
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
    const vendor = cleanVendor((await request.json()) as Partial<VendorChatOption>);

    if (!vendor.name || !/^https?:\/\//i.test(vendor.websiteUrl)) {
      return NextResponse.json(
        { error: "Vendor name and a public website URL are required." },
        { status: 400 },
      );
    }

    const saved = await savePlannerVendor(
      {
        ...vendor,
        userId: user.id,
      },
      token ? getSupabaseUserClient(token) : undefined,
    );

    return NextResponse.json({ vendor: saved });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
