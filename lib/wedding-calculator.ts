import {
  BudgetLineItem,
  WeddingCostPlan,
  WeddingPriority,
  WeddingProfile,
} from "./types";

type AllocationRule = {
  key: string;
  label: string;
  basePct: number;
  minPct: number;
  maxPct: number;
};

const CATEGORY_RULES: AllocationRule[] = [
  { key: "venue", label: "Venue", basePct: 0.22, minPct: 0.12, maxPct: 0.3 },
  { key: "food", label: "Food & Non-Alcoholic Drinks", basePct: 0.27, minPct: 0.18, maxPct: 0.38 },
  { key: "alcohol", label: "Alcohol / Beverage Service", basePct: 0.08, minPct: 0, maxPct: 0.12 },
  { key: "photo", label: "Photography / Video", basePct: 0.12, minPct: 0.08, maxPct: 0.18 },
  { key: "music", label: "Music / DJ", basePct: 0.08, minPct: 0.04, maxPct: 0.12 },
  { key: "florals", label: "Decor / Florals", basePct: 0.08, minPct: 0.03, maxPct: 0.15 },
  { key: "attire", label: "Attire / Beauty", basePct: 0.08, minPct: 0.04, maxPct: 0.14 },
  { key: "coordination", label: "Coordination / Misc", basePct: 0.07, minPct: 0.04, maxPct: 0.12 },
];

const PRIORITY_BUMPS: Record<WeddingPriority, Partial<Record<string, number>>> = {
  food: { food: 0.05, florals: -0.02, attire: -0.01 },
  venue: { venue: 0.05, florals: -0.02, coordination: -0.01 },
  "photo-video": { photo: 0.04, florals: -0.02, music: -0.01 },
  music: { music: 0.03, florals: -0.02 },
  decor: { florals: 0.04, attire: -0.01, music: -0.01 },
  attire: { attire: 0.03, florals: -0.02 },
  "guest-experience": { food: 0.03, venue: 0.02, florals: -0.02 },
  "low-stress": { coordination: 0.03, florals: -0.01, diy: -0.02 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function adjustForProfile(profile: WeddingProfile) {
  const weights = Object.fromEntries(
    CATEGORY_RULES.map((rule) => [rule.key, rule.basePct]),
  ) as Record<string, number>;

  if (profile.alcoholAllowed === "no") {
    weights.alcohol = 0;
    weights.food += 0.03;
    weights.venue += 0.01;
  } else if (profile.alcoholAllowed === "maybe") {
    weights.alcohol -= 0.03;
    weights.food += 0.02;
  }

  if (profile.diyWillingness === "high") {
    weights.florals -= 0.03;
    weights.coordination -= 0.01;
  } else if (profile.diyWillingness === "none") {
    weights.coordination += 0.02;
  }

  for (const priority of profile.priorities) {
    const bump = PRIORITY_BUMPS[priority];
    if (!bump) continue;
    for (const [category, delta] of Object.entries(bump)) {
      if (typeof weights[category] === "number" && typeof delta === "number") {
        weights[category] += delta;
      }
    }
  }

  for (const rule of CATEGORY_RULES) {
    weights[rule.key] = clamp(weights[rule.key], rule.minPct, rule.maxPct);
  }

  const total = CATEGORY_RULES.reduce((sum, rule) => sum + weights[rule.key], 0);
  for (const rule of CATEGORY_RULES) {
    weights[rule.key] = weights[rule.key] / total;
  }

  return weights;
}

function buildRationale(profile: WeddingProfile, categoryKey: string) {
  if (categoryKey === "food") {
    return profile.priorities.includes("food")
      ? "Protected because food is a stated priority and scales directly with guest count."
      : "Scaled to cover guest-driven meal costs without overspending on upgrades.";
  }
  if (categoryKey === "venue") {
    return profile.priorities.includes("venue")
      ? "Held higher because venue is a stated priority and location affects cost sharply."
      : "Kept practical to avoid venue spend crowding out other essentials.";
  }
  if (categoryKey === "alcohol") {
    return profile.alcoholAllowed === "no"
      ? "Reduced to zero because alcohol is not planned."
      : "Adjusted based on alcohol preference and total budget pressure.";
  }
  if (categoryKey === "florals") {
    return profile.diyWillingness === "high"
      ? "Lower because DIY flexibility can replace paid decor."
      : "Moderate styling allocation without letting decor dominate the budget.";
  }
  return "Balanced against stated priorities and budget constraints.";
}

export function calculateWeddingBudget(profile: WeddingProfile): WeddingCostPlan {
  const weights = adjustForProfile(profile);
  const lineItems: BudgetLineItem[] = CATEGORY_RULES.map((rule) => {
    const allocation = Math.round(profile.totalBudget * weights[rule.key]);
    const rangeFloor = Math.round(allocation * 0.9);
    const rangeCeiling = Math.round(allocation * 1.1);
    return {
      category: rule.label,
      allocation,
      estimatedRange: `${formatCurrency(rangeFloor)}-${formatCurrency(rangeCeiling)}`,
      rationale: buildRationale(profile, rule.key),
    };
  });

  const budgetPerGuest = Math.round(profile.totalBudget / Math.max(profile.guestCount, 1));
  const tradeoffs: string[] = [];
  const savingsOptions: string[] = [];

  if (budgetPerGuest < 120) {
    tradeoffs.push(
      "Your budget per guest is tight, so a full-service venue or plated dinner will likely force cuts elsewhere.",
    );
    savingsOptions.push(
      "Consider a restaurant private room, community hall, brunch reception, or Sunday event to control venue and catering costs.",
    );
  }

  if (profile.guestCount > 100) {
    tradeoffs.push(
      "Guest count is the strongest cost driver. Adding guests increases food, rentals, staffing, and often venue cost at the same time.",
    );
    savingsOptions.push(
      "If you need to cut spend quickly, reducing the guest list by 10-20 people usually has more impact than trimming decor.",
    );
  }

  if (profile.priorities.includes("food") && !profile.priorities.includes("decor")) {
    tradeoffs.push(
      "Protecting food means decor and floral styling should stay simple unless budget grows.",
    );
  }

  if (profile.alcoholAllowed === "yes") {
    savingsOptions.push(
      "Beer and wine only, shorter bar service, or a consumption bar can preserve hospitality without a full open bar cost.",
    );
  }

  if (profile.diyWillingness !== "none") {
    savingsOptions.push(
      "DIY signage, simple centerpieces, and digital invitations are usually safer savings moves than cutting food or photography too deeply.",
    );
  }

  return {
    totalBudget: profile.totalBudget,
    guestCount: profile.guestCount,
    budgetPerGuest,
    lineItems,
    tradeoffs,
    savingsOptions,
  };
}

export function calculateScenarioAdjustments(
  profile: WeddingProfile,
  requestedGuestCount?: number,
  cheaperByPct = 0,
) {
  const nextGuestCount = requestedGuestCount ?? profile.guestCount;
  const nextBudget = Math.round(profile.totalBudget * (1 - cheaperByPct));
  return calculateWeddingBudget({
    ...profile,
    guestCount: nextGuestCount,
    totalBudget: nextBudget,
  });
}
