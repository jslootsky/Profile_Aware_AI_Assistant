"use client";

import { useEffect, useRef, useState } from "react";

export interface PlannerAuthUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export function UserMenu({
  user,
  onSignOut,
  isSigningOut,
}: {
  user: PlannerAuthUser;
  onSignOut: () => void;
  isSigningOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = user.name || user.email || "Signed-in user";
  const initials = displayName.trim().charAt(0).toUpperCase() || "U";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={displayName}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 font-semibold text-rose-700">
            {initials}
          </span>
        )}
        <span className="hidden text-sm font-medium text-slate-700 sm:block">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-3 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          {user.email && <p className="mt-1 text-xs text-slate-500">{user.email}</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            disabled={isSigningOut}
            className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
