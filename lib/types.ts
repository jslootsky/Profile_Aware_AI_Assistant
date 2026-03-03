export type PreferredFormat = "bullets" | "report" | "table";

export interface UserProfile {
  roleIndustry: string;
  goals: string;
  tone: string;
  constraints: string;
  preferredFormat: PreferredFormat;
  dos: string;
  donts: string;
}

export interface RequestOptions {
  verbosity: "low" | "medium" | "high";
  reportType: "general" | "comparison" | "action-plan";
  citeSources: boolean;
}

export interface GenerateRequest {
  profile: UserProfile;
  task: string;
  refinement?: string;
  options: RequestOptions;
  history: string[];
}

export interface StructuredResponse {
  summary: string;
  assumptions: string[];
  recommendation: string;
  steps: string[];
  risks: string[];
  citations?: string[];
}

export interface StoredUser {
  id: string;
  createdAt: string;
}

export interface StoredSessionOutput {
  id: string;
  userId: string;
  task: string;
  refinement?: string;
  report: StructuredResponse;
  rating?: "up" | "down";
  feedback?: string;
  createdAt: string;
}

export interface KnowledgeDocument {
  id: string;
  userId: string;
  source: string;
  content: string;
  embedding?: number[];
  createdAt: string;
}

export interface AnalyticsSummary {
  totalGenerations: number;
  positiveRatings: number;
  negativeRatings: number;
  citationUsageRate: number;
}
