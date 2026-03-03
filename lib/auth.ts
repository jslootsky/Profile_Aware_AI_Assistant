/**
 * =============================================================================
 * Lightweight Auth Helper (lib/auth.ts)
 * =============================================================================
 *
 * Purpose:
 * --------
 * This module implements a *very simple* “user identity” mechanism for a Next.js
 * app without passwords or real authentication.
 *
 * It does two jobs:
 *   1) Identify the current user for an incoming request (getAuthedUser)
 *   2) Persist that user id for future requests via a cookie (setAuthedCookie)
 *
 * It relies on the file-backed store (lib/store.ts) to:
 *   - look up an existing user by id, or
 *   - create a new user if no id exists yet
 *
 * ---------------------------------------------------------------------------
 * Dependencies:
 * ---------------------------------------------------------------------------
 * - NextRequest / NextResponse (next/server)
 *     → Next.js “Route Handler” request/response types
 *     → Provides access to cookies and headers
 *
 * - getOrCreateUser (./store)
 *     → Reads/writes the JSON store
 *     → Guarantees a StoredUser exists for a given id (or generates one)
 *
 * ---------------------------------------------------------------------------
 * Exported API:
 * ---------------------------------------------------------------------------
 * getAuthedUser(request: NextRequest): Promise<StoredUser>
 *   - Attempts to find an existing user id from the request:
 *       1) Cookie:  "paai_uid"
 *       2) Header:  "x-user-id" (fallback / API testing)
 *   - Passes the id (or undefined) into getOrCreateUser():
 *       - If id exists and matches a stored user → returns that user
 *       - If id is missing → creates a brand new user with a generated UUID
 *   - Output:
 *       StoredUser (always)
 *
 * setAuthedCookie(response: NextResponse, userId: string): void
 *   - Sets the "paai_uid" cookie on the outgoing response so the browser will
 *     automatically include it on future requests.
 *   - Cookie options:
 *       - httpOnly: false     (JS on the client *can* read it; less secure)
 *       - sameSite: "lax"     (helps reduce CSRF in common cases)
 *       - path: "/"           (cookie is sent for the whole site)
 *       - maxAge: 1 year      (persist user id long-term)
 *   - Output:
 *       void (mutates the response by adding a Set-Cookie header)
 *
 * ---------------------------------------------------------------------------
 * Design Notes / Security:
 * ---------------------------------------------------------------------------
 * - This is NOT real authentication (no login, no verification).
 * - Anyone who can set/guess a user id could impersonate that user.
 * - If you want stronger security, set httpOnly: true and sign/encrypt the id
 *   (or use NextAuth / JWT sessions / OAuth).
 *
 * =============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "./store";

export async function getAuthedUser(request: NextRequest) {
  const incomingId =
    request.cookies.get("paai_uid")?.value ||
    request.headers.get("x-user-id") ||
    undefined;
  return getOrCreateUser(incomingId);
}

export function setAuthedCookie(response: NextResponse, userId: string) {
  response.cookies.set("paai_uid", userId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
