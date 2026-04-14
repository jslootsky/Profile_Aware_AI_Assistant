/**
 * =============================================================================
 * LLM Orchestration Layer (lib/llm.ts)
 * =============================================================================
 *
 * Purpose:
 * --------
 * This module is responsible for generating a structured AI response based on a
 * user’s profile, task request, and optional refinement. It acts as the central
 * integration point between:
 *
 *   - Prompt construction (lib/prompt.ts)
 *   - Retrieval-Augmented Generation (lib/rag.ts)
 *   - OpenAI LLM API
 *   - Application-level data types (lib/types.ts)
 *
 * It ensures all outputs conform to a strict JSON schema (StructuredResponse)
 * so the frontend can reliably render consistent sections such as:
 *   - summary
 *   - assumptions
 *   - recommendation
 *   - steps
 *   - risks
 *   - citations (optional)
 *
 * -----------------------------------------------------------------------------
 * Inputs:
 * -----------------------------------------------------------------------------
 * The main exported function is:
 *
 *   generateStructuredResponse(userId: string, input: GenerateRequest)
 *
 * Where:
 *
 *   userId:
 *     - Used for context retrieval (RAG) scoped to the user
 *
 *   input (GenerateRequest):
 *     - profile: user preferences (role, goals, tone, constraints, format)
 *     - task: primary user request
 *     - refinement (optional): iterative instruction to modify prior output
 *     - options:
 *         - reportType: type of output (plan, explanation, strategy, etc.)
 *         - citeSources: whether to include retrieved context
 *
 * -----------------------------------------------------------------------------
 * Processing Flow:
 * -----------------------------------------------------------------------------
 * 1. Context Retrieval (RAG)
 *    - If citeSources is enabled, retrieve relevant documents using:
 *        retrieveContext(userId, query)
 *    - Returns an array of chunks:
 *        { source: string, text: string }
 *
 * 2. Prompt Construction
 *    - Calls buildPrompt(input) to create the base system + user prompt
 *    - Appends retrieved context in a structured format
 *
 * 3. LLM Invocation
 *    - Uses OpenAI Responses API
 *    - Sends:
 *        - system instruction
 *        - user prompt (including context)
 *    - Enforces strict JSON output using json_schema format
 *
 * 4. Response Parsing
 *    - Parses JSON output into StructuredResponse
 *    - Attaches citations if RAG is used
 *
 * 5. Fallback Handling
 *    - If OPENAI_API_KEY is missing, returns a deterministic fallback response
 *    - Ensures the app still functions without external API access
 *
 * -----------------------------------------------------------------------------
 * Outputs:
 * -----------------------------------------------------------------------------
 * Returns:
 *
 *   {
 *     prompt: string;              // Full prompt sent to the LLM (for debugging)
 *     response: StructuredResponse // Structured AI output
 *   }
 *
 * The response is consumed by:
 *   - API route: app/api/generate/route.ts
 *   - UI: components/assistant-app.tsx
 *
 * -----------------------------------------------------------------------------
 * Dependencies:
 * -----------------------------------------------------------------------------
 * - buildPrompt (lib/prompt.ts)
 *     → Generates the base prompt using profile + task + refinement
 *
 * - retrieveContext (lib/rag.ts)
 *     → Retrieves relevant external knowledge (RAG pipeline)
 *
 * - Types (lib/types.ts)
 *     → Defines GenerateRequest and StructuredResponse
 *
 * - OpenAI SDK
 *     → Used for LLM inference via responses.create()
 *
 * -----------------------------------------------------------------------------
 * Environment Variables:
 * -----------------------------------------------------------------------------
 * - OPENAI_API_KEY (required for real LLM calls)
 * - OPENAI_MODEL (optional, defaults to "gpt-4")
 *
 * If OPENAI_API_KEY is not set:
 *   → The system returns a fallback response instead of calling the API
 *
 * -----------------------------------------------------------------------------
 * Design Notes:
 * -----------------------------------------------------------------------------
 * - Uses strict JSON schema enforcement to guarantee predictable output
 * - Separates concerns:
 *     prompt building → prompt.ts
 *     retrieval → rag.ts
 *     LLM execution → this file
 * - Supports iterative refinement via the "refinement" field
 * - Easily extendable for:
 *     - streaming responses
 *     - tool calling
 *     - multi-step agents
 *
 * =============================================================================
 */

