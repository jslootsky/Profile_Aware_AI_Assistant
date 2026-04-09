import { weddingKnowledgeBase } from "@/data/wedding-knowledge";
import {
  VendorKnowledgeItem,
  VendorSuggestion,
  WeddingProfile,
} from "./types";
import { retrieveContextDetailed, RetrievalResult } from "./rag";

function scoreKnowledgeItem(
  item: VendorKnowledgeItem,
  profile: WeddingProfile,
  query: string,
) {
  let score = 0;
  const combined = `${query} ${profile.location} ${profile.style} ${profile.priorities.join(" ")}`.toLowerCase();

  if (
    item.region === "nationwide" ||
    combined.includes(item.region.toLowerCase())
  ) {
    score += 2;
  }

  if (item.styleTags.includes(profile.style)) {
    score += 3;
  }

  for (const priority of profile.priorities) {
    if (item.category.includes(priority.split("-")[0])) {
      score += 2;
    }
  }

  if (profile.alcoholAllowed === "no" && item.alcoholSupport?.includes("restricted")) {
    score += 2;
  }

  if (profile.totalBudget / Math.max(profile.guestCount, 1) < 120) {
    if (item.priceTier === "low") score += 3;
    if (item.priceTier === "medium") score += 1;
  }

  if (combined.includes(item.category.toLowerCase())) {
    score += 3;
  }

  return score;
}

export function retrieveWeddingKnowledge(
  profile: WeddingProfile,
  query: string,
  limit = 4,
): VendorSuggestion[] {
  return weddingKnowledgeBase
    .map((item) => ({
      item,
      score: scoreKnowledgeItem(item, profile, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => ({
      category: item.category,
      name: item.name,
      region: item.region,
      priceEstimate: item.estimatedCost,
      whyItFits: item.notes,
    }));
}

export async function retrievePlanningContext(
  userId: string,
  profile: WeddingProfile,
  query: string,
): Promise<{
  vendorSuggestions: VendorSuggestion[];
  documentRetrieval: RetrievalResult;
}> {
  const vendorSuggestions = retrieveWeddingKnowledge(profile, query);
  const documentRetrieval = await retrieveContextDetailed(userId, query);

  return {
    vendorSuggestions,
    documentRetrieval,
  };
}
