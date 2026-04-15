"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { GoogleSignInLanding } from "@/components/google-sign-in-landing";
import { UserMenu, type PlannerAuthUser } from "@/components/user-menu";
import {
  getSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase-browser";
import {
  GenerateRequest,
  BudgetLineItem,
  RagDebugInfo,
  RequestOptions,
  StoredSessionOutput,
  StructuredResponse,
  SurveyQuestion,
  VendorSuggestion,
  WeddingProfile,
} from "@/lib/types";
import { weddingSurveySchema } from "@/lib/wedding-survey-schema";
import {
  DEFAULT_WEDDING_PROFILE,
  formatPriorityLabel,
  isWeddingProfileComplete,
  mergeWeddingProfile,
} from "@/lib/wedding-profile";
import { calculateWeddingBudget } from "@/lib/wedding-calculator";
import { validateWeddingProfile } from "@/lib/wedding-validation";
import {
  buildPlanningRequest,
  DEFAULT_PLANNING_REQUEST,
} from "@/lib/planning-request";

interface KnowledgeDocView {
  id: string;
  source: string;
  content: string;
  createdAt: string;
  hasEmbedding: boolean;
}

const vendorCategories = [
  "Venue",
  "Photographer",
  "Videographer",
  "Catering",
  "Coordinator",
  "Music / DJ",
  "Florals / Decor",
  "Wedding Dress",
  "Wedding Suit",
  "Hair / Makeup / Beauty",
  "Dessert / Cake",
  "Rentals",
  "Other",
];

const emptyVendorDraft: VendorSuggestion = {
  category: "Other",
  name: "",
  region: "",
  priceEstimate: "",
  contact: "",
  status: "not_contracted",
  source: "Manual vendor tracker",
  whyItFits: "",
};

function formatCurrency(value: number) {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function getBudgetAmount(item: BudgetLineItem) {
  const values = item.estimatedRange.match(/\$?\s?\d[\d,]*/g);
  if (!values?.length) return Math.round(item.allocation || 0);
  const numericValues = values
    .map((value) => Number(value.replace(/[$,\s]/g, "")))
    .filter(Number.isFinite);
  return numericValues.length
    ? Math.max(...numericValues)
    : Math.round(item.allocation || 0);
}

function normalizeBudgetLineItem(item: BudgetLineItem): BudgetLineItem {
  const amount = getBudgetAmount(item);
  return {
    ...item,
    allocation: amount,
    estimatedRange: formatCurrency(amount),
  };
}

function normalizeStructuredResponse(response: StructuredResponse): StructuredResponse {
  return {
    ...response,
    budgetBreakdown: response.budgetBreakdown.map(normalizeBudgetLineItem),
    vendorSuggestions: response.vendorSuggestions.map((vendor) => ({
      ...vendor,
      status: vendor.status || "not_contracted",
      source: vendor.source || "Legacy planner output",
      contact: vendor.contact || "not provided",
    })),
  };
}

function isCustomBudgetItem(item: BudgetLineItem, profile: WeddingProfile) {
  return (profile.customBudgetSections || []).some(
    (section) => section.category === item.category,
  );
}

function formatVendorNote(vendor: VendorSuggestion) {
  return [
    `Category: ${vendor.category}`,
    `Vendor: ${vendor.name}`,
    `Region: ${vendor.region || "not provided"}`,
    `Price: ${vendor.priceEstimate || "not provided"}`,
    `Contact: ${vendor.contact || "not provided"}`,
    `Status: ${vendor.status}`,
    `Source: ${vendor.source || "Manual vendor tracker"}`,
    `Notes: ${vendor.whyItFits || "No additional notes."}`,
  ].join("\n");
}

const defaultOptions: RequestOptions = {
  verbosity: "high",
  reportType: "full-plan",
  citeSources: true,
  ragDebug: false,
};

function mapPlannerAuthUser(user: User): PlannerAuthUser {
  return {
    id: user.id,
    email: user.email,
    name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : undefined,
  };
}

export function WeddingPlannerApp() {
  const supabase = isSupabaseBrowserConfigured()
    ? getSupabaseBrowserClient()
    : null;

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<PlannerAuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [plannerDataReady, setPlannerDataReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  const [profile, setProfile] = useState<WeddingProfile>(DEFAULT_WEDDING_PROFILE);
  const [task, setTask] = useState("");
  const [revisionChange, setRevisionChange] = useState("");
  const [options, setOptions] = useState<RequestOptions>(defaultOptions);
  const [revisions, setRevisions] = useState<StoredSessionOutput[]>([]);
  const [savedRevisions, setSavedRevisions] = useState<StoredSessionOutput[]>([]);
  const [output, setOutput] = useState<StructuredResponse | null>(null);
  const [latestPrompt, setLatestPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ragDebug, setRagDebug] = useState<RagDebugInfo | null>(null);
  const [knowledgeSource, setKnowledgeSource] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocView[]>([]);
  const [deletedNote, setDeletedNote] = useState<KnowledgeDocView | null>(null);
  const [showDeleteToast, setShowDeleteToast] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<string | null>(null);
  const [vendorStatus, setVendorStatus] = useState<string | null>(null);
  const [customVendor, setCustomVendor] = useState<VendorSuggestion>(emptyVendorDraft);
  const [customBudgetCategory, setCustomBudgetCategory] = useState("");
  const [customBudgetAmount, setCustomBudgetAmount] = useState("");
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editingVendorIndex, setEditingVendorIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [isSavingSurvey, setIsSavingSurvey] = useState(false);
  const [isEditingSurvey, setIsEditingSurvey] = useState(false);
  const [showSurveySummary, setShowSurveySummary] = useState(false);
  const deleteToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskEditedRef = useRef(false);

  const currentStep = Math.min(profile.surveyStep, weddingSurveySchema.length - 1);
  const currentQuestion = weddingSurveySchema[currentStep];
  const isOnboardingComplete =
    isWeddingProfileComplete(profile) && profile.onboardingComplete;
  const isSurveyMode = !isOnboardingComplete || isEditingSurvey;
  const canJumpBetweenQuestions = isOnboardingComplete && isEditingSurvey;
  const budgetSnapshot = useMemo(() => calculateWeddingBudget(profile), [profile]);
  const planTotal = useMemo(
    () =>
      output?.budgetBreakdown.reduce((total, item) => total + getBudgetAmount(item), 0) ??
      0,
    [output],
  );
  const isPlanWithinBudget = planTotal <= profile.totalBudget;
  const revisionRequest = useMemo(
    () => revisionChange.trim(),
    [revisionChange],
  );
  const canSubmit = useMemo(
    () =>
      isOnboardingComplete &&
      (output ? revisionRequest.trim().length > 0 : task.trim().length > 0),
    [isOnboardingComplete, output, revisionRequest, task],
  );
  const latestSavedRevision = savedRevisions[0] || null;

  function resetPlannerState() {
    setProfile(DEFAULT_WEDDING_PROFILE);
    setTask("");
    setRevisionChange("");
    setOptions(defaultOptions);
    setRevisions([]);
    setSavedRevisions([]);
    setOutput(null);
    setLatestPrompt("");
    setSessionId(null);
    setThreadId(null);
    setUserId(null);
    setRagDebug(null);
    setPlannerDataReady(false);
    setKnowledgeSource("");
    setKnowledgeContent("");
    setKnowledgeDocs([]);
    setDeletedNote(null);
    setShowDeleteToast(false);
    setEditingDocId(null);
    setKnowledgeStatus(null);
    setVendorStatus(null);
    setCustomVendor(emptyVendorDraft);
    setCustomBudgetCategory("");
    setCustomBudgetAmount("");
    setIsEditingBudget(false);
    setEditingVendorIndex(null);
    setError(null);
    setSaveStatus(null);
    setSurveyStatus(null);
    setIsSavingSurvey(false);
    setIsEditingSurvey(false);
    setShowSurveySummary(false);
    setIsGenerating(false);
    setAvatarStatus(null);
    taskEditedRef.current = false;
  }

  function updateBaseTask(value: string) {
    taskEditedRef.current = true;
    setTask(value);
  }

  function applySession(session: Session | null) {
    if (session) {
      setAuthError(null);
      setIsSigningIn(false);
      setPlannerDataReady(false);
    }
    setAuthUser(session?.user ? mapPlannerAuthUser(session.user) : null);
    setAuthToken(session?.access_token || null);
    if (!session) {
      setPlannerDataReady(false);
    }
    setAuthReady(true);
  }

  async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!authToken) {
      throw new Error("You must be signed in to use the planner.");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${authToken}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      setAuthError("Your session expired. Please sign in again.");
      if (supabase) {
        await supabase.auth.signOut();
      }
    }

    return response;
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setAuthError(
        "Supabase authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
      );
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setAuthError(sessionError.message);
        }
        applySession(data.session);
      })
      .catch((sessionError: Error) => {
        if (!active) return;
        setAuthError(sessionError.message);
        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      applySession(session);
      if (!session) {
        resetPlannerState();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (deleteToastTimer.current) {
        clearTimeout(deleteToastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOnboardingComplete || output || taskEditedRef.current || task.trim()) {
      return;
    }

    setTask(buildPlanningRequest(profile));
  }, [isOnboardingComplete, output, profile, task]);

  useEffect(() => {
    if (!authToken) {
      resetPlannerState();
      return;
    }

    let active = true;
    setPlannerDataReady(false);

    (async () => {
      try {
        const fetchWithToken = async (input: RequestInfo | URL) => {
          const response = await fetch(input, {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (response.status === 401) {
            setAuthError("Your session expired. Please sign in again.");
            if (supabase) {
              await supabase.auth.signOut();
            }
          }

          return response;
        };

        const [profileRes, docsRes, plansRes] = await Promise.all([
          fetchWithToken("/api/profile"),
          fetchWithToken("/api/knowledge"),
          fetchWithToken("/api/plans"),
        ]);

        if (!active) return;

        if (profileRes.ok) {
          const data = (await profileRes.json()) as { profile: WeddingProfile | null };
          const mergedProfile = mergeWeddingProfile(data.profile);
          setProfile(mergedProfile);
          setAuthUser((prev) =>
            prev
              ? {
                  ...prev,
                  avatarUrl: mergedProfile.avatarUrl || prev.avatarUrl,
                }
              : prev,
          );
        }

        if (docsRes.ok) {
          const data = (await docsRes.json()) as { docs: KnowledgeDocView[] };
          setKnowledgeDocs(data.docs);
        }

        if (plansRes.ok) {
          const data = (await plansRes.json()) as {
            revisions: StoredSessionOutput[];
          };
          setSavedRevisions(data.revisions);
        }
      } catch (loadError) {
        if (!active) return;
        setError(`Could not load planner data: ${(loadError as Error).message}`);
      } finally {
        if (active) {
          setPlannerDataReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [authToken, supabase]);

  async function handleGoogleSignIn() {
    if (!supabase) return;
    setAuthError(null);
    setIsSigningIn(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (signInError) {
      setAuthError(signInError.message);
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      resetPlannerState();
      setAuthUser(null);
      setAuthToken(null);
      return;
    }

    setIsSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setAuthError(signOutError.message);
    }
    resetPlannerState();
    setAuthUser(null);
    setAuthToken(null);
    setIsSigningOut(false);
  }

  async function loadKnowledgeDocs() {
    const res = await authorizedFetch("/api/knowledge");
    if (!res.ok) return;
    const data = (await res.json()) as { docs: KnowledgeDocView[] };
    setKnowledgeDocs(data.docs);
  }

  async function loadSavedPlans() {
    const res = await authorizedFetch("/api/plans");
    if (!res.ok) return;
    const data = (await res.json()) as { revisions: StoredSessionOutput[] };
    setSavedRevisions(data.revisions);
  }

  function resumeSavedPlan(revision: StoredSessionOutput) {
    const threadRevisions = savedRevisions
      .filter((item) => item.threadId === revision.threadId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    setTask(revision.baseTask);
    taskEditedRef.current = true;
    setOutput(normalizeStructuredResponse(revision.currentOutput));
    setLatestPrompt("");
    setSessionId(revision.id);
    setThreadId(revision.threadId);
    setUserId(revision.userId);
    setRevisions(threadRevisions.length ? threadRevisions : [revision]);
    setRevisionChange("");
    setSaveStatus("Resumed your saved plan.");
  }

  async function saveCurrentPlan() {
    if (!output) {
      setSaveStatus("Generate a plan before saving.");
      return;
    }

    await persistCustomBudgetSectionsFromOutput();

    const res = await authorizedFetch("/api/plans", {
      method: "POST",
      body: JSON.stringify({
        threadId: threadId || sessionId || undefined,
        baseTask: task,
        previousOutput: revisions[0]?.currentOutput || null,
        currentOutput: normalizeStructuredResponse(output),
        revisionRequest: revisionRequest || "Manual save",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      setSaveStatus(`Save failed (${res.status}): ${text}`);
      return;
    }

    const data = (await res.json()) as { revision: StoredSessionOutput };
    const normalizedRevision: StoredSessionOutput = {
      ...data.revision,
      currentOutput: normalizeStructuredResponse(data.revision.currentOutput),
    };

    setSessionId(normalizedRevision.id);
    setThreadId(normalizedRevision.threadId);
    setUserId(normalizedRevision.userId);
    setRevisions((prev) => [normalizedRevision, ...prev]);
    setSavedRevisions((prev) => [normalizedRevision, ...prev]);
    setSaveStatus("Plan saved. You can resume it next time you sign in.");
  }

  async function persistProfile(nextProfile: WeddingProfile, message?: string) {
    setIsSavingSurvey(true);
    const res = await authorizedFetch("/api/profile", {
      method: "PUT",
      body: JSON.stringify(nextProfile),
    });
    setIsSavingSurvey(false);

    if (!res.ok) {
      const text = await res.text();
      setError(`Could not save wedding profile (${res.status}): ${text}`);
      return false;
    }

    setProfile(nextProfile);
    setSurveyStatus(message || "Progress saved.");
    setError(null);
    return true;
  }

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setAvatarStatus("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarStatus("Profile pictures must be 2MB or smaller.");
      return;
    }

    const avatarUrl = await readFileAsDataUrl(file);
    const nextProfile = mergeWeddingProfile({
      ...profile,
      avatarUrl,
    });
    const saved = await persistProfile(nextProfile, "Profile picture updated.");
    if (!saved) return;

    setAuthUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
    setAvatarStatus("Profile picture updated.");
  }

  async function goToSurveyStep(nextStep: number) {
    const nextProfile = mergeWeddingProfile({
      ...profile,
      surveyStep: Math.max(0, Math.min(nextStep, weddingSurveySchema.length - 1)),
      onboardingComplete: isEditingSurvey ? profile.onboardingComplete : false,
    });
    await persistProfile(nextProfile, "Survey progress saved.");
  }

  async function handleNextSurveyStep() {
    const partialValidation = validateWeddingProfile(profile, { allowIncomplete: true });
    if (!partialValidation.valid) {
      setError(partialValidation.errors.join(" "));
      return;
    }

    if (currentStep === weddingSurveySchema.length - 1) {
      const finalProfile = mergeWeddingProfile({
        ...profile,
        surveyStep: currentStep,
        onboardingComplete: isWeddingProfileComplete(profile),
      });

      const fullValidation = validateWeddingProfile(finalProfile, {
        allowIncomplete: false,
      });

      if (!fullValidation.valid) {
        setError(fullValidation.errors.join(" "));
        return;
      }

      const shouldShowCompletion = !isOnboardingComplete;
      const saved = await persistProfile(
        fullValidation.profile,
        "Survey complete. Wedding planning is ready.",
      );
      if (saved && shouldShowCompletion) {
        setShowSurveySummary(true);
      }
      setIsEditingSurvey(false);
      return;
    }

    await goToSurveyStep(currentStep + 1);
  }

  async function submitRequest() {
    if (isGenerating || !canSubmit) return;
    setError(null);
    setIsGenerating(true);

    const payload: GenerateRequest = {
      profile,
      task,
      threadId: threadId || undefined,
      previousOutput: output,
      revisionRequest,
      options,
    };

    try {
      const res = await authorizedFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        setError(`Planner request failed (${res.status}): ${text}`);
        return;
      }

      const data = (await res.json()) as {
        prompt: string;
        response: StructuredResponse;
        debug?: RagDebugInfo;
        sessionId: string;
        threadId: string;
        userId: string;
      };

      const normalizedResponse = normalizeStructuredResponse(data.response);

      setLatestPrompt(data.prompt);
      setOutput(normalizedResponse);
      setSessionId(data.sessionId);
      setThreadId(data.threadId);
      setUserId(data.userId);
      setRagDebug(data.debug || null);

      const revision: StoredSessionOutput = {
        id: data.sessionId,
        userId: data.userId,
        threadId: data.threadId,
        baseTask: task,
        previousOutput: output,
        currentOutput: normalizedResponse,
        revisionRequest: revisionRequest.trim(),
        createdAt: new Date().toISOString(),
      };
      setRevisions((prev) => [revision, ...prev]);
      setSavedRevisions((saved) => [revision, ...saved]);
      setSaveStatus("Draft saved automatically.");
      setRevisionChange("");
    } catch (submitError) {
      setError(`Network error while planning: ${(submitError as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitFeedback(rating: "up" | "down") {
    if (!sessionId) {
      setError("Generate a plan first so there is a session to rate.");
      return;
    }

    const res = await authorizedFetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ sessionId, rating, feedback: "" }),
    });

    if (!res.ok) {
      const text = await res.text();
      setError(`Feedback failed (${res.status}): ${text}`);
      return;
    }

    setRevisions((prev) =>
      prev.map((revision) =>
        revision.id === sessionId ? { ...revision, rating } : revision,
      ),
    );
  }

  async function upsertKnowledgeDoc() {
    setKnowledgeStatus(null);
    if (!knowledgeSource.trim() || !knowledgeContent.trim()) {
      setKnowledgeStatus("Source and content are required.");
      return;
    }

    const url = editingDocId ? `/api/knowledge/${editingDocId}` : "/api/knowledge";
    const method = editingDocId ? "PUT" : "POST";
    const res = await authorizedFetch(url, {
      method,
      body: JSON.stringify({
        source: knowledgeSource,
        content: knowledgeContent,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      setKnowledgeStatus(`Save failed (${res.status}): ${text}`);
      return;
    }

    const data = (await res.json()) as { source: string };
    setKnowledgeStatus(`Saved note: ${data.source}.`);
    setKnowledgeSource("");
    setKnowledgeContent("");
    setEditingDocId(null);
    await loadKnowledgeDocs();
  }

  async function saveKnowledgeNote(source: string, content: string) {
    const res = await authorizedFetch("/api/knowledge", {
      method: "POST",
      body: JSON.stringify({ source, content }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Save failed (${res.status}): ${text}`);
    }

    await loadKnowledgeDocs();
  }

  function updateVendor(index: number, patch: Partial<VendorSuggestion>) {
    setOutput((current) => {
      if (!current) return current;
      return {
        ...current,
        vendorSuggestions: current.vendorSuggestions.map((vendor, vendorIndex) =>
          vendorIndex === index ? { ...vendor, ...patch } : vendor,
        ),
      };
    });
  }

  async function confirmVendor(vendor: VendorSuggestion) {
    setVendorStatus(null);
    if (!vendor.name.trim()) {
      setVendorStatus("Vendor name is required before saving to notes.");
      return;
    }

    const source = `Vendor Tracker - ${vendor.category} - ${vendor.name}`;
    const content = formatVendorNote(vendor);

    try {
      await saveKnowledgeNote(source, content);
      setEditingVendorIndex(null);
      setVendorStatus(`Saved vendor note: ${vendor.name}.`);
    } catch (saveError) {
      setVendorStatus((saveError as Error).message);
    }
  }

  async function addCustomVendor() {
    setVendorStatus(null);
    const vendor: VendorSuggestion = {
      ...customVendor,
      name: customVendor.name.trim(),
      region: customVendor.region.trim() || profile.location || "not provided",
      priceEstimate: customVendor.priceEstimate.trim() || "not provided",
      contact: customVendor.contact.trim() || "not provided",
      source: "Manual vendor tracker",
      whyItFits:
        customVendor.whyItFits.trim() ||
        "Manually added by the user in the vendor tracker.",
    };

    if (!vendor.name) {
      setVendorStatus("Vendor name is required before adding a custom vendor.");
      return;
    }

    setOutput((current) =>
      current
        ? {
            ...current,
            vendorSuggestions: [...current.vendorSuggestions, vendor],
          }
        : current,
    );

    try {
      await saveKnowledgeNote(
        `Vendor Tracker - ${vendor.category} - ${vendor.name}`,
        formatVendorNote(vendor),
      );
      setCustomVendor(emptyVendorDraft);
      setEditingVendorIndex(null);
      setVendorStatus(`Added vendor note: ${vendor.name}.`);
    } catch (saveError) {
      setVendorStatus((saveError as Error).message);
    }
  }

  function updateBudgetItem(index: number, nextAmount: number) {
    setOutput((current) => {
      if (!current) return current;
      return {
        ...current,
        budgetBreakdown: current.budgetBreakdown.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                allocation: nextAmount,
                estimatedRange: formatCurrency(nextAmount),
              }
            : item,
        ),
      };
    });
  }

  async function persistCustomBudgetSectionsFromOutput() {
    if (!output) return;
    const customBudgetSections = output.budgetBreakdown
      .filter((item) => isCustomBudgetItem(item, profile))
      .map((item) => ({
        category: item.category,
        allocation: getBudgetAmount(item),
        rationale: item.rationale || "Custom budget section added by the user.",
      }));

    const nextProfile = mergeWeddingProfile({
      ...profile,
      customBudgetSections,
    });
    await persistProfile(nextProfile, "Custom budget sections saved.");
  }

  async function addCustomBudgetSection() {
    const category = customBudgetCategory.trim();
    const amount = Number(customBudgetAmount);
    if (!category || !Number.isFinite(amount) || amount < 0) {
      setError("Enter a custom budget category and a single non-negative number.");
      return;
    }

    const roundedAmount = Math.round(amount);
    const customSection = {
      category,
      allocation: roundedAmount,
      rationale: "Custom budget section added by the user.",
    };

    setOutput((current) =>
      current
        ? {
            ...current,
            budgetBreakdown: [
              ...current.budgetBreakdown,
              {
                category,
                allocation: roundedAmount,
                estimatedRange: formatCurrency(roundedAmount),
                rationale: customSection.rationale,
              },
            ],
          }
        : current,
    );

    const nextProfile = mergeWeddingProfile({
      ...profile,
      customBudgetSections: [
        ...(profile.customBudgetSections || []).filter(
          (section) => section.category !== category,
        ),
        customSection,
      ],
    });
    await persistProfile(nextProfile, "Custom budget section saved.");
    setCustomBudgetCategory("");
    setCustomBudgetAmount("");
    setError(null);
  }

  function renderCustomVendorForm() {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 shadow-sm">
        <p className="text-sm font-medium">Add Custom Vendor</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            Category
            <select
              className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
              value={customVendor.category}
              onChange={(event) =>
                setCustomVendor((vendor) => ({
                  ...vendor,
                  category: event.target.value,
                }))
              }
            >
              {vendorCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select
              className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
              value={customVendor.status}
              onChange={(event) =>
                setCustomVendor((vendor) => ({
                  ...vendor,
                  status: event.target.value as VendorSuggestion["status"],
                }))
              }
            >
              <option value="contracted">Contracted</option>
              <option value="not_contracted">Needs contract</option>
            </select>
          </label>
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Vendor name"
            value={customVendor.name}
            onChange={(event) =>
              setCustomVendor((vendor) => ({
                ...vendor,
                name: event.target.value,
              }))
            }
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Price"
            value={customVendor.priceEstimate}
            onChange={(event) =>
              setCustomVendor((vendor) => ({
                ...vendor,
                priceEstimate: event.target.value,
              }))
            }
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Email, phone, Instagram"
            value={customVendor.contact}
            onChange={(event) =>
              setCustomVendor((vendor) => ({
                ...vendor,
                contact: event.target.value,
              }))
            }
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder={`Region (${profile.location || "optional"})`}
            value={customVendor.region}
            onChange={(event) =>
              setCustomVendor((vendor) => ({
                ...vendor,
                region: event.target.value,
              }))
            }
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Notes"
            value={customVendor.whyItFits}
            onChange={(event) =>
              setCustomVendor((vendor) => ({
                ...vendor,
                whyItFits: event.target.value,
              }))
            }
          />
        </div>
        <button
          type="button"
          onClick={() => void addCustomVendor()}
          className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Add Vendor and Save to Notes
        </button>
      </div>
    );
  }

  async function removeKnowledgeDoc(id: string) {
    const previousDocs = knowledgeDocs;
    const removedDoc = knowledgeDocs.find((doc) => doc.id === id);
    setKnowledgeDocs((docs) => docs.filter((doc) => doc.id !== id));

    const res = await authorizedFetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      setKnowledgeDocs(previousDocs);
      setKnowledgeStatus(`Delete failed (${res.status}): ${text}`);
      return;
    }
    setKnowledgeStatus("Knowledge note deleted.");
    if (removedDoc) {
      showUndoDeleteToast(removedDoc);
    }
  }

  function showUndoDeleteToast(note: KnowledgeDocView) {
    if (deleteToastTimer.current) {
      clearTimeout(deleteToastTimer.current);
    }

    setDeletedNote(note);
    setShowDeleteToast(true);
    deleteToastTimer.current = setTimeout(() => {
      setShowDeleteToast(false);
      setDeletedNote(null);
      deleteToastTimer.current = null;
    }, 5000);
  }

  async function undoDeleteNote() {
    if (!deletedNote) return;

    const noteToRestore = deletedNote;
    if (deleteToastTimer.current) {
      clearTimeout(deleteToastTimer.current);
      deleteToastTimer.current = null;
    }
    setShowDeleteToast(false);
    setDeletedNote(null);
    setKnowledgeDocs((docs) => [noteToRestore, ...docs]);

    const res = await authorizedFetch("/api/knowledge", {
      method: "POST",
      body: JSON.stringify({
        source: noteToRestore.source,
        content: noteToRestore.content,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      setKnowledgeDocs((docs) => docs.filter((doc) => doc.id !== noteToRestore.id));
      setKnowledgeStatus(`Undo failed (${res.status}): ${text}`);
      return;
    }

    setKnowledgeStatus("Knowledge note restored.");
    await loadKnowledgeDocs();
  }

  function beginEditDoc(doc: KnowledgeDocView) {
    setEditingDocId(doc.id);
    setKnowledgeSource(doc.source);
    setKnowledgeContent(doc.content);
    setKnowledgeStatus(`Editing ${doc.source}`);
  }

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <Spinner label="Checking session..." />
      </main>
    );
  }

  if (!authUser) {
    return (
      <GoogleSignInLanding
        onSignIn={() => void handleGoogleSignIn()}
        disabled={isSigningIn}
        authConfigured={Boolean(supabase)}
        error={authError}
      />
    );
  }

  if (!plannerDataReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <Spinner label="Loading your wedding planner..." />
      </main>
    );
  }

  if (showSurveySummary) {
    return (
      <main className="min-h-screen bg-[linear-gradient(160deg,#fff7ed_0%,#fff1f2_50%,#ffffff_100%)] p-6 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <AuthenticatedTopBar
            user={authUser}
            onSignOut={handleSignOut}
            onUploadAvatar={handleAvatarUpload}
            isSigningOut={isSigningOut}
          />
        </div>
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl items-center justify-center">
          <section className="w-full rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-rose-100">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
              Survey Complete
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight">
              Your planning profile is ready.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-slate-600">
              The planner will use these details to keep recommendations grounded in your budget, guest count, priorities, and constraints.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <SummaryTile label="Budget" value={`$${profile.totalBudget.toLocaleString()}`} />
              <SummaryTile label="Guests" value={String(profile.guestCount)} />
              <SummaryTile label="Location" value={profile.location || "Not set"} />
              <SummaryTile label="Budget / Guest" value={`$${budgetSnapshot.budgetPerGuest}`} />
              <SummaryTile
                label="Priorities"
                value={profile.priorities.map(formatPriorityLabel).join(", ") || "None"}
              />
              <SummaryTile label="Style" value={profile.style || "Not set"} />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setShowSurveySummary(false)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-white"
              >
                Start planning
              </button>
              <button
                onClick={() => {
                  setShowSurveySummary(false);
                  setIsEditingSurvey(true);
                }}
                className="rounded-xl border px-4 py-2"
              >
                Review answers
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (isSurveyMode) {
    return (
      <main className="min-h-screen bg-[linear-gradient(160deg,#fff7ed_0%,#fff1f2_50%,#ffffff_100%)] p-6 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <AuthenticatedTopBar
            user={authUser}
            onSignOut={handleSignOut}
            onUploadAvatar={handleAvatarUpload}
            isSigningOut={isSigningOut}
          />
          {avatarStatus && <p className="mt-3 text-sm text-slate-600">{avatarStatus}</p>}
        </div>
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center">
          <section
            className={`grid w-full items-start gap-6 ${
              canJumpBetweenQuestions
                ? "lg:grid-cols-[0.72fr_1fr_0.82fr]"
                : "lg:grid-cols-[1.15fr_0.85fr]"
            }`}
          >
            {canJumpBetweenQuestions && (
              <aside className="self-start rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-rose-100">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">
                  Survey Map
                </p>
                <h2 className="mt-2 text-xl font-semibold">Jump to a question</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Available only in edit mode after the survey has been completed.
                </p>
                <div className="mt-5 space-y-2">
                  {weddingSurveySchema.map((question, index) => {
                    const isActive = index === currentStep;
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => void goToSurveyStep(index)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                          isActive
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <span className="block text-xs uppercase tracking-wide text-slate-400">
                          Step {index + 1}
                        </span>
                        <span className="mt-1 block font-medium">{question.label}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

            <div className="self-start rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-rose-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
                    Budget Wedding Planner
                  </p>
                  <h1 className="mt-3 text-4xl font-semibold leading-tight">
                    {isOnboardingComplete
                      ? "Edit your wedding survey"
                      : "Start with the wedding survey"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base text-slate-600">
                    {isOnboardingComplete
                      ? "Update any answer and continue. Your saved profile and planner context will refresh when you finish."
                      : "Answer one question at a time. Sign-in is already complete, so this is the only thing to focus on before planning begins."}
                  </p>
                </div>
                <span className="rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
                  Step {currentStep + 1} of {weddingSurveySchema.length}
                </span>
              </div>

              <div className="mt-6">
                <ProgressBar current={currentStep + 1} total={weddingSurveySchema.length} />
              </div>

              <div className="mt-8 rounded-[1.5rem] bg-slate-50 p-6">
                <SurveyStepCard
                  question={currentQuestion}
                  value={profile[currentQuestion.id]}
                  onChange={(value) =>
                    setProfile((prev) =>
                      mergeWeddingProfile({
                        ...prev,
                        [currentQuestion.id]: value,
                      }),
                    )
                  }
                />
              </div>

              <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                <button
                  disabled={currentStep === 0 || isSavingSurvey}
                  onClick={() => void goToSurveyStep(currentStep - 1)}
                  className="rounded-xl border px-4 py-2 disabled:opacity-50"
                >
                  Back
                </button>
                <div className="flex gap-3">
                  {isOnboardingComplete && isEditingSurvey && (
                    <button
                      disabled={isSavingSurvey}
                      onClick={() => setIsEditingSurvey(false)}
                      className="rounded-xl border px-4 py-2 disabled:opacity-50"
                    >
                      Exit
                    </button>
                  )}
                  <button
                    disabled={isSavingSurvey}
                    onClick={() =>
                      void persistProfile(
                        mergeWeddingProfile({
                          ...profile,
                          onboardingComplete: false,
                        }),
                        "Survey progress saved.",
                      )
                    }
                    className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    disabled={isSavingSurvey}
                    onClick={() => void handleNextSurveyStep()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                  >
                    {currentStep === weddingSurveySchema.length - 1 ? "Finish" : "Next"}
                  </button>
                </div>
              </div>

              {surveyStatus && <p className="mt-4 text-sm text-slate-600">{surveyStatus}</p>}
              {(error || authError) && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error || authError}
                </div>
              )}
            </div>

            <aside className="self-start rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl">
              <h2 className="text-2xl font-semibold">Live planning snapshot</h2>
              <p className="mt-3 text-sm text-slate-300">
                These numbers update as you answer the survey so you can see how your constraints shape the plan.
              </p>
              <div className="mt-6 grid gap-4 text-sm">
                <InfoRow
                  label="Budget"
                  value={
                    profile.totalBudget > 0
                      ? `$${profile.totalBudget.toLocaleString()}`
                      : "Not set"
                  }
                />
                <InfoRow
                  label="Guests"
                  value={profile.guestCount > 0 ? String(profile.guestCount) : "Not set"}
                />
                <InfoRow
                  label="Budget / Guest"
                  value={
                    profile.totalBudget > 0 && profile.guestCount > 0
                      ? `$${budgetSnapshot.budgetPerGuest}`
                      : "Not set"
                  }
                />
                <InfoRow label="Location" value={profile.location || "Not set"} />
                <InfoRow label="Season" value={profile.season || "Not set"} />
                <InfoRow label="Style" value={profile.style || "Not set"} />
              </div>
              <div className="mt-6 rounded-2xl bg-slate-900 p-4">
                <h3 className="font-medium">Protected priorities</h3>
                <p className="mt-2 text-sm text-slate-300">
                  {profile.priorities.map(formatPriorityLabel).join(", ") || "None"}
                </p>
              </div>
              <div className="mt-6 space-y-3">
                {budgetSnapshot.tradeoffs.length > 0 ? (
                  budgetSnapshot.tradeoffs.map((item, index) => (
                    <div
                      key={index}
                      className="rounded-xl bg-slate-900 p-3 text-sm text-slate-200"
                    >
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300">
                    Tradeoffs will appear as your budget and guest count become clearer.
                  </div>
                )}
              </div>
            </aside>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-6">
        <AuthenticatedTopBar
          user={authUser}
          onSignOut={handleSignOut}
          onUploadAvatar={handleAvatarUpload}
          isSigningOut={isSigningOut}
        />
        {avatarStatus && <p className="mt-3 text-sm text-slate-600">{avatarStatus}</p>}

        <header className="mt-6 rounded-3xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
            Budget Wedding Planner
          </p>
          <h1 className="mt-2 text-3xl font-bold">Plan a wedding that fits real constraints.</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-700">
            You are signed in and planning against your saved wedding profile. Refine costs,
            guest count, priorities, and vendor choices without losing context.
          </p>
          <div className="mt-4">
            <button
              onClick={() => setIsEditingSurvey(true)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700"
            >
              Edit survey answers
            </button>
          </div>
        </header>

        {(error || authError) && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error || authError}
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">1) Planner</h2>
            <p className="mt-1 text-sm text-slate-600">
              Follow-ups stay grounded in your saved wedding profile.
            </p>

            {!isOnboardingComplete && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Finish the survey before generating a planning response.
              </div>
            )}

            <label className="mt-4 block text-sm font-medium">What to plan</label>
            <p className="mt-1 text-sm text-slate-600">
              Based on your profile - edit anything before generating.
            </p>
            <textarea
              className="mt-1 h-32 w-full rounded-xl border p-3"
              value={task}
              onChange={(e) => {
                updateBaseTask(e.target.value);
              }}
              disabled={Boolean(output)}
              placeholder={DEFAULT_PLANNING_REQUEST}
            />

            {output && (
              <>
                <label className="mt-4 block text-sm font-medium">Revise this plan</label>
                <p className="mt-1 text-sm text-slate-600">
                  Describe only what should change. Anything not mentioned will be kept.
                </p>
                <RevisionField
                  label="Change"
                  value={revisionChange}
                  onChange={setRevisionChange}
                  placeholder="Adjust to 120 guests, avoid expensive florals, and show tradeoffs."
                />
              </>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.citeSources}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, citeSources: e.target.checked }))
                    }
                  />
                  Use retrieval
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(options.ragDebug)}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, ragDebug: e.target.checked }))
                    }
                  />
                  Debug
                </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                disabled={!canSubmit}
                onClick={() => void submitRequest()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {isGenerating ? (
                  <Spinner label="Planning..." />
                ) : output ? (
                  "Revise plan"
                ) : (
                  "Generate plan"
                )}
              </button>
              <QuickAction
                label="Make this cheaper"
                onClick={() =>
                  output
                    ? setRevisionChange("Make this cheaper without cutting food quality.")
                    : updateBaseTask("Build a cheaper plan without cutting food quality.")
                }
              />
              <QuickAction
                label="Adjust for 120 guests"
                onClick={() =>
                  output
                    ? setRevisionChange("Adjust this plan for 120 guests and show tradeoffs.")
                    : updateBaseTask("Build a plan for 120 guests and show tradeoffs.")
                }
              />
              <QuickAction
                label="Prioritize food over decor"
                onClick={() =>
                  output
                    ? setRevisionChange(
                        "Rebalance the plan to prioritize food over decor and explain the tradeoffs.",
                      )
                    : updateBaseTask(
                        "Build a plan that prioritizes food over decor and explains the tradeoffs.",
                      )
                }
              />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">2) Notes</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add vendor quotes, local venue quotes, vendor restrictions, family constraints, accessibility needs, or other planning notes for retrieval.
            </p>

            <FormField label="Source name" value={knowledgeSource} onChange={setKnowledgeSource} />
            <label className="mt-3 block text-sm font-medium">Notes</label>
            <textarea
              className="mt-1 h-28 w-full rounded-xl border p-3"
              value={knowledgeContent}
              onChange={(e) => setKnowledgeContent(e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void upsertKnowledgeDoc()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-white"
              >
                {editingDocId ? "Update note" : "Add note"}
              </button>
              {editingDocId && (
                <button
                  onClick={() => {
                    setEditingDocId(null);
                    setKnowledgeSource("");
                    setKnowledgeContent("");
                    setKnowledgeStatus("Edit canceled.");
                  }}
                  className="rounded-xl border px-4 py-2"
                >
                  Cancel
                </button>
              )}
            </div>

            {knowledgeStatus && <p className="mt-2 text-sm text-slate-600">{knowledgeStatus}</p>}

            <div className="mt-4 space-y-2">
              {knowledgeDocs.length === 0 ? (
                <p className="text-sm text-slate-500">No local notes yet.</p>
              ) : (
                knowledgeDocs.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{doc.source}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(doc.createdAt).toLocaleString()} | indexed:{" "}
                          {doc.hasEmbedding ? "yes" : "no"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => beginEditDoc(doc)} className="rounded border px-3 py-1">
                          Edit
                        </button>
                        <button
                          onClick={() => void removeKnowledgeDoc(doc.id)}
                          className="rounded border px-3 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">3) Wedding Plan Output</h2>
              {saveStatus && <p className="mt-1 text-sm text-slate-600">{saveStatus}</p>}
            </div>
            {output && (
              <button
                onClick={() => void saveCurrentPlan()}
                className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700"
              >
                Save plan
              </button>
            )}
          </div>
          {!output ? (
            <div className="mt-3">
              <p className="text-sm text-slate-500">
                No plan yet. Finish the survey and generate your first plan.
              </p>
              {latestSavedRevision && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="font-medium text-rose-900">Resume where you left off?</p>
                  <p className="mt-1 text-sm text-rose-800">
                    Last saved {new Date(latestSavedRevision.createdAt).toLocaleString()}.
                  </p>
                  <button
                    onClick={() => resumeSavedPlan(latestSavedRevision)}
                    className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Resume saved plan
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <SectionCard title="Summary">
                <p
                  className={`mb-1 text-2xl font-semibold ${
                    isPlanWithinBudget ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  Total price: ${planTotal.toLocaleString()}
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  Stated budget: ${profile.totalBudget.toLocaleString()}
                </p>
                <p className="text-sm leading-6 text-slate-700">{output.summary}</p>
              </SectionCard>
              <SectionCard title="Tradeoffs">
                <BulletList items={output.tradeoffs} />
              </SectionCard>
              <SectionCard
                title="Budget Breakdown"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingBudget) {
                        void persistCustomBudgetSectionsFromOutput();
                      }
                      setIsEditingBudget((value) => !value);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700"
                  >
                    {isEditingBudget ? "Done" : "Edit"}
                  </button>
                }
              >
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
                  {output.budgetBreakdown.map((item, index) => (
                    <div
                      key={item.category}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.category}</p>
                        {isEditingBudget ? (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            $
                            <input
                              className="w-28 rounded-lg border bg-white px-2 py-1 text-right"
                              type="number"
                              min={0}
                              value={getBudgetAmount(item)}
                              onChange={(event) =>
                                updateBudgetItem(
                                  index,
                                  event.target.value === "" ? 0 : Number(event.target.value),
                                )
                              }
                            />
                          </label>
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">
                            {formatCurrency(getBudgetAmount(item))}
                          </p>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{item.rationale}</p>
                    </div>
                  ))}
                  {isEditingBudget && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 shadow-sm">
                      <p className="text-sm font-medium">Add Custom Budget Section</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                        <input
                          className="rounded-lg border px-3 py-2 text-sm"
                          placeholder="Section name"
                          value={customBudgetCategory}
                          onChange={(event) => setCustomBudgetCategory(event.target.value)}
                        />
                        <input
                          className="rounded-lg border px-3 py-2 text-sm"
                          placeholder="Amount"
                          type="number"
                          min={0}
                          value={customBudgetAmount}
                          onChange={(event) => setCustomBudgetAmount(event.target.value)}
                        />
                        <button
                          type="button"
                          onClick={addCustomBudgetSection}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
              <SectionCard title="Vendor Tracker">
                {output.vendorSuggestions.length === 0 ? (
                  <div className="max-h-[520px] space-y-3 overflow-y-auto pr-2">
                    <p className="text-sm text-slate-500">
                      Add vendor quotes, contracted vendors, or venue details in Notes to populate the vendor tracker.
                    </p>
                    {renderCustomVendorForm()}
                    {vendorStatus && (
                      <p className="text-sm text-slate-600">{vendorStatus}</p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[520px] space-y-3 overflow-y-auto pr-2">
                    {output.vendorSuggestions.map((vendor, index) => (
                      <div
                        key={`${vendor.category}-${vendor.name}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm"
                      >
                        {editingVendorIndex === index ? (
                          <>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="text-xs font-medium text-slate-600">
                                Category
                                <select
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.category}
                                  onChange={(event) =>
                                    updateVendor(index, { category: event.target.value })
                                  }
                                >
                                  {vendorCategories.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Status
                                <select
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.status}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      status: event.target.value as VendorSuggestion["status"],
                                    })
                                  }
                                >
                                  <option value="contracted">Contracted</option>
                                  <option value="not_contracted">Needs contract</option>
                                </select>
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Vendor
                                <input
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.name}
                                  onChange={(event) =>
                                    updateVendor(index, { name: event.target.value })
                                  }
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Price
                                <input
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.priceEstimate}
                                  onChange={(event) =>
                                    updateVendor(index, { priceEstimate: event.target.value })
                                  }
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Contact
                                <input
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  placeholder="Email, phone, Instagram"
                                  value={vendor.contact}
                                  onChange={(event) =>
                                    updateVendor(index, { contact: event.target.value })
                                  }
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Region
                                <input
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.region}
                                  onChange={(event) =>
                                    updateVendor(index, { region: event.target.value })
                                  }
                                />
                              </label>
                              <label className="text-xs font-medium text-slate-600">
                                Source
                                <input
                                  className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                  value={vendor.source}
                                  onChange={(event) =>
                                    updateVendor(index, { source: event.target.value })
                                  }
                                />
                              </label>
                            </div>
                            <label className="mt-2 block text-xs font-medium text-slate-600">
                              Notes
                              <textarea
                                className="mt-1 h-20 w-full rounded-lg border bg-white px-2 py-2 text-sm"
                                value={vendor.whyItFits}
                                onChange={(event) =>
                                  updateVendor(index, { whyItFits: event.target.value })
                                }
                              />
                            </label>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void confirmVendor(vendor)}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                              >
                                Confirm and Save to Notes
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingVendorIndex(null)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-semibold text-rose-800">{vendor.category}</p>
                                  <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium uppercase tracking-wide text-rose-700">
                                    {vendor.status === "contracted" ? "Contracted" : "Needs contract"}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-slate-900">{vendor.name}</p>
                              </div>
                              <button
                                type="button"
                                aria-label={`Edit ${vendor.name || vendor.category}`}
                                onClick={() => setEditingVendorIndex(index)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700"
                              >
                                <svg
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M13.586 3.586a2 2 0 012.828 2.828l-8.5 8.5-3.536.707.707-3.536 8.5-8.5z" />
                                  <path d="M4 16h12v1.5H4V16z" />
                                </svg>
                              </button>
                            </div>
                            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Price</dt>
                                <dd className="text-slate-700">{vendor.priceEstimate || "not provided"}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Region</dt>
                                <dd className="text-slate-700">{vendor.region || "not provided"}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</dt>
                                <dd className="text-slate-700">{vendor.contact || "not provided"}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt>
                                <dd className="line-clamp-3 text-slate-700">{vendor.whyItFits || "No notes."}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Source</dt>
                                <dd className="text-slate-700">{vendor.source || "not provided"}</dd>
                              </div>
                            </dl>
                          </>
                        )}
                      </div>
                    ))}
                    {renderCustomVendorForm()}
                    {vendorStatus && (
                      <p className="text-sm text-slate-600">{vendorStatus}</p>
                    )}
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Savings Options">
                <BulletList items={output.savingsOptions} />
              </SectionCard>
              <SectionCard title="Next Steps">
                <BulletList items={output.nextSteps} />
              </SectionCard>
              {output.citations.length > 0 && (
                <SectionCard title="Citations">
                  <BulletList items={output.citations} />
                </SectionCard>
              )}
              <SectionCard title="Revision History">
                <RevisionList revisions={revisions.slice(0, 3)} />
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={isGenerating}
                    onClick={() => void submitFeedback("up")}
                    className="rounded border px-3 py-1 disabled:opacity-50"
                  >
                    Useful
                  </button>
                  <button
                    disabled={isGenerating}
                    onClick={() => void submitFeedback("down")}
                    className="rounded border px-3 py-1 disabled:opacity-50"
                  >
                    Needs work
                  </button>
                </div>
                {(userId || sessionId) && (
                  <p className="mt-3 text-xs text-slate-500">
                    userId: {userId || "pending"} | threadId: {threadId || "pending"} |
                    revisionId: {sessionId || "pending"}
                  </p>
                )}
              </SectionCard>
              <SectionCard title="Prompt Debug">
                <details>
                  <summary className="cursor-pointer font-medium">View assembled prompt</summary>
                  <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                    {latestPrompt || "(no prompt yet)"}
                  </pre>
                </details>
                {ragDebug?.enabled && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-medium">View retrieval debug</summary>
                    <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                      {JSON.stringify(ragDebug, null, 2)}
                    </pre>
                  </details>
                )}
              </SectionCard>
            </div>
          )}
        </section>
        {showDeleteToast && deletedNote && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-slate-950 p-4 text-sm text-white shadow-xl">
            <div className="flex items-center gap-3">
              <p className="font-medium">Note deleted. Undo?</p>
              <button
                onClick={() => void undoDeleteNote()}
                className="rounded border border-white/30 px-3 py-1 font-medium"
              >
                Undo
              </button>
              <button
                aria-label="Dismiss deleted note message"
                onClick={() => {
                  if (deleteToastTimer.current) {
                    clearTimeout(deleteToastTimer.current);
                    deleteToastTimer.current = null;
                  }
                  setShowDeleteToast(false);
                  setDeletedNote(null);
                }}
                className="rounded border border-white/30 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function AuthenticatedTopBar({
  user,
  onSignOut,
  onUploadAvatar,
  isSigningOut,
}: {
  user: PlannerAuthUser;
  onSignOut: () => void;
  onUploadAvatar: (file: File) => Promise<void> | void;
  isSigningOut: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-600">
          Signed in
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Planner data, survey progress, and retrieval notes are scoped to your account.
        </p>
      </div>
      <UserMenu
        user={user}
        onSignOut={onSignOut}
        onUploadAvatar={onUploadAvatar}
        isSigningOut={isSigningOut}
      />
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function SurveyStepCard({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {question.required ? "Required" : "Optional"}
      </p>
      <h3 className="mt-2 text-2xl font-semibold">{question.label}</h3>
      {question.description && (
        <p className="mt-2 text-sm text-slate-600">{question.description}</p>
      )}
      <div className="mt-5 min-h-[200px]">
        <SurveyInput question={question} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function SurveyInput({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const baseClass = "w-full rounded-xl border p-4 text-base";

  if (question.type === "textarea") {
    return (
      <textarea
        className={`${baseClass} h-32`}
        value={String(value || "")}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (question.type === "select") {
    return (
      <select
        className={baseClass}
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{question.placeholder || "Select an option"}</option>
        {(question.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "select-with-custom") {
    const optionValues = (question.options || []).map((option) => option.value);
    const currentValue = String(value || "");
    const isCustom =
      currentValue.length > 0 &&
      currentValue !== "__custom__" &&
      !optionValues.includes(currentValue);
    const selectValue = isCustom ? "__custom__" : currentValue;

    return (
      <div className="space-y-3">
        <select
          className={baseClass}
          value={selectValue}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{question.placeholder || "Select an option"}</option>
          {(question.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {(selectValue === "__custom__" || isCustom) && (
          <input
            className={baseClass}
            type="text"
            placeholder="Type your custom answer"
            value={isCustom ? currentValue : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    );
  }

  if (question.type === "multiselect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-3">
        {(question.options || []).map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              type="button"
              key={option.value}
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((item) => item !== option.value)
                    : [...selected, option.value],
                )
              }
              className={`rounded-full px-4 py-3 text-sm ${
                active
                  ? "bg-rose-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      className={baseClass}
      type={question.type === "number" ? "number" : "text"}
      min={question.min}
      max={question.max}
      placeholder={question.placeholder}
      value={
        question.type === "number"
          ? Number(value || 0) > 0
            ? Number(value)
            : ""
          : String(value || "")
      }
      onChange={(e) =>
        onChange(
          question.type === "number"
            ? e.target.value === ""
              ? 0
              : Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percentage = `${Math.round((current / total) * 100)}%`;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-rose-500" style={{ width: percentage }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{percentage} complete</p>
    </div>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
        />
      </svg>
      {label ? <span>{label}</span> : null}
    </span>
  );
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mt-3 block text-sm font-medium">{label}</label>
      <input
        className="mt-1 w-full rounded-xl border p-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RevisionField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <textarea
        className="mt-1 h-24 w-full rounded-xl border p-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <select
        className="mt-1 w-full rounded-xl border p-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border px-4 py-2">
      {label}
    </button>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function BulletList({ items, emptyText = "None." }: { items: string[]; emptyText?: string }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
      {items.map((line, idx) => (
        <li key={`${line}-${idx}`}>{line}</li>
      ))}
    </ul>
  );
}

function RevisionList({ revisions }: { revisions: StoredSessionOutput[] }) {
  if (!revisions.length) {
    return <p className="text-sm text-slate-500">No revisions yet.</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-slate-700">
      {revisions.map((revision, index) => (
        <li key={revision.id} className="rounded-xl bg-slate-50 p-3">
          <p className="font-medium">
            {index === revisions.length - 1 && !revision.revisionRequest
              ? "Initial plan"
              : revision.revisionRequest || "Initial plan"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(revision.createdAt).toLocaleString()} | rating:{" "}
            {revision.rating || "not rated"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
