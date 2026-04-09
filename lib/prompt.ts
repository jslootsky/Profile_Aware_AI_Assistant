import { BudgetLineItem, GenerateRequest, VendorSuggestion } from "./types";

export const WEDDING_SYSTEM_PROMPT = `You are a Budget Wedding Planner.
Rules:
1) Optimize for affordability and feasibility before creativity.
2) Obey hard constraints: budget, guest count, location, season/date, priorities, alcohol preference, DIY willingness, and stated constraints.
3) Explain tradeoffs explicitly when one choice pushes another category over budget.
4) Avoid unrealistic recommendations that do not fit the stated constraints.
5) Use the deterministic budget plan and retrieved vendor context as grounding.
6) Support iterative refinements and treat follow-ups as modifications to the same wedding plan.
7) Return a stable structure with sections: summary, budgetBreakdown, vendorSuggestions, tradeoffs, savingsOptions, nextSteps.
8) Keep recommendations practical, price-aware, and easy to act on.`;

function formatBudgetBreakdown(lineItems: BudgetLineItem[]) {
  return lineItems
    .map(
      (item) =>
        `- ${item.category}: allocation ${item.allocation}, range ${item.estimatedRange}, rationale: ${item.rationale}`,
    )
    .join("\n");
}

function formatVendorSuggestions(vendors: VendorSuggestion[]) {
  if (!vendors.length) return "(none)";
  return vendors
    .map(
      (vendor, index) =>
        `[${index + 1}] ${vendor.category} | ${vendor.name} | ${vendor.region} | ${vendor.priceEstimate} | ${vendor.whyItFits}`,
    )
    .join("\n");
}

export function buildPrompt(input: GenerateRequest, context?: {
  budgetBreakdownText?: string;
  vendorSuggestions?: VendorSuggestion[];
  retrievedContextText?: string;
}): string {
  const profileSection = `Wedding Profile
- Couple: ${input.profile.partnerNames || "not provided"}
- Total Budget: $${input.profile.totalBudget}
- Guest Count: ${input.profile.guestCount}
- Location: ${input.profile.location || "not provided"}
- Season: ${input.profile.season}
- Target Date: ${input.profile.targetDate || "flexible"}
- Priorities: ${input.profile.priorities.join(", ")}
- Alcohol Allowed: ${input.profile.alcoholAllowed}
- DIY Willingness: ${input.profile.diyWillingness}
- Style: ${input.profile.style}
- Ceremony Type: ${input.profile.ceremonyType}
- Catering Preference: ${input.profile.cateringPreference}
- Constraints: ${input.profile.constraints || "none stated"}`;

  const optionsSection = `Planner Options
- Verbosity: ${input.options.verbosity}
- Report Type: ${input.options.reportType}
- Cite Sources: ${input.options.citeSources ? "yes" : "no"}`;

  const historySection = input.history.length
    ? `Planning History\n${input.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "Planning History\nNone";

  const calculatorSection = `Deterministic Budget Guidance\n${
    context?.budgetBreakdownText || "(none)"
  }`;

  const vendorSection = `Structured Vendor / Venue Suggestions\n${
    formatVendorSuggestions(context?.vendorSuggestions || [])
  }`;

  const retrievedContextSection = `Retrieved Context\n${
    context?.retrievedContextText || "(none)"
  }`;

  const userSection = `Current Planning Request
${input.task}

Refinement
${input.refinement || "None"}`;

  return [
    WEDDING_SYSTEM_PROMPT,
    profileSection,
    optionsSection,
    historySection,
    calculatorSection,
    vendorSection,
    retrievedContextSection,
    userSection,
  ].join("\n\n");
}

export function serializeBudgetBreakdown(lineItems: BudgetLineItem[]) {
  return formatBudgetBreakdown(lineItems);
}
