"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

export interface PlannerAuthUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export function UserMenu({
  user,
  onSignOut,
  onUploadAvatar,
  isSigningOut,
}: {
  user: PlannerAuthUser;
  onSignOut: () => void;
  onUploadAvatar: (file: File) => Promise<void> | void;
  isSigningOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const avatarSrc = user.avatarUrl || getDefaultAvatarDataUrl(displayName);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    try {
      await onUploadAvatar(file);
      setOpen(false);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void handleFileChange(event)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt={displayName}
          className="h-9 w-9 rounded-full object-cover"
        />
        <span className="hidden text-sm font-medium text-slate-700 sm:block">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-3 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc}
              alt={displayName}
              className="h-12 w-12 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              {user.email && (
                <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {isUploading ? "Uploading photo..." : "Upload profile picture"}
            </button>
          </div>
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

function getDefaultAvatarDataUrl(displayName: string) {
  const seed = (displayName || "User").trim();
  const initial = seed.charAt(0).toUpperCase() || "U";
  const palette = selectAvatarPalette(seed);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="avatar-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#avatar-gradient)" />
      <circle cx="48" cy="34" r="16" fill="rgba(255,255,255,0.22)" />
      <path d="M22 80c4-14 15-22 26-22s22 8 26 22" fill="rgba(255,255,255,0.22)" />
      <text x="48" y="56" text-anchor="middle" font-size="30" font-family="Arial, sans-serif" font-weight="700" fill="${palette.text}">
        ${initial}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function selectAvatarPalette(seed: string) {
  const palettes = [
    { start: "#fb7185", end: "#f97316", text: "#fff7ed" },
    { start: "#38bdf8", end: "#2563eb", text: "#eff6ff" },
    { start: "#34d399", end: "#059669", text: "#ecfdf5" },
    { start: "#a78bfa", end: "#7c3aed", text: "#f5f3ff" },
    { start: "#f59e0b", end: "#ef4444", text: "#fffbeb" },
  ];
  const index =
    seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0) %
    palettes.length;
  return palettes[index];
}
