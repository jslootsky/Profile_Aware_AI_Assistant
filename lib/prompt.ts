import { Citation, GenerateRequest, UserProfile } from "./types";

const SYSTEM_PROMPT = `You are a profile-aware AI assistant.
Rules:
1) Follow requested tone and preferred output format.
2) Keep a stable schema: Summary -> Assumptions -> Recommendation -> Steps -> Risks.
3) Ask clarifying questions if critical details are missing.
4) If citations are requested and provided context exists, include citations.
5) Be actionable and concise.
6) Return JSON with keys: summary, assumptions, recommendation, steps, risks.`;

export function buildPrompt(input: GenerateRequest, profile: UserProfile, context: Citation[]): string {
  const profileSection = `Profile\n- Role/Industry: ${profile.roleIndustry}\n- Goals: ${profile.goals}\n- Tone: ${profile.tone}\n- Constraints: ${profile.constraints}\n- Preferred Format: ${profile.preferredFormat}\n- Do: ${profile.dos || "N/A"}\n- Don't: ${profile.donts || "N/A"}`;

  const optionsSection = `Options\n- Verbosity: ${input.options.verbosity}\n- Report Type: ${input.options.reportType}\n- Cite Sources: ${input.options.citeSources ? "yes" : "no"}`;

  const historySection = input.history.length
    ? `Iteration History\n${input.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "Iteration History\nNone";

  const userSection = `User Request\n${input.task}\n\nRefinement\n${input.refinement || "None"}`;

  const citationsSection = context.length
    ? `Retrieved Context\n${context.map((c, i) => `[${i + 1}] ${c.source}: ${c.excerpt}`).join("\n")}`
    : "Retrieved Context\nNone";

  return [SYSTEM_PROMPT, profileSection, optionsSection, historySection, citationsSection, userSection].join("\n\n");
}