import {
  buildPrompt,
  serializeBudgetBreakdown,
  WEDDING_SYSTEM_PROMPT,
} from "./prompt";
import { GenerateRequest, StructuredResponse, RagDebugInfo } from "./types";
import OpenAI from "openai";
import {
  calculateScenarioAdjustments,
  calculateWeddingBudget,
} from "./wedding-calculator";
import { retrievePlanningContext } from "./wedding-retrieval";

const MODEL = process.env.OPENAI_MODEL || "gpt-4";

const structuredSchema = {
  name: "StructuredResponse",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      budgetBreakdown: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            allocation: { type: "number" },
            estimatedRange: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["category", "allocation", "estimatedRange", "rationale"],
        },
      },
      vendorSuggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            name: { type: "string" },
            region: { type: "string" },
            priceEstimate: { type: "string" },
            whyItFits: { type: "string" },
          },
          required: [
            "category",
            "name",
            "region",
            "priceEstimate",
            "whyItFits",
          ],
        },
      },
      tradeoffs: { type: "array", items: { type: "string" } },
      savingsOptions: { type: "array", items: { type: "string" } },
      nextSteps: { type: "array", items: { type: "string" } },
      citations: { type: "array", items: { type: "string" } },
    },
    required: [
      "summary",
      "budgetBreakdown",
      "vendorSuggestions",
      "tradeoffs",
      "savingsOptions",
      "nextSteps",
      "citations",
    ],
  },
} as const;

function fallbackResponse(
  input: GenerateRequest,
  budgetPlan = calculateWeddingBudget(input.profile),
  ragSources: string[] = [],
): StructuredResponse {
  return {
    summary: `Built a practical wedding planning baseline for ${input.profile.guestCount} guests on a $${input.profile.totalBudget.toLocaleString()} budget in ${input.profile.location || "your location"}.`,
    budgetBreakdown: budgetPlan.lineItems,
    vendorSuggestions: [],
    tradeoffs: [
      ...budgetPlan.tradeoffs,
      "Missing OPENAI_API_KEY: the app returned the deterministic planning fallback instead of a model-generated plan.",
    ],
    savingsOptions: budgetPlan.savingsOptions,
    nextSteps: [
      "Confirm your must-keep priorities before contacting venues or caterers.",
      "Compare your guest count against your target budget per guest.",
      "Shortlist two or three affordable venue formats before requesting quotes.",
    ],
    citations: ragSources,
  };
}

// export async function generateStructuredResponse(
//   userId: string,
//   input: GenerateRequest,
// ): Promise<{ prompt: string; response: StructuredResponse }> {
//   const rag = input.options.citeSources
//     ? await retrieveContext(userId, `${input.task}\n${input.refinement || ""}`)
//     : [];
//   const prompt = `${buildPrompt(input)}\n\nRetrieved Context:\n${
//     rag.length
//       ? rag.map((r, i) => `[${i + 1}] ${r.source}: ${r.text}`).join("\n")
//       : "(none)"
//   }`;

function buildRetrievalQuery(input: GenerateRequest): string {
  return [
    `Base Task: ${input.task}`,
    `Revision Request: ${input.revisionRequest || "none"}`,
    `Has Previous Output: ${input.previousOutput ? "yes" : "no"}`,
    `Budget: ${input.profile.totalBudget}`,
    `Guest Count: ${input.profile.guestCount}`,
    `Location: ${input.profile.location || "none"}`,
    `Season: ${input.profile.season}`,
    `Priorities: ${input.profile.priorities.join(", ") || "none"}`,
    `Constraints: ${input.profile.constraints || "none"}`,
  ].join("\n");
}

