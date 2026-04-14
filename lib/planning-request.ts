import { WeddingProfile } from "./types";
import { formatPriorityLabel, isWeddingProfileComplete } from "./wedding-profile";

export const DEFAULT_PLANNING_REQUEST =
  "Build a practical wedding plan for our budget and guest count.";

function clean(value: string | undefined) {
  return String(value || "").trim();
}

function formatList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatAlcohol(value: WeddingProfile["alcoholAllowed"]) {
  if (value === "yes") return "Serve alcohol";
  if (value === "no") return "No alcohol";
  if (value === "maybe") return "Alcohol is undecided";
  return "";
}

function formatDiy(value: string) {
  if (value === "none") return "No DIY";
  if (value === "some") return "Open to some DIY";
  if (value === "high") return "Open to a lot of DIY";
  return clean(value) ? `DIY preference: ${clean(value)}` : "";
}

export function buildPlanningRequest(profile?: WeddingProfile | null) {
  if (!profile || !isWeddingProfileComplete(profile)) {
    return DEFAULT_PLANNING_REQUEST;
  }

  const couple = clean(profile.partnerNames);
  const location = clean(profile.location);
  const targetDate = clean(profile.targetDate);
  const timing = [profile.season && profile.season !== "flexible" ? profile.season : "", targetDate]
    .filter(Boolean)
    .join(" ");

  const openingDetails = [
    profile.guestCount > 0 ? `for ~${profile.guestCount} guests` : "",
    location ? `in ${location}` : "",
    timing ? `around ${timing}` : profile.season === "flexible" ? "with flexible timing" : "",
    profile.totalBudget > 0
      ? `on a $${profile.totalBudget.toLocaleString()} budget`
      : "",
  ].filter(Boolean);

  const sentences = [
    `Build a practical full-plan wedding${couple ? ` for ${couple}` : ""}${
      openingDetails.length ? ` ${openingDetails.join(", ")}` : ""
    }.`,
  ];

  const preferenceDetails = [
    profile.priorities.length
      ? `Prioritize ${formatList(profile.priorities.map(formatPriorityLabel))}`
      : "",
    clean(profile.style) ? `${clean(profile.style)} style` : "",
    formatAlcohol(profile.alcoholAllowed),
    formatDiy(profile.diyWillingness),
  ].filter(Boolean);

  if (preferenceDetails.length) {
    sentences.push(`${preferenceDetails.join("; ")}.`);
  }

  const logisticsDetails = [
    clean(profile.ceremonyType),
    clean(profile.cateringPreference) ? `${clean(profile.cateringPreference)} catering` : "",
    clean(profile.constraints) ? `Constraints: ${clean(profile.constraints)}` : "",
  ].filter(Boolean);

  if (logisticsDetails.length) {
    sentences.push(logisticsDetails.join("; ") + ".");
  }

  return sentences.join(" ").replace(/\s+/g, " ").trim();
}
