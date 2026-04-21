"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  SavedVendor,
  StoredSessionOutput,
  StructuredResponse,
  SurveyQuestion,
  VendorChatMessage,
  VendorChatOption,
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
import { VENDOR_CHAT_INITIAL_MESSAGE } from "@/lib/vendor-chat-shared";

interface KnowledgeDocView {
  id: string;
  source: string;
  content: string;
  createdAt: string;
  hasEmbedding: boolean;
}

interface ChatEntry extends VendorChatMessage {
  vendors?: VendorChatOption[];
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

function normalizeStructuredResponse(
  response: StructuredResponse,
): StructuredResponse {
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

type ThemeKey =
  | "romantic"
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "brown"
  | "dark";

type ThemePalette = {
  key: ThemeKey;
  label: string;
  primary: string;
  primaryDark: string;
  primaryRgb: string;
  secondary: string;
  secondaryRgb: string;
  accentText: string;
  panelStart: string;
  panelEnd: string;
  dark: string;
  darkEnd: string;
  pageStart?: string;
  pageEnd?: string;
  surface?: string;
  surfaceStrong?: string;
  text?: string;
  muted?: string;
  line?: string;
  shadow?: string;
};

const themePalettes: ThemePalette[] = [
  {
    key: "romantic",
    label: "Romantic red",
    primary: "#c93446",
    primaryDark: "#9f1f32",
    primaryRgb: "201, 52, 70",
    secondary: "#f6dfe4",
    secondaryRgb: "246, 223, 228",
    accentText: "#7c5960",
    panelStart: "#fffaf4",
    panelEnd: "#f6dfe4",
    dark: "#4f4139",
    darkEnd: "#382e29",
  },
  {
    key: "blue",
    label: "Blue",
    primary: "#3177b7",
    primaryDark: "#1f4f82",
    primaryRgb: "49, 119, 183",
    secondary: "#dbeaf8",
    secondaryRgb: "219, 234, 248",
    accentText: "#355a78",
    panelStart: "#f7fbff",
    panelEnd: "#dbeaf8",
    dark: "#314457",
    darkEnd: "#233240",
  },
  {
    key: "green",
    label: "Green",
    primary: "#4f8f63",
    primaryDark: "#2f6844",
    primaryRgb: "79, 143, 99",
    secondary: "#dfe9dc",
    secondaryRgb: "223, 233, 220",
    accentText: "#4d6b4a",
    panelStart: "#fbfff8",
    panelEnd: "#dfe9dc",
    dark: "#37483a",
    darkEnd: "#263428",
  },
  {
    key: "purple",
    label: "Purple",
    primary: "#8b64b0",
    primaryDark: "#60427f",
    primaryRgb: "139, 100, 176",
    secondary: "#ebe4f6",
    secondaryRgb: "235, 228, 246",
    accentText: "#604a76",
    panelStart: "#fdfaff",
    panelEnd: "#ebe4f6",
    dark: "#43374f",
    darkEnd: "#31283b",
  },
  {
    key: "orange",
    label: "Orange",
    primary: "#c76f3b",
    primaryDark: "#944a23",
    primaryRgb: "199, 111, 59",
    secondary: "#f5dfcc",
    secondaryRgb: "245, 223, 204",
    accentText: "#79513b",
    panelStart: "#fffaf4",
    panelEnd: "#f5dfcc",
    dark: "#513d31",
    darkEnd: "#3a2d25",
  },
  {
    key: "brown",
    label: "Brown",
    primary: "#8f5e45",
    primaryDark: "#613e2e",
    primaryRgb: "143, 94, 69",
    secondary: "#eaded8",
    secondaryRgb: "234, 222, 216",
    accentText: "#664b3e",
    panelStart: "#fffaf4",
    panelEnd: "#eaded8",
    dark: "#4b3a31",
    darkEnd: "#332821",
  },
  {
    key: "dark",
    label: "Dark",
    primary: "#d65a70",
    primaryDark: "#9d2f45",
    primaryRgb: "214, 90, 112",
    secondary: "#2f3a46",
    secondaryRgb: "47, 58, 70",
    accentText: "#f0a5b2",
    panelStart: "#20242d",
    panelEnd: "#2f3a46",
    dark: "#171a21",
    darkEnd: "#0f1117",
    pageStart: "#111318",
    pageEnd: "#1b1f29",
    surface: "rgba(31, 35, 44, 0.9)",
    surfaceStrong: "rgba(39, 44, 55, 0.94)",
    text: "#f8efe8",
    muted: "#cfc3ba",
    line: "#45414a",
    shadow: "0 18px 45px rgba(0, 0, 0, 0.32)",
  },
];

function getThemeStyle(theme: ThemePalette): CSSProperties {
  return {
    "--theme-primary": theme.primary,
    "--theme-primary-dark": theme.primaryDark,
    "--theme-primary-rgb": theme.primaryRgb,
    "--theme-secondary": theme.secondary,
    "--theme-secondary-rgb": theme.secondaryRgb,
    "--theme-accent-text": theme.accentText,
    "--theme-panel-start": theme.panelStart,
    "--theme-panel-end": theme.panelEnd,
    "--theme-dark": theme.dark,
    "--theme-dark-end": theme.darkEnd,
    "--theme-page-start": theme.pageStart || "#fcfbf9",
    "--theme-page-end": theme.pageEnd || "#fcfbf9",
    "--theme-surface": theme.surface || "rgba(255, 255, 255, 0.84)",
    "--theme-surface-strong":
      theme.surfaceStrong || "rgba(255, 255, 255, 0.9)",
    "--theme-text": theme.text || "#3f332d",
    "--theme-muted": theme.muted || "#7a6b63",
    "--theme-line": theme.line || "#eaded8",
    "--theme-shadow":
      theme.shadow || "0 18px 45px rgba(92, 73, 61, 0.12)",
  } as CSSProperties;
}

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

  const [profile, setProfile] = useState<WeddingProfile>(
    DEFAULT_WEDDING_PROFILE,
  );
  const [task, setTask] = useState("");
  const [revisionChange, setRevisionChange] = useState("");
  const [options, setOptions] = useState<RequestOptions>(defaultOptions);
  const [revisions, setRevisions] = useState<StoredSessionOutput[]>([]);
  const [savedRevisions, setSavedRevisions] = useState<StoredSessionOutput[]>(
    [],
  );
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
  const [customVendor, setCustomVendor] =
    useState<VendorSuggestion>(emptyVendorDraft);
  const [customBudgetCategory, setCustomBudgetCategory] = useState("");
  const [customBudgetAmount, setCustomBudgetAmount] = useState("");
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editingVendorIndex, setEditingVendorIndex] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [isSavingSurvey, setIsSavingSurvey] = useState(false);
  const [isEditingSurvey, setIsEditingSurvey] = useState(false);
  const [showSurveySummary, setShowSurveySummary] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>("romantic");
  const [isVendorChatOpen, setIsVendorChatOpen] = useState(false);
  const [vendorChatScreen, setVendorChatScreen] = useState<"chat" | "saved">(
    "chat",
  );
  const [vendorChatMessages, setVendorChatMessages] = useState<ChatEntry[]>([
    { role: "assistant", content: VENDOR_CHAT_INITIAL_MESSAGE },
  ]);
  const [vendorChatInput, setVendorChatInput] = useState("");
  const [isVendorChatLoading, setIsVendorChatLoading] = useState(false);
  const [vendorChatError, setVendorChatError] = useState<string | null>(null);
  const [savedVendors, setSavedVendors] = useState<SavedVendor[]>([]);
  const deleteToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskEditedRef = useRef(false);
  const authTokenRef = useRef<string | null>(null);

