import { buildPrompt } from "./prompt";
import { GenerateRequest, StructuredResponse } from "./types";

function heuristicGenerate(input: GenerateRequest): StructuredResponse {
  const needsClarification = !input.task.toLowerCase().includes("for") && input.task.split(" ").length < 5;

  const summary = needsClarification
    ? "I can help, but I need one key detail before producing a high-confidence recommendation."
    : `Prepared a ${input.options.reportType} response tailored for ${input.profile.roleIndustry || "your context"}.`;

  const assumptions = [
    `Primary goal: ${input.profile.goals || "not provided"}`,
    `Tone: ${input.profile.tone || "professional"}`,
    `Constraints respected: ${input.profile.constraints || "none stated"}`
  ];

  const recommendation = needsClarification
    ? "Please clarify target audience, timeline, and success criteria."
    : `Use a ${input.profile.preferredFormat} style output with emphasis on ${input.options.reportType}.`;

  const steps = [
    "Confirm objective and audience.",
    "Draft response with profile constraints and tone.",
    "Review for clarity, risks, and execution feasibility.",
    "Iterate with follow-up refinement instructions."
  ];

  const risks = [
    "Insufficient task context may reduce answer precision.",
    "Unclear budget/time constraints can lead to impractical recommendations.",
    "No source retrieval configured for external fact validation."
  ];

  return {
    summary,
    assumptions,
    recommendation,
    steps,
    risks,
    citations: input.options.citeSources ? ["No RAG source connected yet."] : undefined
  };
}

export async function generateStructuredResponse(input: GenerateRequest): Promise<{ prompt: string; response: StructuredResponse }> {
  const prompt = buildPrompt(input);
  const response = heuristicGenerate(input);

  return { prompt, response };
}
