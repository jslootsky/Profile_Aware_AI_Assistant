export interface RetrievedSnippet {
  source: string;
  text: string;
}

export async function retrieveContext(_query: string): Promise<RetrievedSnippet[]> {
  // Placeholder for future vector search integration.
  return [];
}
