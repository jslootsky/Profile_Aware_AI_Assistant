import { GenerateRequest } from "./types";

const SYSTEM_PROMPT = `You are a profile-aware AI assistant.
Rules:
1) Follow requested tone and preferred output format.
2) Keep a stable schema: Summary -> Assumptions -> Recommendation -> Steps -> Risks.
3) Ask clarifying questions if critical details are missing.
4) If citations are requested and provided context exists, include citations.
5) Be actionable and concise.`;

export function buildPrompt(input: GenerateRequest): string {
  const profileSection = `Profile\n- Role/Industry: ${input.profile.roleIndustry}\n- Goals: ${input.profile.goals}\n- Tone: ${input.profile.tone}\n- Constraints: ${input.profile.constraints}\n- Preferred Format: ${input.profile.preferredFormat}\n- Do: ${input.profile.dos || "N/A"}\n- Don't: ${input.profile.donts || "N/A"}`;

  const optionsSection = `Options\n- Verbosity: ${input.options.verbosity}\n- Report Type: ${input.options.reportType}\n- Cite Sources: ${input.options.citeSources ? "yes" : "no"}`;

  const historySection = input.history.length
    ? `Iteration History\n${input.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "Iteration History\nNone";

  const userSection = `User Request\n${input.task}\n\nRefinement\n${input.refinement || "None"}`;

  return [SYSTEM_PROMPT, profileSection, optionsSection, historySection, userSection].join("\n\n");
}
