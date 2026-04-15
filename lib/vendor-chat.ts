import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SavedVendor,
  StoredSessionOutput,
  VendorChatMessage,
  VendorChatOption,
  WeddingProfile,
} from "./types";
import { retrievePlanningContext } from "./wedding-retrieval";
import { VENDOR_CHAT_INITIAL_MESSAGE } from "./vendor-chat-shared";

const VENDOR_CHAT_MODEL =
  process.env.OPENAI_VENDOR_CHAT_MODEL || "gpt-4.1-mini";

const vendorChatSchema = {
  name: "VendorChatResponse",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      message: { type: "string" },
      vendors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            region: { type: "string" },
            websiteUrl: { type: "string" },
            description: { type: "string" },
            source: { type: "string" },
          },
          required: [
            "name",
            "category",
            "region",
            "websiteUrl",
            "description",
            "source",
          ],
        },
      },
    },
    required: ["message", "vendors"],
  },
} as const;

function summarizePlan(plan: StoredSessionOutput | null) {
  if (!plan) return "No saved plan is available yet.";
  return JSON.stringify(
    {
      baseTask: plan.baseTask,
      revisionRequest: plan.revisionRequest,
      summary: plan.currentOutput.summary,
      budgetBreakdown: plan.currentOutput.budgetBreakdown,
      vendorSuggestions: plan.currentOutput.vendorSuggestions,
      nextSteps: plan.currentOutput.nextSteps,
      createdAt: plan.createdAt,
    },
    null,
    2,
  );
}

function summarizeSavedVendors(vendors: SavedVendor[]) {
  if (!vendors.length) return "No vendors have been starred yet.";
  return vendors
    .map(
      (vendor) =>
        `- ${vendor.name} (${vendor.category}, ${vendor.region}): ${vendor.websiteUrl}`,
    )
    .join("\n");
}

function normalizeVendor(vendor: VendorChatOption): VendorChatOption | null {
  const websiteUrl = String(vendor.websiteUrl || "").trim();
  if (!/^https?:\/\//i.test(websiteUrl)) return null;

  return {
    name: String(vendor.name || "").trim(),
    category: String(vendor.category || "").trim(),
    region: String(vendor.region || "").trim(),
    websiteUrl,
    description: String(vendor.description || "").trim(),
    source: String(vendor.source || websiteUrl).trim(),
  };
}

export async function generateVendorChatResponse({
  userId,
  profile,
  latestPlan,
  savedVendors,
  messages,
  supabaseClient,
}: {
  userId: string;
  profile: WeddingProfile;
  latestPlan: StoredSessionOutput | null;
  savedVendors: SavedVendor[];
  messages: VendorChatMessage[];
  supabaseClient?: SupabaseClient;
}) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ||
    "";

  const retrieval = await retrievePlanningContext(
    userId,
    profile,
    latestUserMessage,
    supabaseClient,
  );

  const context = [
    `Initial chatbot message shown to the user and treated as context:\n${VENDOR_CHAT_INITIAL_MESSAGE}`,
    `Wedding survey profile:\n${JSON.stringify(profile, null, 2)}`,
    `Latest saved plan:\n${summarizePlan(latestPlan)}`,
    `Already starred vendors:\n${summarizeSavedVendors(savedVendors)}`,
    `Retrieved planning notes:\n${
      retrieval.documentRetrieval.snippets.length
        ? retrieval.documentRetrieval.snippets
            .map((snippet, index) => `[${index + 1}] ${snippet.source}: ${snippet.text}`)
            .join("\n")
        : "(none)"
    }`,
  ].join("\n\n");

  if (!process.env.OPENAI_API_KEY) {
    return {
      message:
        "Vendor chat needs OPENAI_API_KEY to search the web for current public vendor websites. Your saved plan and profile are available, but I will not invent vendor options without live search.",
      vendors: [],
      context,
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: VENDOR_CHAT_MODEL,
    tools: [{ type: "web_search" }] as OpenAI.Responses.ResponseCreateParams["tools"],
    input: [
      {
        role: "system",
        content:
          "You are a wedding vendor research assistant. Use the supplied profile, saved plan, saved vendors, and retrieved notes as context. For vendor discovery, use web search and return only vendors with public website URLs. Do not invent vendors, pricing, availability, or reviews. Prefer vendors near the user's wedding location. Keep the message concise and helpful.",
      },
      {
        role: "user",
        content: `${context}\n\nConversation:\n${messages
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n")}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: vendorChatSchema.name,
        schema: vendorChatSchema.schema,
        strict: true,
      },
    },
  });

  const parsed = JSON.parse(response.output_text || "{}") as {
    message?: string;
    vendors?: VendorChatOption[];
  };

  return {
    message: parsed.message || "I could not find matching public vendor options.",
    vendors: (parsed.vendors || [])
      .map(normalizeVendor)
      .filter((vendor): vendor is VendorChatOption => Boolean(vendor))
      .slice(0, 5),
    context,
  };
}
