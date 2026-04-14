import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanningRequest,
  DEFAULT_PLANNING_REQUEST,
} from "../lib/planning-request";
import { mergeWeddingProfile } from "../lib/wedding-profile";

test("buildPlanningRequest summarizes a complete profile in plain English", () => {
  const profile = mergeWeddingProfile({
    partnerNames: "Alex & Jordan",
    totalBudget: 28000,
    guestCount: 120,
    location: "Portland, OR",
    season: "summer",
    targetDate: "late summer 2025",
    priorities: ["food", "decor", "low-stress"],
    alcoholAllowed: "no",
    diyWillingness: "some",
    style: "garden",
    ceremonyType: "Outdoor ceremony",
    cateringPreference: "plated dinner",
    constraints: "Minimal florals",
    onboardingComplete: true,
  });

  const request = buildPlanningRequest(profile);

  assert.match(request, /Alex & Jordan/);
  assert.match(request, /~120 guests/);
  assert.match(request, /Portland, OR/);
  assert.match(request, /\$28,000 budget/);
  assert.match(request, /Prioritize food, decor, and low stress/);
  assert.match(request, /No alcohol/);
  assert.match(request, /Open to some DIY/);
  assert.match(request, /garden style/);
  assert.match(request, /Outdoor ceremony/);
  assert.match(request, /plated dinner catering/);
  assert.match(request, /Constraints: Minimal florals/);
  assert.ok(request.split(".").filter((sentence) => sentence.trim()).length <= 3);
});

test("buildPlanningRequest falls back for incomplete profiles", () => {
  const profile = mergeWeddingProfile({
    totalBudget: 28000,
    guestCount: 120,
  });

  assert.equal(buildPlanningRequest(profile), DEFAULT_PLANNING_REQUEST);
  assert.equal(buildPlanningRequest(null), DEFAULT_PLANNING_REQUEST);
});