  const currentStep = Math.min(
    profile.surveyStep,
    weddingSurveySchema.length - 1,
  );
  const currentQuestion = weddingSurveySchema[currentStep];
  const isOnboardingComplete =
    isWeddingProfileComplete(profile) && profile.onboardingComplete;
  const isSurveyMode = !isOnboardingComplete || isEditingSurvey;
  const canJumpBetweenQuestions = isOnboardingComplete && isEditingSurvey;
  const budgetSnapshot = useMemo(
    () => calculateWeddingBudget(profile),
    [profile],
  );
  const planTotal = useMemo(
    () =>
      output?.budgetBreakdown.reduce(
        (total, item) => total + getBudgetAmount(item),
        0,
      ) ?? 0,
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
  const activeTheme =
    themePalettes.find((theme) => theme.key === selectedTheme) ||
    themePalettes[0];
  const themeStyle = useMemo(() => getThemeStyle(activeTheme), [activeTheme]);

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
    setSelectedTheme("romantic");
    setIsGenerating(false);
    setAvatarStatus(null);
    setIsVendorChatOpen(false);
    setVendorChatScreen("chat");
    setVendorChatMessages([
      { role: "assistant", content: VENDOR_CHAT_INITIAL_MESSAGE },
    ]);
    setVendorChatInput("");
    setIsVendorChatLoading(false);
    setVendorChatError(null);
    setSavedVendors([]);
    authTokenRef.current = null;
    taskEditedRef.current = false;
  }

  function updateBaseTask(value: string) {
    taskEditedRef.current = true;
    setTask(value);
  }

  function applySession(session: Session | null) {
    const nextToken = session?.access_token || null;
    if (session) {
      setAuthError(null);
      setIsSigningIn(false);
      if (nextToken !== authTokenRef.current) {
        setPlannerDataReady(false);
      }
    }
    setAuthUser(session?.user ? mapPlannerAuthUser(session.user) : null);
    setAuthToken(nextToken);
    authTokenRef.current = nextToken;
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
    if (
      !isOnboardingComplete ||
      output ||
      taskEditedRef.current ||
      task.trim()
    ) {
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

        const [profileRes, docsRes, plansRes, savedVendorsRes] =
          await Promise.all([
            fetchWithToken("/api/profile"),
            fetchWithToken("/api/knowledge"),
            fetchWithToken("/api/plans"),
            fetchWithToken("/api/saved-vendors"),
          ]);

        if (!active) return;

        if (profileRes.ok) {
          const data = (await profileRes.json()) as {
            profile: WeddingProfile | null;
          };
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

        if (savedVendorsRes.ok) {
          const data = (await savedVendorsRes.json()) as {
            vendors: SavedVendor[];
          };
          setSavedVendors(data.vendors);
        }
      } catch (loadError) {
        if (!active) return;
        setError(
          `Could not load planner data: ${(loadError as Error).message}`,
        );
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
      surveyStep: Math.max(
        0,
        Math.min(nextStep, weddingSurveySchema.length - 1),
      ),
      onboardingComplete: isEditingSurvey ? profile.onboardingComplete : false,
    });
    await persistProfile(nextProfile, "Survey progress saved.");
  }

  async function handleNextSurveyStep() {
    const partialValidation = validateWeddingProfile(profile, {
      allowIncomplete: true,
    });
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
      options: { ...options, citeSources: true },
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
      setError(
        `Network error while planning: ${(submitError as Error).message}`,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendVendorChatMessage() {
    const content = vendorChatInput.trim();
    if (!content || isVendorChatLoading) return;

    const nextMessages: ChatEntry[] = [
      ...vendorChatMessages,
      { role: "user", content },
    ];
    setVendorChatMessages(nextMessages);
    setVendorChatInput("");
    setVendorChatError(null);
    setIsVendorChatLoading(true);

    try {
      const res = await authorizedFetch("/api/vendor-chat", {
        method: "POST",
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setVendorChatError(`Vendor chat failed (${res.status}): ${text}`);
        return;
      }

      const data = (await res.json()) as {
        message: string;
        vendors: VendorChatOption[];
      };

      setVendorChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message,
          vendors: data.vendors,
        },
      ]);
    } catch (chatError) {
      setVendorChatError((chatError as Error).message);
    } finally {
      setIsVendorChatLoading(false);
    }
  }

