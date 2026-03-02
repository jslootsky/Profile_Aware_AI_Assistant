import { NextRequest, NextResponse } from "next/server";
import { generateStructuredResponse } from "@/lib/llm";
import { GenerateRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as GenerateRequest;

  if (!payload?.task?.trim()) {
    return NextResponse.json({ error: "Task is required." }, { status: 400 });
  }

  const result = await generateStructuredResponse(payload);
  return NextResponse.json(result);
}
