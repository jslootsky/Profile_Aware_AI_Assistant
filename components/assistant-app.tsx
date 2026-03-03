"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnalyticsSummary,
  GenerateRequest,
  RequestOptions,
  StructuredResponse,
  UserProfile,
} from "@/lib/types";

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
  citeSources: false,
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
  // const [sessionId, setSessionId] = useState<string | null>(null);
  // const [citationView, setCitationView] = useState(true);

  const canSubmit = useMemo(() => task.trim().length > 0, [task]);

  // useEffect(() => {
  //   void fetch("api/auth/me")
  // })

  async function submitRequest() {
    const payload: GenerateRequest = {
      profile,
      task,
      refinement,
      options,
      history,
    };
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return;

    const data = await res.json();
    setLatestPrompt(data.prompt);
    setOutput(data.response);
    if (refinement.trim()) {
      setHistory((prev) => [...prev, refinement.trim()]);
      setRefinement("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Profile-Aware AI Assistant MVP</h1>
      <p className="mt-1 text-sm text-slate-600">
        Capture profile → submit request → generate structured report → refine
        iteratively.
      </p>

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

          <div className="mt-4 flex gap-2">
            <button
              disabled={!canSubmit}
              onClick={submitRequest}
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              Generate / Regenerate
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
        </div>
      </section>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">3) Structured Output</h2>
        {!output ? (
          <p className="mt-2 text-sm text-slate-500">No report yet.</p>
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
            {output.citations && (
              <ReportBlock title="Citations" lines={output.citations} />
            )}
            <details>
              <summary className="cursor-pointer font-medium">
                View assembled prompt
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs">
                {latestPrompt}
              </pre>
            </details>
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
          <button className="rounded border px-3 py-1">👍 Useful</button>
          <button className="rounded border px-3 py-1">👎 Needs work</button>
        </div>
      </section>
    </main>
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
