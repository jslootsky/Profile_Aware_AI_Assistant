"use client";

import { useEffect, useMemo, useState } from "react";
import { RequestOptions, StructuredResponse, UserProfile } from "@/lib/types";

const defaultProfile: UserProfile = {
  roleIndustry: "",
  goals: "",
  tone: "Professional and concise",
  constraints: "",
  preferredFormat: "report",
  dos: "",
  donts: ""
};

const defaultOptions: RequestOptions = {
  verbosity: "medium",
  reportType: "general",
  citeSources: false
};

interface MeResponse {
  user: { id: string; email: string; name?: string } | null;
}

interface Analytics {
  generatedReports: number;
  feedbackCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
}

export function AssistantApp() {
  const [email, setEmail] = useState("founder@example.com");
  const [name, setName] = useState("Product Lead");
  const [user, setUser] = useState<MeResponse["user"]>(null);

  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [task, setTask] = useState("");
  const [refinement, setRefinement] = useState("");
  const [options, setOptions] = useState<RequestOptions>(defaultOptions);
  const [history, setHistory] = useState<string[]>([]);
  const [output, setOutput] = useState<StructuredResponse | null>(null);
  const [latestPrompt, setLatestPrompt] = useState("");
  const [sessionOutputId, setSessionOutputId] = useState<string | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [knowledgeSource, setKnowledgeSource] = useState("internal-policy");
  const [knowledgeContent, setKnowledgeContent] = useState("");

  const canSubmit = useMemo(() => task.trim().length > 0 && Boolean(user), [task, user]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: MeResponse) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile({
            roleIndustry: data.profile.roleIndustry,
            goals: data.profile.goals,
            tone: data.profile.tone,
            constraints: data.profile.constraints,
            preferredFormat: data.profile.preferredFormat,
            dos: data.profile.dos || "",
            donts: data.profile.donts || ""
          });
        }
      });

    void refreshAnalytics();
  }, [user]);

  async function refreshAnalytics() {
    const res = await fetch("/api/analytics");
    if (!res.ok) return;
    const data = await res.json();
    setAnalytics(data);
  }

  async function login() {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name })
    });
    if (!res.ok) return;
    const me = await fetch("/api/auth/me").then((r) => r.json());
    setUser(me.user);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOutput(null);
  }

  async function saveProfile() {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
  }

  async function submitRequest() {
    const payload = { task, refinement, options, history };
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return;

    const data = await res.json();
    setLatestPrompt(data.prompt);
    setOutput(data.response);
    setSessionOutputId(data.sessionOutputId || null);
    if (refinement.trim()) {
      setHistory((prev) => [...prev, refinement.trim()]);
      setRefinement("");
    }

    await refreshAnalytics();
  }

  async function submitFeedback(rating: "up" | "down") {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionOutputId, rating, reason: feedbackReason })
    });
    setFeedbackReason("");
    await refreshAnalytics();
  }

  async function uploadKnowledge() {
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: knowledgeSource, content: knowledgeContent })
    });
    setKnowledgeContent("");
  }

  async function exportReport(format: "pdf" | "doc") {
    if (!output) return;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, report: output })
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="rounded-xl bg-white p-4 shadow">
        <h1 className="text-2xl font-bold">Profile-Aware AI Assistant MVP+</h1>
        <p className="text-sm text-slate-600">Now with OpenAI calls, auth, persistence, RAG, export, and analytics.</p>
        {!user ? (
          <div className="mt-3 flex gap-2">
            <input className="rounded border p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className="rounded border p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={login}>Sign in</button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span>Signed in as {user.email}</span>
            <button className="rounded border px-3 py-1" onClick={logout}>Sign out</button>
          </div>
        )}
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">1) Profile & Preferences</h2>
          <FormField label="Role / Industry" value={profile.roleIndustry} onChange={(v) => setProfile({ ...profile, roleIndustry: v })} />
          <FormField label="Goals" value={profile.goals} onChange={(v) => setProfile({ ...profile, goals: v })} />
          <FormField label="Writing Tone" value={profile.tone} onChange={(v) => setProfile({ ...profile, tone: v })} />
          <FormField label="Constraints (budget/time)" value={profile.constraints} onChange={(v) => setProfile({ ...profile, constraints: v })} />
          <FormField label="Do Instructions" value={profile.dos} onChange={(v) => setProfile({ ...profile, dos: v })} />
          <FormField label="Don't Instructions" value={profile.donts} onChange={(v) => setProfile({ ...profile, donts: v })} />

          <label className="mt-3 block text-sm font-medium">Preferred Format</label>
          <select className="mt-1 w-full rounded border p-2" value={profile.preferredFormat} onChange={(e) => setProfile({ ...profile, preferredFormat: e.target.value as UserProfile["preferredFormat"] })}>
            <option value="bullets">Bullets</option>
            <option value="report">Report</option>
            <option value="table">Table</option>
          </select>
          <button onClick={saveProfile} className="mt-3 rounded border px-3 py-1 text-sm">Save Profile</button>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">2) Request + Controls</h2>
          <label className="mt-3 block text-sm font-medium">Task Request</label>
          <textarea className="mt-1 h-32 w-full rounded border p-2" value={task} onChange={(e) => setTask(e.target.value)} />

          <label className="mt-3 block text-sm font-medium">Refine instruction (optional)</label>
          <input className="mt-1 w-full rounded border p-2" value={refinement} onChange={(e) => setRefinement(e.target.value)} />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SelectField label="Verbosity" value={options.verbosity} onChange={(v) => setOptions({ ...options, verbosity: v as RequestOptions["verbosity"] })} options={["low", "medium", "high"]} />
            <SelectField label="Report Type" value={options.reportType} onChange={(v) => setOptions({ ...options, reportType: v as RequestOptions["reportType"] })} options={["general", "comparison", "action-plan"]} />
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={options.citeSources} onChange={(e) => setOptions({ ...options, citeSources: e.target.checked })} />
              Cite sources
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={!canSubmit} onClick={submitRequest} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Generate / Regenerate</button>
            <button onClick={() => exportReport("pdf")} className="rounded border px-4 py-2">Export PDF</button>
            <button onClick={() => exportReport("doc")} className="rounded border px-4 py-2">Export DOC</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">3) Structured Output + Citation Renderer</h2>
        {!output ? <p className="mt-2 text-sm text-slate-500">No report yet.</p> : (
          <div className="mt-3 space-y-3 text-sm">
            <ReportBlock title="Summary" lines={[output.summary]} />
            <ReportBlock title="Assumptions" lines={output.assumptions} />
            <ReportBlock title="Recommendation" lines={[output.recommendation]} />
            <ReportBlock title="Steps" lines={output.steps} />
            <ReportBlock title="Risks" lines={output.risks} />
            {output.citations?.length ? (
              <div>
                <h3 className="font-medium">Citations</h3>
                <ol className="list-decimal pl-5">
                  {output.citations.map((c, idx) => <li key={`${c.source}-${idx}`}><span className="font-medium">{c.source}:</span> {c.excerpt}</li>)}
                </ol>
              </div>
            ) : null}
            <details>
              <summary className="cursor-pointer font-medium">View assembled prompt</summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs">{latestPrompt}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">4) Feedback Loop</h2>
          <input className="mt-2 w-full rounded border p-2" value={feedbackReason} onChange={(e) => setFeedbackReason(e.target.value)} placeholder="Reason (optional)" />
          <div className="mt-2 flex gap-2 text-sm">
            <button className="rounded border px-3 py-1" onClick={() => submitFeedback("up")}>👍 Useful</button>
            <button className="rounded border px-3 py-1" onClick={() => submitFeedback("down")}>👎 Needs work</button>
          </div>
          <p className="mt-2 text-sm text-slate-600">Refinement log: {history.length ? history.join(" | ") : "none"}</p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-semibold">5) Analytics Dashboard</h2>
          <p className="text-sm">Generated reports: {analytics?.generatedReports ?? 0}</p>
          <p className="text-sm">Feedback count: {analytics?.feedbackCount ?? 0}</p>
          <p className="text-sm">Positive: {analytics?.positiveFeedback ?? 0} / Negative: {analytics?.negativeFeedback ?? 0}</p>
          <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={refreshAnalytics}>Refresh analytics</button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">RAG Knowledge Base</h2>
        <p className="text-sm text-slate-600">Add internal notes/policies to improve grounded responses when citation mode is enabled.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <input className="rounded border p-2" value={knowledgeSource} onChange={(e) => setKnowledgeSource(e.target.value)} placeholder="source" />
          <input className="rounded border p-2" value={knowledgeContent} onChange={(e) => setKnowledgeContent(e.target.value)} placeholder="knowledge snippet" />
          <button className="rounded border px-3 py-1" onClick={uploadKnowledge}>Add Chunk</button>
        </div>
      </section>
    </main>
  );
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <><label className="mt-3 block text-sm font-medium">{label}</label><input className="mt-1 w-full rounded border p-2" value={value} onChange={(e) => onChange(e.target.value)} /></>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <select className="mt-1 w-full rounded border p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
    </div>
  );
}

function ReportBlock({ title, lines }: { title: string; lines: string[] }) {
  return <div><h3 className="font-medium">{title}</h3><ul className="list-disc pl-5">{lines.map((line, idx) => <li key={`${title}-${idx}`}>{line}</li>)}</ul></div>;
}