  async function saveChatVendor(vendor: VendorChatOption) {
    setVendorChatError(null);

    try {
      const res = await authorizedFetch("/api/saved-vendors", {
        method: "POST",
        body: JSON.stringify(vendor),
      });

      if (!res.ok) {
        const text = await res.text();
        setVendorChatError(`Could not save vendor (${res.status}): ${text}`);
        return;
      }

      const data = (await res.json()) as { vendor: SavedVendor };
      setSavedVendors((current) => [
        data.vendor,
        ...current.filter((item) => item.id !== data.vendor.id),
      ]);
    } catch (saveError) {
      setVendorChatError((saveError as Error).message);
    }
  }

  async function removeSavedVendor(id: string) {
    const previous = savedVendors;
    setSavedVendors((current) => current.filter((vendor) => vendor.id !== id));
    setVendorChatError(null);

    try {
      const res = await authorizedFetch(`/api/saved-vendors/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        setVendorChatError(`Could not remove vendor (${res.status}): ${text}`);
        setSavedVendors(previous);
      }
    } catch (removeError) {
      setVendorChatError((removeError as Error).message);
      setSavedVendors(previous);
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

    const url = editingDocId
      ? `/api/knowledge/${editingDocId}`
      : "/api/knowledge";
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
        vendorSuggestions: current.vendorSuggestions.map(
          (vendor, vendorIndex) =>
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
      setError(
        "Enter a custom budget category and a single non-negative number.",
      );
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
      <div className="rounded-lg border border-dashed border-[#cab8af] bg-white/80 p-3 shadow-sm">
        <p className="text-sm font-medium">Add Custom Vendor</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="romantic-muted text-xs font-medium">
            Category
            <select
              className="romantic-input mt-1 w-full px-2 py-2 text-sm"
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
          <label className="romantic-muted text-xs font-medium">
            Status
            <select
              className="romantic-input mt-1 w-full px-2 py-2 text-sm"
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
            className="romantic-input px-3 py-2 text-sm"
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
            className="romantic-input px-3 py-2 text-sm"
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
            className="romantic-input px-3 py-2 text-sm"
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
            className="romantic-input px-3 py-2 text-sm"
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
            className="romantic-input px-3 py-2 text-sm"
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
          className="romantic-button-primary mt-2 px-3 py-2 text-sm font-medium"
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

    const res = await authorizedFetch(`/api/knowledge/${id}`, {
      method: "DELETE",
    });
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
      setKnowledgeDocs((docs) =>
        docs.filter((doc) => doc.id !== noteToRestore.id),
      );
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
      <main
        className="romantic-page flex min-h-screen items-center justify-center text-[#5f5149]"
        style={themeStyle}
      >
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
      <main
        className="romantic-page flex min-h-screen items-center justify-center text-[#5f5149]"
        style={themeStyle}
      >
        <Spinner label="Loading your wedding planner..." />
      </main>
    );
  }

  if (showSurveySummary) {
    return (
      <main
        className="romantic-page min-h-screen p-6 text-[#3f332d]"
        style={themeStyle}
      >
        <div className="mx-auto max-w-6xl">
          <AuthenticatedTopBar
            user={authUser}
            onSignOut={handleSignOut}
            onUploadAvatar={handleAvatarUpload}
            isSigningOut={isSigningOut}
            selectedTheme={selectedTheme}
            onThemeChange={setSelectedTheme}
          />
        </div>
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl items-center justify-center">
          <section className="romantic-card w-full p-8">
            <p className="romantic-eyebrow">Survey Complete</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight">
              Your planning profile is ready.
            </h1>
            <p className="romantic-muted mt-3 max-w-2xl text-base">
              The planner will use these details to keep recommendations
              grounded in your budget, guest count, priorities, and constraints.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <SummaryTile
                label="Budget"
                value={`$${profile.totalBudget.toLocaleString()}`}
              />
              <SummaryTile label="Guests" value={String(profile.guestCount)} />
              <SummaryTile
                label="Location"
                value={profile.location || "Not set"}
              />
              <SummaryTile
                label="Budget / Guest"
                value={`$${budgetSnapshot.budgetPerGuest}`}
              />
              <SummaryTile
                label="Priorities"
                value={
                  profile.priorities.map(formatPriorityLabel).join(", ") ||
                  "None"
                }
              />
              <SummaryTile label="Style" value={profile.style || "Not set"} />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setShowSurveySummary(false)}
                className="romantic-button-primary px-4 py-2"
              >
                Start planning
              </button>
              <button
                onClick={() => {
                  setShowSurveySummary(false);
                  setIsEditingSurvey(true);
                }}
                className="romantic-button-secondary px-4 py-2"
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
      <main
        className="romantic-page min-h-screen p-6 text-[#3f332d]"
        style={themeStyle}
      >
        <div className="mx-auto max-w-6xl">
          <AuthenticatedTopBar
            user={authUser}
            onSignOut={handleSignOut}
            onUploadAvatar={handleAvatarUpload}
            isSigningOut={isSigningOut}
            selectedTheme={selectedTheme}
            onThemeChange={setSelectedTheme}
          />
          {avatarStatus && (
            <p className="romantic-muted mt-3 text-sm">{avatarStatus}</p>
          )}
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
              <aside className="romantic-card self-start p-5">
                <p className="romantic-eyebrow">Survey Map</p>
                <h2 className="mt-2 text-xl font-semibold">
                  Jump to a question
                </h2>
                <p className="romantic-muted mt-2 text-sm">
                  Available only in edit mode after the survey has been
                  completed.
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
                            ? "border-[#d98c9a] bg-[#f6dfe4] text-[#7c5960]"
                            : "border-[#eaded8] bg-white/80 text-[#5f5149]"
                        }`}
                      >
                        <span className="block text-xs uppercase tracking-wide text-[#9a8a82]">
                          Step {index + 1}
                        </span>
                        <span className="mt-1 block font-medium">
                          {question.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

            <div className="romantic-card self-start p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="romantic-eyebrow">Budget Wedding Planner</p>
                  <h1 className="mt-3 text-4xl font-semibold leading-tight">
                    {isOnboardingComplete
                      ? "Edit your wedding survey"
                      : "Start with the wedding survey"}
                  </h1>
                  <p className="romantic-muted mt-3 max-w-2xl text-base">
                    {isOnboardingComplete
                      ? "Update any answer and continue. Your saved profile and planner context will refresh when you finish."
                      : "Answer one question at a time. Sign-in is already complete, so this is the only thing to focus on before planning begins."}
                  </p>
                </div>
                <span className="romantic-chip shrink-0 px-4 py-2 text-sm font-medium">
                  Step {currentStep + 1} of {weddingSurveySchema.length}
                </span>
              </div>

              <div className="mt-6">
                <ProgressBar
                  current={currentStep + 1}
                  total={weddingSurveySchema.length}
                />
              </div>

              <div className="romantic-panel mt-8 p-6">
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

              <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-lg border border-[#eaded8] bg-white/90 p-3 shadow-sm backdrop-blur">
                <button
                  disabled={currentStep === 0 || isSavingSurvey}
                  onClick={() => void goToSurveyStep(currentStep - 1)}
                  className="romantic-button-secondary px-4 py-2 disabled:opacity-50"
                >
                  Back
                </button>
                <div className="flex gap-3">
                  {isOnboardingComplete && isEditingSurvey && (
                    <button
                      disabled={isSavingSurvey}
                      onClick={() => setIsEditingSurvey(false)}
                      className="romantic-button-secondary px-4 py-2 disabled:opacity-50"
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
                    className="romantic-button-secondary px-4 py-2 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    disabled={isSavingSurvey}
                    onClick={() => void handleNextSurveyStep()}
                    className="romantic-button-primary px-4 py-2 disabled:opacity-50"
                  >
                    {currentStep === weddingSurveySchema.length - 1
                      ? "Finish"
                      : "Next"}
                  </button>
                </div>
              </div>

              {surveyStatus && (
                <p className="romantic-muted mt-4 text-sm">{surveyStatus}</p>
              )}
              {(error || authError) && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error || authError}
                </div>
              )}
            </div>

            <aside className="romantic-floral-dark self-start p-8">
              <h2 className="text-2xl font-semibold">Live planning snapshot</h2>
              <p className="mt-3 text-sm text-[#fffaf4]/75">
                These numbers update as you answer the survey so you can see how
                your constraints shape the plan.
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
                  value={
                    profile.guestCount > 0
                      ? String(profile.guestCount)
                      : "Not set"
                  }
                />
                <InfoRow
                  label="Budget / Guest"
                  value={
                    profile.totalBudget > 0 && profile.guestCount > 0
                      ? `$${budgetSnapshot.budgetPerGuest}`
                      : "Not set"
                  }
                />
                <InfoRow
                  label="Location"
                  value={profile.location || "Not set"}
                />
                <InfoRow label="Season" value={profile.season || "Not set"} />
                <InfoRow label="Style" value={profile.style || "Not set"} />
              </div>
              <div className="mt-6 rounded-lg bg-white/10 p-4">
                <h3 className="font-medium">Protected priorities</h3>
                <p className="mt-2 text-sm text-[#fffaf4]/75">
                  {profile.priorities.map(formatPriorityLabel).join(", ") ||
                    "None"}
                </p>
              </div>
              <div className="mt-6 space-y-3">
                {budgetSnapshot.tradeoffs.length > 0 ? (
                  budgetSnapshot.tradeoffs.map((item, index) => (
                    <div
                      key={index}
                      className="rounded-lg bg-white/10 p-3 text-sm text-[#fffaf4]/85"
                    >
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-white/10 p-3 text-sm text-[#fffaf4]/75">
                    Tradeoffs will appear as your budget and guest count become
                    clearer.
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
    <main className="romantic-page min-h-screen text-[#3f332d]" style={themeStyle}>
      <div className="mx-auto max-w-7xl p-6">
        <AuthenticatedTopBar
          user={authUser}
          onSignOut={handleSignOut}
          onUploadAvatar={handleAvatarUpload}
          isSigningOut={isSigningOut}
          selectedTheme={selectedTheme}
          onThemeChange={setSelectedTheme}
        />
        {avatarStatus && (
          <p className="romantic-muted mt-3 text-sm">{avatarStatus}</p>
        )}

        <header className="romantic-panel mt-6 p-7">
          <p className="romantic-eyebrow">Budget Wedding Planner</p>
          <h1 className="mt-2 text-4xl font-semibold">
            Plan a wedding that fits real constraints.
          </h1>

          <div className="mt-4">
            <button
              onClick={() => setIsEditingSurvey(true)}
              className="romantic-button-secondary px-4 py-2 text-sm font-semibold"
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
          <div className="romantic-card p-6">
            <h2 className="text-xl font-semibold">Planner</h2>
            <p className="romantic-muted mt-1 text-sm leading-6">
              Tell the planner what kind of wedding plan you want. It will use
              your saved survey answers and notes automatically, including
              vendor quotes, constraints, and priorities.
            </p>

            {!isOnboardingComplete && (
              <div className="mt-4 rounded-lg border border-[#ead7a8] bg-[#fff8dc] p-3 text-sm text-[#7a5b27]">
                Finish the survey before generating a planning response.
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-[var(--theme-text)]">
              Planning request
            </label>
            <p className="romantic-muted mt-1 text-sm leading-6">
              Start with the suggested request or replace it with your own
              instructions. Mention goals like budget limits, guest count,
              must-haves, tradeoffs, or vendor categories that need attention.
            </p>
            <textarea
              className="romantic-input mt-2 h-36 w-full p-4 text-sm leading-6"
              value={task}
              onChange={(e) => {
                updateBaseTask(e.target.value);
              }}
              disabled={Boolean(output)}
              placeholder={DEFAULT_PLANNING_REQUEST}
            />

            {output && (
              <>
                <label className="mt-4 block text-sm font-medium text-[var(--theme-text)]">
                  Revise this plan
                </label>
                <p className="romantic-muted mt-1 text-sm leading-6">
                  Use this for follow-up changes after a plan is generated.
                  Describe only what should change; the rest of the existing
                  plan will be treated as context.
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
              <label className="flex items-center gap-2 text-[var(--theme-text)]">
                <input
                  type="checkbox"
                  checked={Boolean(options.ragDebug)}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      ragDebug: e.target.checked,
                    }))
                  }
                />
                Show retrieval debug details
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                disabled={!canSubmit}
                onClick={() => void submitRequest()}
                className="romantic-button-primary px-4 py-2"
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
                    ? setRevisionChange(
                        "Make this cheaper without cutting food quality.",
                      )
                    : updateBaseTask(
                        "Build a cheaper plan without cutting food quality.",
                      )
                }
              />
              <QuickAction
                label="Adjust for 120 guests"
                onClick={() =>
                  output
                    ? setRevisionChange(
                        "Adjust this plan for 120 guests and show tradeoffs.",
                      )
                    : updateBaseTask(
                        "Build a plan for 120 guests and show tradeoffs.",
                      )
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
            <p className="romantic-muted mt-3 text-sm">
              Use the shortcut buttons to autofill common requests, then edit
              the wording before generating or revising.
            </p>
          </div>

          <div className="romantic-card p-6">
            <h2 className="text-xl font-semibold">Notes</h2>
            <p className="romantic-muted mt-1 text-sm leading-6">
              Add vendor quotes, local venue quotes, vendor restrictions, family
              constraints, accessibility needs, or other planning notes for
              retrieval.
            </p>

            <FormField
              label="Source name"
              value={knowledgeSource}
              onChange={setKnowledgeSource}
            />
            <label className="mt-3 block text-sm font-medium text-[var(--theme-text)]">
              Notes
            </label>
            <textarea
              className="romantic-input mt-2 h-32 w-full p-4 text-sm leading-6"
              value={knowledgeContent}
              onChange={(e) => setKnowledgeContent(e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void upsertKnowledgeDoc()}
                className="romantic-button-primary px-4 py-2"
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
                  className="romantic-button-secondary px-4 py-2"
                >
                  Cancel
                </button>
              )}
            </div>

            {knowledgeStatus && (
              <p className="romantic-muted mt-2 text-sm">{knowledgeStatus}</p>
            )}

            <div className="mt-4 space-y-2">
              {knowledgeDocs.length === 0 ? (
                <p className="romantic-muted text-sm">No local notes yet.</p>
              ) : (
                knowledgeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-[#eaded8] bg-white/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{doc.source}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(doc.createdAt).toLocaleString()} | indexed:{" "}
                          {doc.hasEmbedding ? "yes" : "no"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => beginEditDoc(doc)}
                          className="romantic-button-secondary px-3 py-1 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void removeKnowledgeDoc(doc.id)}
                          className="romantic-button-secondary px-3 py-1 text-sm"
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

        <section className="romantic-card mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Your Personalized Wedding Plan
              </h2>
              {saveStatus && (
                <p className="romantic-muted mt-1 text-sm">{saveStatus}</p>
              )}
            </div>
            {output && (
              <button
                onClick={() => void saveCurrentPlan()}
                className="romantic-button-secondary px-4 py-2 text-sm font-semibold"
              >
                Save plan
              </button>
            )}
          </div>
          {!output ? (
            <div className="mt-3">
              <p className="romantic-muted text-sm">
                No plan yet. Finish the survey and generate your first plan.
              </p>
              {latestSavedRevision && (
                <div className="romantic-panel mt-4 p-4">
                  <p className="font-medium text-[#7c5960]">
                    Resume where you left off?
                  </p>
                  <p className="mt-1 text-sm text-[#7c5960]">
                    Last saved{" "}
                    {new Date(latestSavedRevision.createdAt).toLocaleString()}.
                  </p>
                  <button
                    onClick={() => resumeSavedPlan(latestSavedRevision)}
                    className="romantic-button-primary mt-3 px-4 py-2 text-sm font-semibold"
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
                <p className="romantic-muted mb-3 text-xs">
                  Stated budget: ${profile.totalBudget.toLocaleString()}
                </p>
                <p className="romantic-muted text-sm leading-6">
                  {output.summary}
                </p>
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
                    className="romantic-button-secondary px-3 py-1 text-sm font-medium"
                  >
                    {isEditingBudget ? "Done" : "Edit"}
                  </button>
                }
              >
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
                  {output.budgetBreakdown.map((item, index) => (
                    <div
                      key={item.category}
                      className="rounded-lg border border-[#eaded8] bg-[#fcfbf9]/80 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.category}</p>
                        {isEditingBudget ? (
                          <label className="flex items-center gap-2 text-sm text-[#5f5149]">
                            $
                            <input
                              className="romantic-input w-28 px-2 py-1 text-right"
                              type="number"
                              min={0}
                              value={getBudgetAmount(item)}
                              onChange={(event) =>
                                updateBudgetItem(
                                  index,
                                  event.target.value === ""
                                    ? 0
                                    : Number(event.target.value),
                                )
                              }
                            />
                          </label>
                        ) : (
                          <p className="text-sm font-semibold text-[#3f332d]">
                            {formatCurrency(getBudgetAmount(item))}
                          </p>
                        )}
                      </div>
                      <p className="romantic-muted mt-1 text-sm">
                        {item.rationale}
                      </p>
                    </div>
                  ))}
                  {isEditingBudget && (
                    <div className="rounded-lg border border-dashed border-[#cab8af] bg-white/80 p-3 shadow-sm">
                      <p className="text-sm font-medium">
                        Add Custom Budget Section
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                        <input
                          className="romantic-input px-3 py-2 text-sm"
                          placeholder="Section name"
                          value={customBudgetCategory}
                          onChange={(event) =>
                            setCustomBudgetCategory(event.target.value)
                          }
                        />
                        <input
                          className="romantic-input px-3 py-2 text-sm"
                          placeholder="Amount"
                          type="number"
                          min={0}
                          value={customBudgetAmount}
                          onChange={(event) =>
                            setCustomBudgetAmount(event.target.value)
                          }
                        />
                        <button
                          type="button"
                          onClick={addCustomBudgetSection}
                          className="romantic-button-primary px-3 py-2 text-sm font-medium"
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
                    <p className="romantic-muted text-sm">
                      Add vendor quotes, contracted vendors, or venue details in
                      Notes to populate the vendor tracker.
                    </p>
                    {renderCustomVendorForm()}
                    {vendorStatus && (
                      <p className="romantic-muted text-sm">{vendorStatus}</p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[520px] space-y-3 overflow-y-auto pr-2">
                    {output.vendorSuggestions.map((vendor, index) => (
                      <div
                        key={`${vendor.category}-${vendor.name}`}
                        className="rounded-lg border border-[#eaded8] bg-[#fcfbf9]/80 p-3 shadow-sm"
                      >
                        {editingVendorIndex === index ? (
                          <>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="romantic-muted text-xs font-medium">
                                Category
                                <select
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.category}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      category: event.target.value,
                                    })
                                  }
                                >
                                  {vendorCategories.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Status
                                <select
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.status}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      status: event.target
                                        .value as VendorSuggestion["status"],
                                    })
                                  }
                                >
                                  <option value="contracted">Contracted</option>
                                  <option value="not_contracted">
                                    Needs contract
                                  </option>
                                </select>
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Vendor
                                <input
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.name}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      name: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Price
                                <input
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.priceEstimate}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      priceEstimate: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Contact
                                <input
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  placeholder="Email, phone, Instagram"
                                  value={vendor.contact}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      contact: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Region
                                <input
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.region}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      region: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="romantic-muted text-xs font-medium">
                                Source
                                <input
                                  className="romantic-input mt-1 w-full px-2 py-2 text-sm"
                                  value={vendor.source}
                                  onChange={(event) =>
                                    updateVendor(index, {
                                      source: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label className="romantic-muted mt-2 block text-xs font-medium">
                              Notes
                              <textarea
                                className="romantic-input mt-1 h-20 w-full px-2 py-2 text-sm"
                                value={vendor.whyItFits}
                                onChange={(event) =>
                                  updateVendor(index, {
                                    whyItFits: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void confirmVendor(vendor)}
                                className="romantic-button-primary px-3 py-2 text-sm font-medium"
                              >
                                Confirm and Save to Notes
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingVendorIndex(null)}
                                className="romantic-button-secondary px-3 py-2 text-sm font-medium"
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
                                  <p className="text-lg font-semibold text-[#7c5960]">
                                    {vendor.category}
                                  </p>
                                  <span
                                    className={`rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide ${
                                      vendor.status === "contracted"
                                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border border-[#f0c6cd] bg-[#f6dfe4] text-[#7c5960]"
                                    }`}
                                  >
                                    {vendor.status === "contracted"
                                      ? "Contracted"
                                      : "Needs contract"}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-[#3f332d]">
                                  {vendor.name}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label={`Edit ${vendor.name || vendor.category}`}
                                onClick={() => setEditingVendorIndex(index)}
                                className="romantic-button-secondary inline-flex h-8 w-8 items-center justify-center p-0 text-[#5f5149]"
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
                                <dt className="text-xs font-medium uppercase tracking-wide text-[#9a8a82]">
                                  Price
                                </dt>
                                <dd className="text-[#5f5149]">
                                  {vendor.priceEstimate || "not provided"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-wide text-[#9a8a82]">
                                  Region
                                </dt>
                                <dd className="text-[#5f5149]">
                                  {vendor.region || "not provided"}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-[#9a8a82]">
                                  Contact
                                </dt>
                                <dd className="text-[#5f5149]">
                                  {vendor.contact || "not provided"}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-[#9a8a82]">
                                  Notes
                                </dt>
                                <dd className="line-clamp-3 text-[#5f5149]">
                                  {vendor.whyItFits || "No notes."}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-medium uppercase tracking-wide text-[#9a8a82]">
                                  Source
                                </dt>
                                <dd className="text-[#5f5149]">
                                  {vendor.source || "not provided"}
                                </dd>
                              </div>
                            </dl>
                          </>
                        )}
                      </div>
                    ))}
                    {renderCustomVendorForm()}
                    {vendorStatus && (
                      <p className="romantic-muted text-sm">{vendorStatus}</p>
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
                    userId: {userId || "pending"} | threadId:{" "}
                    {threadId || "pending"} | revisionId:{" "}
                    {sessionId || "pending"}
                  </p>
                )}
              </SectionCard>
              <SectionCard title="Prompt Debug">
                <details>
                  <summary className="cursor-pointer font-medium">
                    View assembled prompt
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                    {latestPrompt || "(no prompt yet)"}
                  </pre>
                </details>
                {ragDebug?.enabled && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-medium">
                      View retrieval debug
                    </summary>
                    <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                      {JSON.stringify(ragDebug, null, 2)}
                    </pre>
                  </details>
                )}
              </SectionCard>
            </div>
          )}
        </section>
        <VendorChatLauncher
          isOpen={isVendorChatOpen}
          screen={vendorChatScreen}
          messages={vendorChatMessages}
          userAvatarUrl={profile.avatarUrl || authUser.avatarUrl}
          userName={authUser.name || authUser.email || profile.partnerNames}
          input={vendorChatInput}
          isLoading={isVendorChatLoading}
          error={vendorChatError}
          savedVendors={savedVendors}
          onOpen={() => setIsVendorChatOpen(true)}
          onClose={() => setIsVendorChatOpen(false)}
          onScreenChange={setVendorChatScreen}
          onInputChange={setVendorChatInput}
          onSend={() => void sendVendorChatMessage()}
          onSaveVendor={(vendor) => void saveChatVendor(vendor)}
          onRemoveVendor={(id) => void removeSavedVendor(id)}
        />
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

function VendorChatLauncher({
  isOpen,
  screen,
  messages,
  userAvatarUrl,
  userName,
  input,
  isLoading,
  error,
  savedVendors,
  onOpen,
  onClose,
  onScreenChange,
  onInputChange,
  onSend,
  onSaveVendor,
  onRemoveVendor,
}: {
  isOpen: boolean;
  screen: "chat" | "saved";
  messages: ChatEntry[];
  userAvatarUrl?: string;
  userName?: string;
  input: string;
  isLoading: boolean;
  error: string | null;
  savedVendors: SavedVendor[];
  onOpen: () => void;
  onClose: () => void;
  onScreenChange: (screen: "chat" | "saved") => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSaveVendor: (vendor: VendorChatOption) => void;
  onRemoveVendor: (id: string) => void;
}) {
  const savedUrls = new Set(
    savedVendors.map((vendor) => vendor.websiteUrl.toLowerCase()),
  );

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-6 right-6 z-40 rounded-lg border border-[#d98c9a]/40 bg-white/90 px-5 py-4 text-sm font-semibold text-[#3f332d] shadow-2xl shadow-[#d98c9a]/20 ring-4 ring-[#f6dfe4]/70 backdrop-blur"
      >
        <span className="block text-left text-base">Find Vendors</span>
        <span className="block text-xs font-medium text-[#9f6d74]">
          Search and save options
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[min(760px,calc(100vh-3rem))] w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[#eaded8] bg-white/95 shadow-2xl shadow-[#5c493d]/20 backdrop-blur">
      <div className="border-b border-[#eaded8] bg-[linear-gradient(135deg,#fffaf4,#f6dfe4_58%,#ebe4f6)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="romantic-eyebrow">Vendor Research</p>
            <p className="mt-1 text-3xl font-semibold text-[#3f332d]">
              Find Vendors
            </p>
            <p className="romantic-muted mt-1 max-w-md text-sm">
              Search public vendor websites using your saved wedding profile,
              plan, and notes, then star the options you want to keep.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close find vendors panel"
            className="romantic-button-secondary px-3 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => onScreenChange("chat")}
            className={`rounded-lg px-4 py-2 font-medium shadow-sm ${
              screen === "chat"
                ? "romantic-button-primary"
                : "romantic-button-secondary"
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => onScreenChange("saved")}
            className={`rounded-lg px-4 py-2 font-medium shadow-sm ${
              screen === "saved"
                ? "romantic-button-primary"
                : "romantic-button-secondary"
            }`}
          >
            Saved Vendors
          </button>
        </div>
      </div>

      {screen === "chat" ? (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fcfbf9] p-5">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex items-start gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && <ChatBotIcon />}
                <div
                  className={`max-w-[calc(100%-3rem)] rounded-lg p-4 text-sm shadow-sm ${
                    message.role === "user"
                      ? "border border-[#f6dfe4] bg-white text-[#3f332d]"
                      : "border border-[#eaded8] bg-white text-[#5f5149]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.vendors?.length ? (
                    <div className="mt-4 grid gap-3">
                      {message.vendors.map((vendor) => {
                        const isSaved = savedUrls.has(
                          vendor.websiteUrl.toLowerCase(),
                        );
                        return (
                          <div
                            key={`${vendor.name}-${vendor.websiteUrl}`}
                            className="rounded-lg border border-[#f6dfe4] bg-[#fffaf4] p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-[#3f332d]">
                                  {vendor.name}
                                </p>
                                <p className="text-xs uppercase tracking-wide text-[#9f6d74]">
                                  {vendor.category} | {vendor.region}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => onSaveVendor(vendor)}
                                disabled={isSaved}
                                className="romantic-button-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"
                              >
                                {isSaved ? "Starred" : "Star"}
                              </button>
                            </div>
                            <p className="romantic-muted mt-2 text-sm">
                              {vendor.description}
                            </p>
                            <a
                              href={vendor.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block break-all text-sm font-medium text-[#9f6d74] underline"
                            >
                              {vendor.websiteUrl}
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {message.role === "user" && (
                  <UserChatIcon avatarUrl={userAvatarUrl} name={userName} />
                )}
              </div>
            ))}
            {isLoading && <Spinner label="Searching vendors..." />}
          </div>
          <div className="border-t border-[#eaded8] bg-white p-4">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Try: floral arrangements in my area"
                className="romantic-input min-w-0 flex-1 px-4 py-3 text-sm"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={isLoading || !input.trim()}
                className="romantic-button-primary px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fcfbf9] p-5">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {savedVendors.length === 0 ? (
            <p className="romantic-muted rounded-lg border border-[#eaded8] bg-white p-4 text-sm shadow-sm">
              Star vendors from chat to save them here.
            </p>
          ) : (
            <div className="space-y-3">
              {savedVendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="rounded-lg border border-[#eaded8] bg-white p-4 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#3f332d]">
                        {vendor.name}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-[#9f6d74]">
                        {vendor.category} | {vendor.region}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveVendor(vendor.id)}
                      className="romantic-button-secondary px-3 py-2 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="romantic-muted mt-2">{vendor.description}</p>
                  <a
                    href={vendor.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block break-all font-medium text-[#9f6d74] underline"
                  >
                    {vendor.websiteUrl}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatBotIcon() {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d98c9a]/35 bg-white text-[#3f332d] shadow-sm ring-2 ring-[#f6dfe4]">
      <span className="absolute -top-1.5 left-1/2 h-2.5 w-px -translate-x-1/2 bg-[#d98c9a]" />
      <span className="absolute -top-2.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#d98c9a]" />
      <svg
        aria-hidden="true"
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5.5" y="7" width="13" height="11" rx="3" fill="#fff1f2" />
        <path d="M5.5 12H4M20 12h-1.5" />
        <circle cx="9.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <path d="M10 15.2h4" />
        <path d="M8.5 7V5.8M15.5 7V5.8" />
        <path d="M9 19h6" />
      </svg>
      <span className="sr-only">Chatbot</span>
    </div>
  );
}

function UserChatIcon({
  avatarUrl,
  name,
}: {
  avatarUrl?: string;
  name?: string;
}) {
  const fallback = (name || "You").trim().charAt(0).toUpperCase() || "Y";

  if (avatarUrl) {
    return (
      <div
        aria-label={`${name || "Your"} profile`}
        className="h-9 w-9 shrink-0 rounded-lg border border-[#f6dfe4] bg-cover bg-center shadow-sm"
        style={{ backgroundImage: `url("${avatarUrl}")` }}
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#f6dfe4] bg-[#f6dfe4] text-sm font-semibold text-[#7c5960] shadow-sm">
      {fallback}
    </div>
  );
}

function AuthenticatedTopBar({
  user,
  onSignOut,
  onUploadAvatar,
  isSigningOut,
  selectedTheme,
  onThemeChange,
}: {
  user: PlannerAuthUser;
  onSignOut: () => void;
  onUploadAvatar: (file: File) => Promise<void> | void;
  isSigningOut: boolean;
  selectedTheme: ThemeKey;
  onThemeChange: (theme: ThemeKey) => void;
}) {
  return (
    <div className="romantic-card relative z-40 flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="romantic-eyebrow">Signed in</p>
        <p className="romantic-muted mt-1 text-sm">
          Planner data, survey progress, and retrieval notes are scoped to your
          account.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ThemeSelector selectedTheme={selectedTheme} onThemeChange={onThemeChange} />
        <UserMenu
          user={user}
          onSignOut={onSignOut}
          onUploadAvatar={onUploadAvatar}
          isSigningOut={isSigningOut}
        />
      </div>
    </div>
  );
}

function ThemeSelector({
  selectedTheme,
  onThemeChange,
}: {
  selectedTheme: ThemeKey;
  onThemeChange: (theme: ThemeKey) => void;
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Theme options">
      {themePalettes.map((theme) => {
        const isActive = selectedTheme === theme.key;
        return (
          <button
            key={theme.key}
            type="button"
            aria-label={`Use ${theme.label} theme`}
            aria-pressed={isActive}
            onClick={() => onThemeChange(theme.key)}
            className={`h-9 w-9 rounded-full border bg-white p-1 shadow-sm transition ${
              isActive
                ? "border-[var(--theme-primary)] ring-4 ring-[rgba(var(--theme-primary-rgb),0.16)]"
                : "border-[#eaded8] hover:-translate-y-0.5 hover:shadow-md"
            }`}
          >
            <span
              className="block h-full w-full rounded-full"
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0 49%, ${theme.secondary} 50% 100%)`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Could not read the selected image."));
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
      <p className="romantic-eyebrow">
        {question.required ? "Required" : "Optional"}
      </p>
      <h3 className="mt-2 text-2xl font-semibold">{question.label}</h3>
      {question.description && (
        <p className="romantic-muted mt-2 text-sm">{question.description}</p>
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
  const baseClass = "romantic-input w-full p-4 text-base";

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
                active ? "romantic-button-primary" : "romantic-button-secondary"
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
      <div className="h-2 overflow-hidden rounded-full bg-[#eaded8]">
        <div
          className="h-full rounded-full bg-[#d98c9a]"
          style={{ width: percentage }}
        />
      </div>
      <p className="romantic-muted mt-2 text-xs">{percentage} complete</p>
    </div>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        className="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
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
      <label className="mt-3 block text-sm font-medium text-[var(--theme-text)]">
        {label}
      </label>
      <input
        className="romantic-input mt-1 w-full p-3"
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
      <label className="block text-sm font-medium text-[var(--theme-text)]">
        {label}
      </label>
      <textarea
        className="romantic-input mt-1 h-24 w-full p-3 text-sm"
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
      <label className="block text-sm font-medium text-[var(--theme-text)]">
        {label}
      </label>
      <select
        className="romantic-input mt-1 w-full p-3 text-sm"
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
    <div className="rounded-lg border border-[#eaded8] bg-white/70 p-4 shadow-sm">
      <p className="romantic-eyebrow">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#3f332d]">{value}</p>
    </div>
  );
}

function QuickAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="romantic-button-secondary px-4 py-2">
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
    <div className="rounded-lg border border-[#eaded8] bg-white/72 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function BulletList({
  items,
  emptyText = "None.",
}: {
  items: string[];
  emptyText?: string;
}) {
  if (!items.length) {
    return <p className="romantic-muted text-sm">{emptyText}</p>;
  }

  return (
    <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#5f5149]">
      {items.map((line, idx) => (
        <li key={`${line}-${idx}`}>{line}</li>
      ))}
    </ul>
  );
}

function RevisionList({ revisions }: { revisions: StoredSessionOutput[] }) {
  if (!revisions.length) {
    return <p className="romantic-muted text-sm">No revisions yet.</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-[#5f5149]">
      {revisions.map((revision, index) => (
        <li
          key={revision.id}
          className="rounded-lg border border-[#eaded8] bg-[#fcfbf9]/80 p-3"
        >
          <p className="font-medium">
            {index === revisions.length - 1 && !revision.revisionRequest
              ? "Initial plan"
              : revision.revisionRequest || "Initial plan"}
          </p>
          <p className="romantic-muted mt-1 text-xs">
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
      <span className="text-[#d9c8bf]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
