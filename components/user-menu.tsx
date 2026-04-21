"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    function updateMenuPosition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 256;
      const left = Math.min(
        Math.max(rect.right - menuWidth, 16),
        window.innerWidth - menuWidth - 16,
      );
      setMenuPosition({
        top: rect.bottom + 12,
        left,
      });
    }

    if (open) {
      updateMenuPosition();
    }

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
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
    <div ref={containerRef} className="relative z-50">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void handleFileChange(event)}
        className="hidden"
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="romantic-button-secondary flex items-center gap-3 rounded-full px-3 py-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt={displayName}
          className="h-9 w-9 rounded-full object-cover"
        />
        <span className="hidden text-sm font-medium text-[#5f5149] sm:block">
          {displayName}
        </span>
      </button>

      {open && mounted
        ? createPortal(
            <div
              ref={menuRef}
              className="romantic-card fixed w-64 p-3"
              style={{ top: menuPosition.top, left: menuPosition.left, zIndex: 2000 }}
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarSrc}
                  alt={displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#3f332d]">{displayName}</p>
                  {user.email && (
                    <p className="romantic-muted mt-1 truncate text-xs">{user.email}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="romantic-button-secondary w-full px-4 py-2 text-left text-sm font-medium disabled:opacity-50"
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
                className="romantic-button-secondary mt-4 w-full px-4 py-2 text-left text-sm font-medium disabled:opacity-50"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>,
            document.body,
          )
        : null}
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
    { start: "#f6dfe4", end: "#d98c9a", text: "#5f3f45" },
    { start: "#dfe9dc", end: "#7d9a7b", text: "#394b38" },
    { start: "#ebe4f6", end: "#a995c9", text: "#4f4261" },
    { start: "#fffaf4", end: "#f1d8bd", text: "#5d4636" },
    { start: "#f4e9dc", end: "#d8b7a0", text: "#5d4636" },
  ];
  const index =
    seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0) %
    palettes.length;
  return palettes[index];
}
