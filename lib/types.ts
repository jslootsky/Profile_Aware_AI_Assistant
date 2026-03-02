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
  task: string;
  refinement?: string;
  options: RequestOptions;
  history: string[];
}

export interface Citation {
  source: string;
  excerpt: string;
}

export interface StructuredResponse {
  summary: string;
  assumptions: string[];
  recommendation: string;
  steps: string[];
  risks: string[];
  citations?: Citation[];
}
