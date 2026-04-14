import { VendorSuggestion, WeddingProfile } from "./types";
import { retrieveContextDetailed, RetrievalResult } from "./rag";

export async function retrievePlanningContext(
  userId: string,
  profile: WeddingProfile,
  query: string,
): Promise<{
  vendorSuggestions: VendorSuggestion[];
  documentRetrieval: RetrievalResult;
}> {
  void profile;
  const documentRetrieval = await retrieveContextDetailed(userId, query);

  return {
    vendorSuggestions: [],
    documentRetrieval,
  };
}
