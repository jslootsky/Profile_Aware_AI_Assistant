import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateScenarioAdjustments,
  calculateWeddingBudget,
} from "../lib/wedding-calculator";
import { mergeWeddingProfile } from "../lib/wedding-profile";

test("calculator increases food protection when food is a priority", () => {
  const profile = mergeWeddingProfile({
    totalBudget: 15000,
    guestCount: 90,
    location: "Austin, TX",
    priorities: ["food", "guest-experience"],
    onboardingComplete: true,
  });

  const result = calculateWeddingBudget(profile);
  const food = result.lineItems.find((item) => item.category === "Food & Non-Alcoholic Drinks");
  const decor = result.lineItems.find((item) => item.category === "Decor / Florals");

  assert.ok(food);
  assert.ok(decor);
  assert.ok(food.allocation > decor.allocation);
});

test("scenario adjustment reflects cheaper plan request", () => {
  const profile = mergeWeddingProfile({
    totalBudget: 20000,
    guestCount: 80,
    location: "Chicago, IL",
    priorities: ["venue", "food"],
    onboardingComplete: true,
  });

  const result = calculateScenarioAdjustments(profile, undefined, 0.1);

  assert.equal(result.totalBudget, 18000);
  assert.equal(result.guestCount, 80);
});

test("scenario adjustment supports guest count increase", () => {
  const profile = mergeWeddingProfile({
    totalBudget: 12000,
    guestCount: 60,
    location: "Phoenix, AZ",
    priorities: ["food"],
    onboardingComplete: true,
  });

  const result = calculateScenarioAdjustments(profile, 120, 0);

  assert.equal(result.guestCount, 120);
  assert.ok(
    result.tradeoffs.some((item) => item.toLowerCase().includes("guest count")),
  );
});
