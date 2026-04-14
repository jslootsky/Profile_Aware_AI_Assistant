import { BudgetLineItem, GenerateRequest, VendorSuggestion } from "./types";

export const WEDDING_SYSTEM_PROMPT = `You are a Budget Wedding Planner.
Rules:
1) Optimize for affordability and feasibility before creativity.
2) Obey hard constraints: budget, guest count, location, season/date, priorities, alcohol preference, DIY willingness, and stated constraints.
3) Explain tradeoffs explicitly when one choice pushes another category over budget.
4) Avoid unrealistic recommendations that do not fit the stated constraints.
5) Use the deterministic budget plan and retrieved user notes as grounding.
6) Support iterative refinements and treat follow-ups as modifications to the same wedding plan.
7) Return a stable structure with sections: summary, budgetBreakdown, vendorSuggestions, tradeoffs, savingsOptions, nextSteps.
8) Keep recommendations practical, price-aware, and easy to act on.
9) Treat vendorSuggestions as a vendor tracker. Preserve contracted/not_contracted status from the structured suggestions and do not invent vendor names, quotes, or contracted status beyond retrieved user notes.`;

function formatBudgetBreakdown(lineItems: BudgetLineItem[]) {
  return lineItems
    .map(
      (item) =>
        `- ${item.category}: amount ${item.allocation}, rationale: ${item.rationale}`,
    )
    .join("\n");
}

function formatVendorSuggestions(vendors: VendorSuggestion[]) {
  if (!vendors.length) return "(none)";
  return vendors
    .map(
      (vendor, index) =>
        `[${index + 1}] ${vendor.category} | ${vendor.status} | ${vendor.name} | ${vendor.region} | ${vendor.priceEstimate} | source: ${vendor.source} | ${vendor.whyItFits}`,
    )
    .join("\n");
}

function formatPreviousOutput(input: GenerateRequest) {
  if (!input.previousOutput) return "Previous Output\nNone";

  return `Previous Output
${JSON.stringify(input.previousOutput, null, 2)}`;
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

  const calculatorSection = `Deterministic Budget Guidance\n${
    context?.budgetBreakdownText || "(none)"
  }`;

  const vendorSection = `Structured Vendor / Venue Suggestions From Notes\n${
    formatVendorSuggestions(context?.vendorSuggestions || [])
  }`;

  const retrievedContextSection = `Retrieved Context\n${
    context?.retrievedContextText || "(none)"
  }`;

  const flowSection = input.previousOutput
    ? `Generation Mode
Revision. Use the previous output and the change request to produce a full updated plan, not a diff. Assume any part of the previous plan not mentioned in the change request should stay the same. Treat avoid instructions as part of the change request.`
    : `Generation Mode
Initial generation. Produce a full plan from the base task.`;

  const userSection = `Base Task
${input.task}

${formatPreviousOutput(input)}

Change Request
${input.revisionRequest || "None"}`;

  return [
    WEDDING_SYSTEM_PROMPT,
    profileSection,
    optionsSection,
    flowSection,
    calculatorSection,
    vendorSection,
    retrievedContextSection,
    userSection,
  ].join("\n\n");
}

export function serializeBudgetBreakdown(lineItems: BudgetLineItem[]) {
  return formatBudgetBreakdown(lineItems);
}
