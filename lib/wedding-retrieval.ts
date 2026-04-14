import { VendorSuggestion, WeddingProfile } from "./types";
import { retrieveContextDetailed, RetrievalResult } from "./rag";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    vendorSuggestions: [],
    documentRetrieval,
  };
}
