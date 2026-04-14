import { VendorSuggestion, WeddingProfile } from "./types";
import { retrieveContextDetailed, RetrievalResult } from "./rag";
import type { SupabaseClient } from "@supabase/supabase-js";

type VendorCategoryRule = {
  category: string;
  keywords: string[];
};

const VENDOR_CATEGORY_RULES: VendorCategoryRule[] = [
  { category: "Venue", keywords: ["venue", "church", "reception", "ceremony site", "hall"] },
  { category: "Photographer", keywords: ["photographer", "photography", "photo"] },
  { category: "Videographer", keywords: ["videographer", "videography", "video"] },
  { category: "Catering", keywords: ["caterer", "catering", "buffet", "food"] },
  { category: "Coordinator", keywords: ["coordinator", "coordination", "planner", "day-of"] },
  { category: "Music / DJ", keywords: ["dj", "music", "band", "musician"] },
  { category: "Florals / Decor", keywords: ["florist", "florals", "flowers", "decor", "centerpiece"] },
  { category: "Wedding Dress", keywords: ["dress", "gown", "bridal boutique"] },
  { category: "Wedding Suit", keywords: ["suit", "tux", "tuxedo", "menswear"] },
  { category: "Hair / Makeup / Beauty", keywords: ["hair", "makeup", "beauty", "mua"] },
  { category: "Dessert / Cake", keywords: ["cake", "dessert", "bakery"] },
  { category: "Rentals", keywords: ["rental", "rentals", "chairs", "tables", "linens"] },
];

const CONTRACTED_TERMS = [
  "contracted",
  "booked",
  "hired",
  "signed",
  "reserved",
  "secured",
  "deposit paid",
  "paid deposit",
  "given to us for free",
  "for free by",
  "will be located",
];

function inferCategories(text: string) {
  const lower = text.toLowerCase();
  return VENDOR_CATEGORY_RULES.filter((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword)),
  ).map((rule) => rule.category);
}

function inferStatus(text: string): VendorSuggestion["status"] {
  const lower = text.toLowerCase();
  if (
    lower.includes("not_contracted") ||
    lower.includes("not contracted") ||
    lower.includes("needs contract")
  ) {
    return "not_contracted";
  }
  return CONTRACTED_TERMS.some((term) => lower.includes(term))
    ? "contracted"
    : "not_contracted";
}

function inferPrice(text: string) {
  const price = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
  if (price) return price[0].replace(/\s+/g, "");
  if (/\bfree\b|\bno cost\b|\$0\b/i.test(text)) return "$0";
  return "not provided";
}

function inferName(source: string, text: string, category: string) {
  const handle = text.match(/@[a-z0-9._-]+/i);
  if (handle) return handle[0];

  const namedVendor = text.match(
    /\b(?:vendor|venue|photographer|videographer|caterer|coordinator|dj|florist|bakery|boutique)\s*:\s*([^.;\n]+)/i,
  );
  if (namedVendor?.[1]) return namedVendor[1].trim();

  if (category === "Venue" && /\bchurch\b/i.test(text)) return "Church venue";

  return source.trim() || "Vendor from retrieved note";
}

function buildVendorTracker(
  profile: WeddingProfile,
  snippets: RetrievalResult["snippets"],
): VendorSuggestion[] {
  const byCategory = new Map<string, VendorSuggestion>();

  for (const snippet of snippets) {
    const text = `${snippet.source}\n${snippet.text}`;
    const categories = inferCategories(text);

    for (const category of categories) {
      const candidate: VendorSuggestion = {
        category,
        name: inferName(snippet.source, snippet.text, category),
        region: profile.location || "not provided",
        priceEstimate: inferPrice(snippet.text),
        status: inferStatus(snippet.text),
        source: snippet.source,
        whyItFits:
          inferStatus(snippet.text) === "contracted"
            ? "Retrieved notes indicate this vendor or venue is already secured."
            : "Retrieved notes mention this vendor, quote, or category, but do not show it as contracted.",
      };

      const existing = byCategory.get(category);
      if (!existing || (existing.status !== "contracted" && candidate.status === "contracted")) {
        byCategory.set(category, candidate);
      }
    }
  }

  for (const rule of VENDOR_CATEGORY_RULES) {
    if (byCategory.has(rule.category)) continue;
    byCategory.set(rule.category, {
      category: rule.category,
      name: "TBD",
      region: profile.location || "not provided",
      priceEstimate: "not provided",
      status: "not_contracted",
      source: "No retrieved note",
      whyItFits: "No retrieved note currently identifies a contracted vendor for this category.",
    });
  }

  return Array.from(byCategory.values());
}

export async function retrievePlanningContext(
  userId: string,
  profile: WeddingProfile,
  query: string,
  supabaseClient?: SupabaseClient,
): Promise<{
  vendorSuggestions: VendorSuggestion[];
  documentRetrieval: RetrievalResult;
}> {
  void profile;
  const documentRetrieval = await retrieveContextDetailed(userId, query, undefined, supabaseClient);

  return {
    vendorSuggestions: buildVendorTracker(profile, documentRetrieval.snippets),
    documentRetrieval,
  };
}
