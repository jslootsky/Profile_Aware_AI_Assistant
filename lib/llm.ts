import OpenAI from "openai";
import { buildPrompt } from "./prompt";
import { Citation, GenerateRequest, StructuredResponse, UserProfile } from "./types";

function fallbackResponse(): StructuredResponse {
  return {
    summary: "OpenAI API key is not configured. Showing fallback response.",
    assumptions: ["Set OPENAI_API_KEY to enable live generation."],
    recommendation: "Add the API key and retry.",
    steps: ["Set environment variable", "Restart app", "Regenerate report"],
    risks: ["Fallback output is generic and non-authoritative."]
  };
}

function parseStructured(content: string): StructuredResponse {
  const parsed = JSON.parse(content) as StructuredResponse;
  return {
    summary: parsed.summary,
    assumptions: parsed.assumptions ?? [],
    recommendation: parsed.recommendation,
    steps: parsed.steps ?? [],
    risks: parsed.risks ?? []
  };
}

export async function generateStructuredResponse(input: GenerateRequest, profile: UserProfile, context: Citation[]) {
  const prompt = buildPrompt(input, profile, context);

  if (!process.env.OPENAI_API_KEY) {
    return { prompt, response: { ...fallbackResponse(), citations: input.options.citeSources ? context : undefined } };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    response_format: { type: "json_object" }
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const response = parseStructured(raw);
  if (input.options.citeSources && context.length) {
    response.citations = context;
  }

  return { prompt, response };
}
