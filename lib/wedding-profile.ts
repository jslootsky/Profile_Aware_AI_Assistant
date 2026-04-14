import { SurveyQuestion, WeddingProfile, WeddingPriority } from "./types";

export const DEFAULT_WEDDING_PROFILE: WeddingProfile = {
  partnerNames: "",
  totalBudget: 0,
  guestCount: 0,
  location: "",
  avatarUrl: "",
  season: "",
  targetDate: "",
  priorities: [],
  alcoholAllowed: "",
  diyWillingness: "",
  style: "",
  constraints: "",
  ceremonyType: "",
  cateringPreference: "",
  customBudgetSections: [],
  surveyStep: 0,
  onboardingComplete: false,
};

const REQUIRED_FIELDS: Array<keyof WeddingProfile> = [
  "totalBudget",
  "guestCount",
  "location",
  "season",
  "priorities",
  "style",
];

export function mergeWeddingProfile(
  incoming?: Partial<WeddingProfile> | null,
): WeddingProfile {
  return {
    ...DEFAULT_WEDDING_PROFILE,
    ...(incoming || {}),
    avatarUrl: typeof incoming?.avatarUrl === "string" ? incoming.avatarUrl : "",
    priorities: Array.isArray(incoming?.priorities)
      ? incoming.priorities
      : DEFAULT_WEDDING_PROFILE.priorities,
    customBudgetSections: Array.isArray(incoming?.customBudgetSections)
      ? incoming.customBudgetSections
          .map((section) => ({
            category: String(section?.category || "").trim(),
            allocation: Math.max(0, Math.round(Number(section?.allocation || 0))),
            rationale:
              typeof section?.rationale === "string"
                ? section.rationale
                : "Custom budget section added by the user.",
          }))
          .filter((section) => section.category && section.allocation >= 0)
      : DEFAULT_WEDDING_PROFILE.customBudgetSections,
    totalBudget: Number(incoming?.totalBudget || DEFAULT_WEDDING_PROFILE.totalBudget),
    guestCount: Number(incoming?.guestCount || DEFAULT_WEDDING_PROFILE.guestCount),
    onboardingComplete: Boolean(incoming?.onboardingComplete),
  };
}

export function isWeddingProfileComplete(profile: WeddingProfile) {
  return REQUIRED_FIELDS.every((field) => {
    const value = profile[field];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "number") {
      return value > 0;
    }
    return String(value || "").trim().length > 0;
  });
}

export function formatPriorityLabel(priority: WeddingPriority) {
  return priority.replace(/-/g, " ");
}

export function normalizeWeddingProfile(
  raw: Partial<WeddingProfile>,
  schema: SurveyQuestion[],
) {
  const next = mergeWeddingProfile(raw);

  for (const question of schema) {
    const value = raw[question.id];
    if (question.type === "number") {
      next[question.id] = Number(value || 0) as never;
    }
    if (question.type === "boolean") {
      next[question.id] = ((value as string) || "no") as never;
    }
  }

  next.onboardingComplete = isWeddingProfileComplete(next);
  return next;
}
