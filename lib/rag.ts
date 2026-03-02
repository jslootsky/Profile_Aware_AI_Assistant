export interface RetrievedSnippet {
  source: string;
  text: string;
}

export async function retrieveContext(
  userId: string,
  query: string,
  topK = 3,
): Promise<RetrievedSnippet[]> {
  // Placeholder for future vector search integration.
  return [];
}
