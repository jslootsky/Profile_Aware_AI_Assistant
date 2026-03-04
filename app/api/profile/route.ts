/**
 * API Route: /api/profile
 * File: app/api/profile/route.ts
 *
 * -----------------------------------------------------------------------------
 * Overview
 * -----------------------------------------------------------------------------
 * This API route manages the authenticated user's profile data. The profile
 * represents user-specific preferences and context that are used when generating
 * AI responses (e.g., role/industry, tone, goals, formatting preferences).
 *
 * The route supports two HTTP methods:
 *
 *   GET  - Fetch the current user's stored profile.
 *   PUT  - Save/update the current user's profile.
 *
 * User identity is resolved via the authentication helper `getAuthedUser`,
 * which reads a cookie or header to determine the user ID. If no user ID
 * exists yet, a new user is automatically created.
 *
 * The route also ensures the user cookie is refreshed on every request so
 * subsequent API calls maintain the same identity.
 *
 *
 * -----------------------------------------------------------------------------
 * Dependencies
 * -----------------------------------------------------------------------------
 *
 * next/server
 *   - NextRequest
 *       Provides access to the incoming HTTP request, including cookies,
 *       headers, and request body.
 *
 *   - NextResponse
 *       Used to construct HTTP JSON responses returned to the frontend.
 *
 *
 * @/lib/auth
 *   - getAuthedUser(request)
 *       Resolves the current user identity from:
 *         - cookie: "paai_uid"
 *         - header fallback: "x-user-id"
 *
 *       If neither exists, a new user is created and assigned a unique ID.
 *
 *       Returns:
 *         { id: string }
 *
 *
 *   - setAuthedCookie(response, userId)
 *       Writes the user ID back into the response cookie so that the
 *       browser maintains a persistent identity across future requests.
 *
 *
 * @/lib/store
 *   - getProfile(userId)
 *       Retrieves the saved profile associated with the given user ID
 *       from persistent storage (currently `data/store.json`).
 *
 *       Returns:
 *         UserProfile | null
 *
 *
 *   - saveProfile(userId, profile)
 *       Stores or updates the profile associated with the given user ID.
 *
 *
 * @/lib/types
 *   - UserProfile
 *       Type definition describing the shape of a profile object.
 *       Example fields may include:
 *
 *         {
 *           roleIndustry: string;
 *           goals: string;
 *           tone: string;
 *           constraints: string;
 *           preferredFormat: string;
 *           dos: string;
 *           donts: string;
 *         }
 *
 *
 * -----------------------------------------------------------------------------
 * GET /api/profile
 * -----------------------------------------------------------------------------
 * Purpose:
 *   Fetch the currently authenticated user's stored profile.
 *
 * Flow:
 *   1. Resolve the user identity via getAuthedUser(request).
 *   2. Load the user's stored profile from the data store.
 *   3. Return the profile as JSON.
 *   4. Ensure the authentication cookie is set in the response.
 *
 * Expected Input:
 *   - No request body required.
 *   - Identity determined from cookie/header.
 *
 * Response:
 *   HTTP 200
 *
 *   {
 *     profile: UserProfile | null
 *   }
 *
 *   If the user has not previously saved a profile, `profile` may be null.
 *
 *
 * -----------------------------------------------------------------------------
 * PUT /api/profile
 * -----------------------------------------------------------------------------
 * Purpose:
 *   Save or update the current user's profile preferences.
 *
 * Flow:
 *   1. Resolve the user identity via getAuthedUser(request).
 *   2. Parse the request body as a UserProfile object.
 *   3. Persist the profile using saveProfile(user.id, profile).
 *   4. Return confirmation JSON.
 *   5. Refresh the authentication cookie.
 *
 * Expected Input (JSON body):
 *
 *   {
 *     "roleIndustry": "Software Engineering",
 *     "goals": "Improve productivity",
 *     "tone": "Professional and concise",
 *     "constraints": "No external SaaS tools",
 *     "preferredFormat": "report",
 *     "dos": "Use bullet points",
 *     "donts": "Avoid vague recommendations"
 *   }
 *
 *
 * Response:
 *
 *   HTTP 200
 *
 *   {
 *     ok: true
 *   }
 *
 *
 * -----------------------------------------------------------------------------
 * Outputs to the Frontend
 * -----------------------------------------------------------------------------
 *
 * GET response:
 *
 *   {
 *     profile: UserProfile | null
 *   }
 *
 * PUT response:
 *
 *   {
 *     ok: true
 *   }
 *
 *
 * -----------------------------------------------------------------------------
 * Role in the Overall System
 * -----------------------------------------------------------------------------
 *
 * The profile returned by this route is used by the frontend and the LLM
 * orchestration layer during prompt generation.
 *
 * Specifically:
 *
 *   UI loads profile → /api/profile (GET)
 *   User edits preferences → /api/profile (PUT)
 *   Generation request → /api/generate
 *
 * During generation, the stored profile is embedded into the prompt context
 * so the AI assistant tailors its response to the user's preferences.
 *
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, setAuthedCookie } from "@/lib/auth";
import { getProfile, saveProfile } from "@/lib/store";
import { UserProfile } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = await getAuthedUser(request);
  const profile = await getProfile(user.id);
  const response = NextResponse.json({ profile });
  setAuthedCookie(response, user.id);
  return response;
}

export async function PUT(request: NextRequest) {
  const user = await getAuthedUser(request);
  const profile = (await request.json()) as UserProfile;
  await saveProfile(user.id, profile);
  const response = NextResponse.json({ ok: true });
  setAuthedCookie(response, user.id);
  return response;
}
