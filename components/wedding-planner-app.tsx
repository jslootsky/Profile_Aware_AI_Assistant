"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GenerateRequest,
  RagDebugInfo,
  RequestOptions,
  StructuredResponse,
  SurveyQuestion,
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

interface KnowledgeDocView {
  id: string;
  source: string;
  content: string;
  createdAt: string;
  hasEmbedding: boolean;
}

const defaultOptions: RequestOptions = {
  verbosity: "medium",
  reportType: "full-plan",
  citeSources: true,
  ragDebug: false,
};

export function WeddingPlannerApp() {
  const [profile, setProfile] = useState<WeddingProfile>(DEFAULT_WEDDING_PROFILE);
  const [task, setTask] = useState("");
  const [refinement, setRefinement] = useState("");
  const [options, setOptions] = useState<RequestOptions>(defaultOptions);
  const [history, setHistory] = useState<string[]>([]);
  const [output, setOutput] = useState<StructuredResponse | null>(null);
  const [latestPrompt, setLatestPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ragDebug, setRagDebug] = useState<RagDebugInfo | null>(null);
  const [knowledgeSource, setKnowledgeSource] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocView[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [isSavingSurvey, setIsSavingSurvey] = useState(false);

  const currentStep = Math.min(profile.surveyStep, weddingSurveySchema.length - 1);
  const currentQuestion = weddingSurveySchema[currentStep];
  const isOnboardingComplete =
    isWeddingProfileComplete(profile) && profile.onboardingComplete;
  const budgetSnapshot = useMemo(() => calculateWeddingBudget(profile), [profile]);
  const canSubmit = useMemo(
    () => isOnboardingComplete && task.trim().length > 0,
    [isOnboardingComplete, task],
  );

  async function loadKnowledgeDocs() {
    const res = await fetch("/api/knowledge");
    if (!res.ok) return;
    const data = (await res.json()) as { docs: KnowledgeDocView[] };
    setKnowledgeDocs(data.docs);
  }

  useEffect(() => {
    (async () => {
      try {
        const [profileRes] = await Promise.all([fetch("/api/profile"), loadKnowledgeDocs()]);
        if (!profileRes.ok) return;
        const data = (await profileRes.json()) as { profile: WeddingProfile | null };
        setProfile(mergeWeddingProfile(data.profile));
      } catch {
        setProfile(DEFAULT_WEDDING_PROFILE);
      }
    })();
  }, []);

  async function persistProfile(nextProfile: WeddingProfile, message?: string) {
    setIsSavingSurvey(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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

  async function goToSurveyStep(nextStep: number) {
    const nextProfile = mergeWeddingProfile({
      ...profile,
      surveyStep: Math.max(0, Math.min(nextStep, weddingSurveySchema.length - 1)),
      onboardingComplete: false,
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

      await persistProfile(
        fullValidation.profile,
        "Survey complete. Wedding planning is ready.",
      );
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
      refinement,
      options,
      history,
    };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        userId: string;
      };

      setLatestPrompt(data.prompt);
      setOutput(data.response);
      setSessionId(data.sessionId);
      setUserId(data.userId);
      setRagDebug(data.debug || null);

      const sourceText = refinement.trim() || task.trim();
      if (sourceText) {
        setHistory((prev) => [...prev, sourceText]);
      }
      if (refinement.trim()) {
        setRefinement("");
      }
    } catch (e) {
      setError(`Network error while planning: ${(e as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitFeedback(rating: "up" | "down") {
    if (!sessionId) {
      setError("Generate a plan first so there is a session to rate.");
      return;
    }

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, rating, feedback: "" }),
    });

    if (!res.ok) {
      const text = await res.text();
      setError(`Feedback failed (${res.status}): ${text}`);
    }
  }

  async function upsertKnowledgeDoc() {
    setKnowledgeStatus(null);
    if (!knowledgeSource.trim() || !knowledgeContent.trim()) {
      setKnowledgeStatus("Source and content are required.");
      return;
    }

    const url = editingDocId ? `/api/knowledge/${editingDocId}` : "/api/knowledge";
    const method = editingDocId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
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
    setKnowledgeStatus(`Saved vendor or venue note: ${data.source}.`);
    setKnowledgeSource("");
    setKnowledgeContent("");
    setEditingDocId(null);
    await loadKnowledgeDocs();
  }

  async function removeKnowledgeDoc(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      setKnowledgeStatus(`Delete failed (${res.status}): ${text}`);
      return;
    }
    setKnowledgeStatus("Knowledge note deleted.");
    await loadKnowledgeDocs();
  }

  function beginEditDoc(doc: KnowledgeDocView) {
    setEditingDocId(doc.id);
    setKnowledgeSource(doc.source);
    setKnowledgeContent(doc.content);
    setKnowledgeStatus(`Editing ${doc.source}`);
  }

  return (
    <main className="mx-auto max-w-7xl p-6 text-slate-900">
      <header className="rounded-3xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
          Budget Wedding Planner
        </p>
        <h1 className="mt-2 text-3xl font-bold">Plan a wedding that fits real constraints.</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">
          Start with the survey, save your wedding profile, then refine the plan as costs,
          guest count, and priorities change.
        </p>
      </header>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">1) Survey Onboarding</h2>
              <p className="mt-1 text-sm text-slate-600">
                Answer one question at a time. You can go back, and your progress is saved.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isOnboardingComplete
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              Step {currentStep + 1} of {weddingSurveySchema.length}
            </span>
          </div>

          <div className="mt-5">
            <ProgressBar current={currentStep + 1} total={weddingSurveySchema.length} />
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
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

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              disabled={currentStep === 0 || isSavingSurvey}
              onClick={() => void goToSurveyStep(currentStep - 1)}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex gap-3">
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
                Save progress
              </button>
              <button
                disabled={isSavingSurvey}
                onClick={() => void handleNextSurveyStep()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {currentStep === weddingSurveySchema.length - 1
                  ? "Finish survey"
                  : "Next question"}
              </button>
            </div>
          </div>

          {surveyStatus && <p className="mt-3 text-sm text-slate-600">{surveyStatus}</p>}
        </div>

        <aside className="rounded-3xl bg-slate-950 p-5 text-white shadow">
          <h2 className="text-xl font-semibold">Current Planning Snapshot</h2>
          <p className="mt-2 text-sm text-slate-300">
            The calculator updates live as you answer the survey.
          </p>
          <div className="mt-4 grid gap-3 text-sm">
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
              value={profile.totalBudget > 0 && profile.guestCount > 0
                ? `$${budgetSnapshot.budgetPerGuest}`
                : "Not set"}
            />
            <InfoRow label="Location" value={profile.location || "Not set"} />
            <InfoRow label="Season" value={profile.season || "Not set"} />
            <InfoRow label="Style" value={profile.style || "Not set"} />
          </div>
          <div className="mt-5 rounded-2xl bg-slate-900 p-4">
            <h3 className="font-medium">Protected priorities</h3>
            <p className="mt-2 text-sm text-slate-300">
              {profile.priorities.map(formatPriorityLabel).join(", ") || "None"}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {budgetSnapshot.tradeoffs.map((item, index) => (
              <div key={index} className="rounded-xl bg-slate-900 p-3 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold">2) Planner</h2>
          <p className="mt-1 text-sm text-slate-600">
            Follow-ups stay grounded in your saved wedding profile.
          </p>

          {!isOnboardingComplete && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Finish the survey before generating a planning response.
            </div>
          )}

          <label className="mt-4 block text-sm font-medium">Planning request</label>
          <textarea
            className="mt-1 h-32 w-full rounded-xl border p-3"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Build a practical wedding plan for our budget and guest count."
          />

          <label className="mt-4 block text-sm font-medium">Refinement</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            placeholder="Make this cheaper, adjust for 120 guests, prioritize food over decor."
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SelectField
              label="Verbosity"
              value={options.verbosity}
              onChange={(value) =>
                setOptions((prev) => ({
                  ...prev,
                  verbosity: value as RequestOptions["verbosity"],
                }))
              }
              options={["low", "medium", "high"]}
            />
            <SelectField
              label="Planner mode"
              value={options.reportType}
              onChange={(value) =>
                setOptions((prev) => ({
                  ...prev,
                  reportType: value as RequestOptions["reportType"],
                }))
              }
              options={["full-plan", "budget-revision", "vendor-shortlist"]}
            />
            <div className="flex items-end gap-4 text-sm">
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
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              disabled={!canSubmit}
              onClick={() => void submitRequest()}
              className="rounded-xl bg-rose-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {isGenerating ? <Spinner label="Planning..." /> : "Generate plan"}
            </button>
            <QuickAction
              label="Make this cheaper"
              onClick={() => setTask("Make this cheaper without cutting food quality.")}
            />
            <QuickAction
              label="Adjust for 120 guests"
              onClick={() => setTask("Adjust this plan for 120 guests and show tradeoffs.")}
            />
            <QuickAction
              label="Prioritize food over decor"
              onClick={() =>
                setTask("Rebalance the plan to prioritize food over decor and explain the tradeoffs.")
              }
            />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold">3) Local Venue / Vendor Notes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Add local venue quotes, vendor restrictions, or family constraints for retrieval.
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
        <h2 className="text-xl font-semibold">4) Wedding Plan Output</h2>
        {!output ? (
          <p className="mt-3 text-sm text-slate-500">
            No plan yet. Finish the survey and generate your first plan.
          </p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <SectionCard title="Summary">
              <p className="text-sm leading-6 text-slate-700">{output.summary}</p>
            </SectionCard>
            <SectionCard title="Tradeoffs">
              <BulletList items={output.tradeoffs} />
            </SectionCard>
            <SectionCard title="Budget Breakdown">
              <div className="space-y-3">
                {output.budgetBreakdown.map((item) => (
                  <div key={item.category} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.category}</p>
                      <p className="text-sm text-slate-700">
                        ${item.allocation.toLocaleString()} | {item.estimatedRange}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.rationale}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Vendor Suggestions">
              <div className="space-y-3">
                {output.vendorSuggestions.map((vendor) => (
                  <div key={`${vendor.category}-${vendor.name}`} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{vendor.name}</p>
                      <p className="text-sm text-slate-600">{vendor.priceEstimate}</p>
                    </div>
                    <p className="text-xs uppercase tracking-wide text-rose-700">
                      {vendor.category} | {vendor.region}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{vendor.whyItFits}</p>
                  </div>
                ))}
              </div>
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
              <BulletList items={history} emptyText="No prior refinements yet." />
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
                  userId: {userId || "pending"} | sessionId: {sessionId || "pending"}
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
    </main>
  );
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
      <div className="mt-5">
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

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border px-4 py-2">
      {label}
    </button>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <h3 className="font-semibold">{title}</h3>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