export async function generateStructuredResponse(
  userId: string,
  input: GenerateRequest,
) {
  const retrievalQuery = buildRetrievalQuery(input);
  const budgetPlan = calculateWeddingBudget(input.profile);
  const cheaperScenario = calculateScenarioAdjustments(input.profile, undefined, 0.1);

  const retrieval = input.options.citeSources
    ? await retrievePlanningContext(userId, input.profile, retrievalQuery)
    : {
        vendorSuggestions: [],
        documentRetrieval: { snippets: [], reason: "ok" as const },
      };

  const rag = retrieval.documentRetrieval.snippets;
  const deterministicTradeoffText = [
    `Budget per guest: $${budgetPlan.budgetPerGuest}`,
    ...budgetPlan.tradeoffs,
    `If the budget needs to drop by 10%, the recalculated food/venue pressure is based on a total budget of $${cheaperScenario.totalBudget.toLocaleString()}.`,
    ...budgetPlan.savingsOptions,
  ].join("\n");

  const prompt = buildPrompt(input, {
    budgetBreakdownText: `${serializeBudgetBreakdown(
      budgetPlan.lineItems,
    )}\n${deterministicTradeoffText}`,
    vendorSuggestions: retrieval.vendorSuggestions,
    retrievedContextText: rag.length
      ? rag.map((r, i) => `[${i + 1}] ${r.source}: ${r.text}`).join("\n")
      : "(none)",
  });

  const debug: RagDebugInfo = {
    enabled: Boolean(input.options.ragDebug),
    retrievalRan: input.options.citeSources,
    reason: input.options.citeSources
      ? retrieval.documentRetrieval.reason
      : "citations-disabled",
    query: retrievalQuery,
    selected: rag.map((item) => ({ source: item.source, score: item.score })),
  };

  if (!process.env.OPENAI_API_KEY) {
    const response = fallbackResponse(
      input,
      budgetPlan,
      rag.map((r) => r.source),
    );
    response.vendorSuggestions = retrieval.vendorSuggestions;
    return { prompt, response, debug };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: WEDDING_SYSTEM_PROMPT,
      },
      { role: "user", content: prompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: structuredSchema.name,
        schema: structuredSchema.schema,
        strict: true,
      },
    },
  });

  const raw = completion.output_text || "{}";
  const response = JSON.parse(raw) as StructuredResponse;

  response.citations = response.citations || [];
  response.budgetBreakdown =
    response.budgetBreakdown?.length > 0
      ? response.budgetBreakdown
      : budgetPlan.lineItems;
  response.vendorSuggestions =
    response.vendorSuggestions?.length > 0
      ? response.vendorSuggestions
      : retrieval.vendorSuggestions;

  if (input.options.citeSources) {
    response.citations = rag.map((r, idx) => `[${idx + 1}] ${r.source}`);
  }

  return { prompt, response, debug };
}

/* deprecated heuristic generator for testing without API access
function heuristicGenerate(input: GenerateRequest): StructuredResponse {
  const needsClarification =
    !input.task.toLowerCase().includes("for") &&
    input.task.split(" ").length < 5;

  const summary = needsClarification
    ? "I can help, but I need one key detail before producing a high-confidence recommendation."
    : `Prepared a ${input.options.reportType} response tailored for ${input.profile.roleIndustry || "your context"}.`;

  const assumptions = [
    `Primary goal: ${input.profile.goals || "not provided"}`,
    `Tone: ${input.profile.tone || "professional"}`,
    `Constraints respected: ${input.profile.constraints || "none stated"}`,
  ];

  const recommendation = needsClarification
    ? "Please clarify target audience, timeline, and success criteria."
    : `Use a ${input.profile.preferredFormat} style output with emphasis on ${input.options.reportType}.`;

  const steps = [
    "Confirm objective and audience.",
    "Draft response with profile constraints and tone.",
    "Review for clarity, risks, and execution feasibility.",
    "Iterate with follow-up refinement instructions.",
  ];

  const risks = [
    "Insufficient task context may reduce answer precision.",
    "Unclear budget/time constraints can lead to impractical recommendations.",
    "No source retrieval configured for external fact validation.",
  ];

  return {
    summary,
    assumptions,
    recommendation,
    steps,
    risks,
    citations: input.options.citeSources
      ? ["No RAG source connected yet."]
      : undefined,
  };
}
*/
