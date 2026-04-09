export type WeddingSeason = "spring" | "summer" | "fall" | "winter" | "flexible";
export type WeddingStyle =
  | "classic"
  | "garden"
  | "modern"
  | "rustic"
  | "minimal"
  | "cultural-traditional"
  | "casual";
export type AlcoholPreference = "yes" | "no" | "maybe";
export type DiyLevel = "none" | "some" | "high";
export type WeddingPriority =
  | "food"
  | "venue"
  | "photo-video"
  | "music"
  | "decor"
  | "attire"
  | "guest-experience"
  | "low-stress";

export type SurveyFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "boolean";

export interface SurveyOption {
  label: string;
  value: string;
}

export interface SurveyQuestion {
  id: keyof WeddingProfile;
  label: string;
  type: SurveyFieldType;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  options?: SurveyOption[];
}

export interface WeddingProfile {
  partnerNames: string;
  totalBudget: number;
  guestCount: number;
  location: string;
  season: WeddingSeason;
  targetDate: string;
  priorities: WeddingPriority[];
  alcoholAllowed: AlcoholPreference;
  diyWillingness: DiyLevel;
  style: WeddingStyle;
  constraints: string;
  ceremonyType: string;
  cateringPreference: string;
  surveyStep: number;
  onboardingComplete: boolean;
}

export interface RequestOptions {
  verbosity: "low" | "medium" | "high";
  reportType: "full-plan" | "budget-revision" | "vendor-shortlist";
  citeSources: boolean;
  ragDebug?: boolean;
}

export interface RagDebugInfo {
  enabled: boolean;
  retrievalRan: boolean;
  reason:
    | "citations-disabled"
    | "missing-openai-key"
    | "no-docs"
    | "no-embeddings"
    | "ok";
  query: string;
  selected: Array<{ source: string; score: number }>;
}

export interface GenerateRequest {
  profile: WeddingProfile;
  task: string;
  refinement?: string;
  options: RequestOptions;
  history: string[];
}

export interface BudgetLineItem {
  category: string;
  allocation: number;
  estimatedRange: string;
  rationale: string;
}

export interface VendorSuggestion {
  category: string;
  name: string;
  region: string;
  priceEstimate: string;
  whyItFits: string;
}

export interface StructuredResponse {
  summary: string;
  budgetBreakdown: BudgetLineItem[];
  vendorSuggestions: VendorSuggestion[];
  tradeoffs: string[];
  savingsOptions: string[];
  nextSteps: string[];
  citations: string[];
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

export interface WeddingCostPlan {
  totalBudget: number;
  guestCount: number;
  budgetPerGuest: number;
  lineItems: BudgetLineItem[];
  tradeoffs: string[];
  savingsOptions: string[];
}

export interface VendorKnowledgeItem {
  id: string;
  category: string;
  name: string;
  region: string;
  priceTier: "low" | "medium" | "high";
  estimatedCost: string;
  guestCapacity?: string;
  styleTags: string[];
  notes: string;
  alcoholSupport?: string;
}
