"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GenerateRequest,
  RagDebugInfo,
  RequestOptions,
  StructuredResponse,
  UserProfile,
} from "@/lib/types";

interface KnowledgeDocView {
  id: string;
  source: string;
  content: string;
  createdAt: string;
  hasEmbedding: boolean;
}

const defaultProfile: UserProfile = {
  roleIndustry: "",
  goals: "",
  tone: "Professional and concise",
  constraints: "",
  preferredFormat: "report",
  dos: "",
  donts: "",
};

const defaultOptions: RequestOptions = {
  verbosity: "medium",
  reportType: "general",
  citeSources: true,
  ragDebug: false,
};

export function AssistantApp() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [task, setTask] = useState("");
  const [refinement, setRefinement] = useState("");
  const [options, setOptions] = useState<RequestOptions>(defaultOptions);
  const [history, setHistory] = useState<string[]>([]);
  const [output, setOutput] = useState<StructuredResponse | null>(null);
  const [latestPrompt, setLatestPrompt] = useState("");
  const [savedReports, setSavedReports] = useState<StructuredResponse[]>([]);
  //const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // const [citationView, setCitationView] = useState(true);
  const [userId, setUserId] = useState<string | null>(null); //for debugging / display purposes only; not user for auth since we have cookies
  const [isGenerating, setIsGenerating] = useState(false);
  const [ragDebug, setRagDebug] = useState<RagDebugInfo | null>(null);

  const [knowledgeSource, setKnowledgeSource] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocView[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => task.trim().length > 0, [task]);

  async function loadKnowledgeDocs() {
    const res = await fetch("/api/knowledge");
    if (!res.ok) return;
    const data = (await res.json()) as { docs: KnowledgeDocView[] };
    setKnowledgeDocs(data.docs);
  }

  useEffect(() => {
    (async () => {
      try {
        const [profileRes] = await Promise.all([
          fetch("/api/profile"),
          loadKnowledgeDocs(),
        ]);
        if (!profileRes.ok) return;
        const data = (await profileRes.json()) as {
          profile: UserProfile | null;
        };
        if (data.profile) setProfile(data.profile);
      } catch {}
    })();
  }, []);

  async function submitFeedback(rating: "up" | "down") {
    if (!sessionId) {
      setError("Generate a report first so there is a session to rate.");
      return;
    }

    setError(null);

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

  async function submitRequest() {
    if (isGenerating) return; //prevent multiple simultaneous submissions

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

      //if (!res.ok) return;

      if (!res.ok) {
        const text = await res.text();
        setError(`Generate failed (${res.status}): ${text}`);
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

      if (refinement.trim()) {
        setHistory((prev) => [...prev, refinement.trim()]);
        setRefinement("");
      }
    } catch (e) {
      setError(
        "Network error while generating. Try again. error: " +
          (e as Error).message,
      );
    } finally {
      setIsGenerating(false);
    }
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
    setKnowledgeStatus(`Saved knowledge source: ${data.source}.`);
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
    setKnowledgeStatus("Knowledge source deleted.");
    if (editingDocId === id) {
      setEditingDocId(null);
      setKnowledgeSource("");
      setKnowledgeContent("");
    }
    await loadKnowledgeDocs();
  }

  function beginEditDoc(doc: KnowledgeDocView) {
    setEditingDocId(doc.id);
    setKnowledgeSource(doc.source);
    setKnowledgeContent(doc.content);
    setKnowledgeStatus(`Editing ${doc.source}`);
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Profile-Aware AI Assistant MVP</h1>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">1) Profile & Preferences</h2>
          <FormField
            label="Role / Industry"
            value={profile.roleIndustry}
            onChange={(v) => setProfile({ ...profile, roleIndustry: v })}
          />
          <FormField
            label="Goals"
            value={profile.goals}
            onChange={(v) => setProfile({ ...profile, goals: v })}
          />
          <FormField
            label="Writing Tone"
            value={profile.tone}
            onChange={(v) => setProfile({ ...profile, tone: v })}
          />
          <FormField
            label="Constraints (budget/time)"
            value={profile.constraints}
            onChange={(v) => setProfile({ ...profile, constraints: v })}
          />
          <FormField
            label="Do Instructions"
            value={profile.dos}
            onChange={(v) => setProfile({ ...profile, dos: v })}
          />
          <FormField
            label="Don't Instructions"
            value={profile.donts}
            onChange={(v) => setProfile({ ...profile, donts: v })}
          />

          <label className="mt-3 block text-sm font-medium">
            Preferred Format
          </label>
          <select
            className="mt-1 w-full rounded border p-2"
            value={profile.preferredFormat}
            onChange={(e) =>
              setProfile({
                ...profile,
                preferredFormat: e.target
                  .value as UserProfile["preferredFormat"],
              })
            }
          >
            <option value="bullets">Bullets</option>
            <option value="report">Report</option>
            <option value="table">Table</option>
          </select>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">2) Request + Controls</h2>
          <label className="mt-3 block text-sm font-medium">Task Request</label>
          <textarea
            className="mt-1 h-32 w-full rounded border p-2"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />

          <label className="mt-3 block text-sm font-medium">
            Refine instruction (optional)
          </label>
          <input
            className="mt-1 w-full rounded border p-2"
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SelectField
              label="Verbosity"
              value={options.verbosity}
              onChange={(v) =>
                setOptions({
                  ...options,
                  verbosity: v as RequestOptions["verbosity"],
                })
              }
              options={["low", "medium", "high"]}
            />
            <SelectField
              label="Report Type"
              value={options.reportType}
              onChange={(v) =>
                setOptions({
                  ...options,
                  reportType: v as RequestOptions["reportType"],
                })
              }
              options={["general", "comparison", "action-plan"]}
            />
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.citeSources}
                onChange={(e) =>
                  setOptions({ ...options, citeSources: e.target.checked })
                }
              />
              Cite sources
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(options.ragDebug)}
              onChange={(e) =>
                setOptions({ ...options, ragDebug: e.target.checked })
              }
            />
            Include RAG debug metadata
          </label>

          <div className="mt-4">
            <div className="flex gap-2">
              <button
                disabled={!canSubmit}
                onClick={submitRequest}
                className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {isGenerating ? (
                  <Spinner label="Generating..." />
                ) : (
                  "Generate / Regenerate"
                )}
              </button>

              <button
                onClick={() =>
                  output && setSavedReports((prev) => [output, ...prev])
                }
                className="rounded border border-slate-300 px-4 py-2"
              >
                Save Revision
              </button>
            </div>

            {(userId || sessionId) && (
              <p className="mt-2 text-xs text-slate-500">
                userId: {userId ?? (isGenerating ? "…" : "")}{" "}
                {isGenerating
                  ? "| sessionId: (pending...)"
                  : sessionId
                    ? `| sessionId: ${sessionId}`
                    : ""}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">3) Knowledge Management (RAG)</h2>
        <p className="text-sm text-slate-600">
          Add or update user-scoped knowledge sources used when citations are
          enabled.
        </p>

        <FormField
          label="Source name"
          value={knowledgeSource}
          onChange={setKnowledgeSource}
        />
        <label className="mt-3 block text-sm font-medium">
          Document content
        </label>
        <textarea
          className="mt-1 h-28 w-full rounded border p-2"
          value={knowledgeContent}
          onChange={(e) => setKnowledgeContent(e.target.value)}
        />

        <div className="mt-3 flex gap-2">
          <button
            onClick={upsertKnowledgeDoc}
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            {editingDocId ? "Update document" : "Add document"}
          </button>
          {editingDocId && (
            <button
              onClick={() => {
                setEditingDocId(null);
                setKnowledgeSource("");
                setKnowledgeContent("");
                setKnowledgeStatus("Edit canceled.");
              }}
              className="rounded border border-slate-300 px-4 py-2"
            >
              Cancel edit
            </button>
          )}
        </div>

        {knowledgeStatus && (
          <p className="mt-2 text-sm text-slate-600">{knowledgeStatus}</p>
        )}

        <div className="mt-4 space-y-2">
          {knowledgeDocs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No knowledge sources added yet.
            </p>
          ) : (
            knowledgeDocs.map((doc) => (
              <div
                key={doc.id}
                className="rounded border border-slate-200 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{doc.source}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(doc.createdAt).toLocaleString()} · embedding:{" "}
                      {doc.hasEmbedding ? "yes" : "no"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => beginEditDoc(doc)}
                      className="rounded border px-3 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeKnowledgeDoc(doc.id)}
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
      </section>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">4) Structured Output</h2>

        {!output ? (
          <p className="mt-2 text-sm text-slate-500">
            {isGenerating ? "Generating report..." : "No report yet."}
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <ReportBlock title="Summary" lines={[output.summary]} />
            <ReportBlock title="Assumptions" lines={output.assumptions} />
            <ReportBlock
              title="Recommendation"
              lines={[output.recommendation]}
            />
            <ReportBlock title="Steps" lines={output.steps} />
            <ReportBlock title="Risks" lines={output.risks} />

            {output.citations.length > 0 && (
              <ReportBlock title="Citations" lines={output.citations} />
            )}

            <details>
              <summary className="cursor-pointer font-medium">
                View assembled prompt
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                {latestPrompt || "(no prompt yet)"}
              </pre>
            </details>

            {ragDebug?.enabled && (
              <details>
                <summary className="cursor-pointer font-medium">
                  View RAG debug metadata
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs whitespace-pre-wrap">
                  {JSON.stringify(ragDebug, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">Revision History & Feedback</h2>
        <p className="text-sm text-slate-600">
          Refinement log: {history.length ? history.join(" | ") : "none"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Saved revisions: {savedReports.length}
        </p>
        <div className="mt-2 flex gap-2 text-sm">
          <button
            disabled={isGenerating}
            onClick={() => submitFeedback("up")}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            👍 Useful
          </button>
          <button
            onClick={() => submitFeedback("down")}
            className="rounded border px-3 py-1"
          >
            👎 Needs work
          </button>
        </div>
      </section>
    </main>
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
    <>
      <label className="mt-3 block text-sm font-medium">{label}</label>
      <input
        className="mt-1 w-full rounded border p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
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
        className="mt-1 w-full rounded border p-2 text-sm"
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

function ReportBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="list-disc pl-5">
        {lines.map((line, idx) => (
          <li key={`${title}-${idx}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
