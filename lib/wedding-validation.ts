import { GenerateRequest, WeddingProfile } from "./types";
import { weddingSurveySchema } from "./wedding-survey-schema";
import { mergeWeddingProfile } from "./wedding-profile";

function isNonEmptyString(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim() !== "__custom__"
  );
}

function shouldValidateNumberMin(value: number, allowIncomplete: boolean) {
  if (!allowIncomplete) {
    return true;
  }

  return value !== 0;
}

export function validateWeddingProfile(
  input: Partial<WeddingProfile>,
  options?: { allowIncomplete?: boolean },
) {
  const errors: string[] = [];
  const normalized = mergeWeddingProfile(input);
  const allowIncomplete = Boolean(options?.allowIncomplete);

  for (const question of weddingSurveySchema) {
    const value = normalized[question.id];
    if (!question.required || allowIncomplete) continue;

    if (question.type === "multiselect" && (!Array.isArray(value) || value.length === 0)) {
      errors.push(`${question.label} is required.`);
    } else if (question.type === "number" && !(typeof value === "number" && value > 0)) {
      errors.push(`${question.label} must be greater than zero.`);
    } else if (
      question.type !== "multiselect" &&
      question.type !== "number" &&
      !isNonEmptyString(value)
    ) {
      errors.push(`${question.label} is required.`);
    }
  }

  if (
    shouldValidateNumberMin(normalized.totalBudget, allowIncomplete) &&
    normalized.totalBudget < 1000
  ) {
    errors.push("Budget must be at least $1,000.");
  }
  if (
    shouldValidateNumberMin(normalized.guestCount, allowIncomplete) &&
    normalized.guestCount < 10
  ) {
    errors.push("Guest count must be at least 10.");
  }
  if (normalized.surveyStep < 0 || normalized.surveyStep > weddingSurveySchema.length - 1) {
    errors.push("Survey step is out of range.");
  }

  return {
    valid: errors.length === 0,
    errors,
    profile: normalized,
  };
}

export function validateGenerateRequest(input: Partial<GenerateRequest>) {
  const errors: string[] = [];
  if (!isNonEmptyString(input.task)) {
    errors.push("Task is required.");
  }
  if (input.threadId && !input.previousOutput) {
    errors.push("Previous output is required for revisions.");
  }
  if (input.previousOutput && !isNonEmptyString(input.revisionRequest)) {
    errors.push("Revision request is required for revisions.");
  }

  const profileValidation = validateWeddingProfile(input.profile || {}, {
    allowIncomplete: false,
  });
  errors.push(...profileValidation.errors);

  return {
    valid: errors.length === 0,
    errors,
    profileValidation,
  };
}
