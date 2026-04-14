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
              <GoogleIcon />
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

function GoogleIcon() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white">
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          fill="#EA4335"
        />
      </svg>
    </span>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-rose-200 bg-white px-4 py-2 text-slate-700">
      {label}
    </span>
  );
}
