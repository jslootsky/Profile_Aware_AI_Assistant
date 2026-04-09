"use client";

export function GoogleSignInLanding({
  onSignIn,
  disabled,
  authConfigured,
  error,
}: {
  onSignIn: () => void;
  disabled?: boolean;
  authConfigured: boolean;
  error?: string | null;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0%,#fff1f2_45%,#f8fafc_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full gap-10 rounded-[2rem] bg-white/85 p-8 shadow-2xl ring-1 ring-rose-100 backdrop-blur lg:grid-cols-[1.08fr_0.92fr] lg:p-12">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-rose-600">
              Budget Wedding Planner
            </p>
            <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-tight">
              Plan the wedding first around the budget, not wishful thinking.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Sign in with Google, complete the wedding survey, and get a planning
              flow that stays grounded in your guest count, priorities, location,
              and real spending limits.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm">
              <Pill label="Survey-first onboarding" />
              <Pill label="Constraint-aware planning" />
              <Pill label="Deterministic budget math" />
              <Pill label="Vendor and venue grounding" />
            </div>

            <div className="mt-10 rounded-[1.5rem] bg-slate-950 p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-300">
                Security
              </p>
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                <li>Google sign-in runs through Supabase Auth.</li>
                <li>Planner API requests require a verified bearer token.</li>
                <li>Your survey, sessions, and notes are scoped to your account.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-[2rem] bg-[linear-gradient(180deg,#fffaf5_0%,#fff1f2_100%)] p-8 ring-1 ring-rose-100">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
              Start here
            </p>
            <h2 className="mt-4 text-3xl font-semibold">Sign in before planning</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Authentication is required before the survey begins so your wedding
              profile, vendor notes, and planning sessions stay attached to your
              account.
            </p>

            <button
              type="button"
              onClick={onSignIn}
              disabled={disabled || !authConfigured}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-base font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-900">
                G
              </span>
              Sign in with Google
            </button>

            {!authConfigured && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
                and `SUPABASE_SERVICE_ROLE_KEY` before using Google sign-in.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-rose-200 bg-white px-4 py-2 text-slate-700">
      {label}
    </span>
  );
}
