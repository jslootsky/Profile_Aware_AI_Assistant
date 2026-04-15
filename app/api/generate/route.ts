/**
 * =============================================================================
 * Generate API Route (app/api/generate/route.ts)
 * =============================================================================
 *
 * Purpose:
 * --------
 * This file defines the POST endpoint responsible for:
 *
 *   1) Validating an incoming AI task request
 *   2) Resolving or creating a user identity
 *   3) Persisting the user’s profile
 *   4) Calling the LLM orchestration layer
 *   5) Saving the generated session output
 *   6) Returning structured results to the frontend
 *   7) Ensuring the user ID is stored in a browser cookie
 *
 * This is the main “orchestration layer” that connects:
 *
 *   Frontend UI
 *        ↓
 *   User identity (auth.ts)
 *        ↓
 *   Persistent storage (store.ts)
 *        ↓
 *   LLM generation (llm.ts)
 *
 * ---------------------------------------------------------------------------
 * Dependencies:
 * ---------------------------------------------------------------------------
 * - crypto
 *     → Used to generate a unique sessionId (crypto.randomUUID)
 *
 * - getAuthedUser / setAuthedCookie (lib/auth.ts)
 *     → Resolves user identity from cookie/header
 *     → Persists user ID into a browser cookie
 *
 * - saveProfile / saveSession (lib/store.ts)
 *     → File-based JSON persistence
 *
 * - generateStructuredResponse (lib/llm.ts)
 *     → Handles prompt building, RAG (if enabled), and OpenAI call
 *
 * - NextRequest / NextResponse (next/server)
 *     → Next.js Route Handler primitives
 *
 * - GenerateRequest (lib/types.ts)
 *     → Defines expected shape of the incoming JSON body
 *
 * ---------------------------------------------------------------------------
 * Request Contract:
 * ---------------------------------------------------------------------------
 * Expects a JSON body matching:
 *
 *   GenerateRequest {
 *     profile: UserProfile
 *     task: string
 *     refinement?: string
 *     options?: {...}
 *   }
 *
 * If task is missing or empty → returns HTTP 400
 *
 * ---------------------------------------------------------------------------
 * Processing Flow:
 * ---------------------------------------------------------------------------
 *
 * 1) Parse JSON body
 *    const payload = await request.json()
 *
 * 2) Validate required field (task)
 *    If missing → return 400 error
 *
 * 3) Resolve user identity
 *    const user = await getAuthedUser(request)
 *    → either finds an existing user (via cookie)
 *    → or creates a new one
 *
 * 4) Persist profile
 *    saveProfile(user.id, payload.profile)
 *
 * 5) Generate AI response
 *    generateStructuredResponse(user.id, payload)
 *
 * 6) Create and store session record
 *    - Generate sessionId
 *    - Save full session object to store.json
 *
 * 7) Return response to frontend
 *    - Includes:
 *        prompt
 *        structured response
 *        sessionId
 *        userId
 *
 * 8) Set cookie
 *    Ensures "paai_uid" is stored in the browser for future requests
 *
 * ---------------------------------------------------------------------------
 * Output:
 * ---------------------------------------------------------------------------
 * Returns JSON:
 *
 * {
 *   prompt: string;
 *   response: StructuredResponse;
 *   sessionId: string;
 *   userId: string;
 * }
 *
 * HTTP 400 if task is invalid.
 *
 * ---------------------------------------------------------------------------
 * Design Notes:
 * ---------------------------------------------------------------------------
 * - Stateless HTTP, stateful identity via cookie
 * - Every request:
 *       reads store → modifies → writes store
 * - Sessions are append-only (newest first via unshift in store.ts)
 * - User profile is overwritten on each request (last-write-wins)
 *
 * Potential Improvements:
 * - Add try/catch for LLM errors
 * - Add request size validation
 * - Add rate limiting
 * - Add real authentication instead of simple cookie identity
 *
 * =============================================================================
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import { generateStructuredResponse } from "@/lib/llm";
import { GenerateRequest } from "@/lib/types";
import { DEFAULT_WEDDING_PROFILE, mergeWeddingProfile } from "@/lib/wedding-profile";
import { savePlannerProfile, savePlannerSession } from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";
import { validateGenerateRequest } from "@/lib/wedding-validation";

const DEFAULT_PROFILE: GenerateRequest["profile"] = DEFAULT_WEDDING_PROFILE;

const DEFAULT_OPTIONS: GenerateRequest["options"] = {
  verbosity: "high",
  reportType: "full-plan",
  citeSources: true,
  ragDebug: false,
};

export async function POST(request: NextRequest) {
  try {
    // Parse body safely
    const incoming = (await request.json()) as Partial<GenerateRequest>;

    const validation = validateGenerateRequest(incoming);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors.join(" ") },
        { status: 400 },
      );
    }
    const task = incoming?.task?.trim() as string;

    // Normalize payload so downstream code never sees undefined/null shapes
    const payload: GenerateRequest = {
      profile: mergeWeddingProfile(validation.profileValidation.profile),
      task,
      threadId: incoming.threadId,
      previousOutput: incoming.previousOutput || null,
      revisionRequest: incoming.revisionRequest ?? "",
      options: { ...DEFAULT_OPTIONS, ...(incoming.options || {}), citeSources: true },
    };

    // Resolve user identity (cookie/header) and persist profile
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const supabase = token ? getSupabaseUserClient(token) : undefined;
    await savePlannerProfile(user.id, payload.profile, supabase);

    // Generate response (structured JSON or fallback)
    const result = await generateStructuredResponse(user.id, payload, supabase);

    // Persist session
    const sessionId = crypto.randomUUID();
    const threadId = payload.threadId || sessionId;
    await savePlannerSession({
      id: sessionId,
      userId: user.id,
      threadId,
      baseTask: payload.task,
      previousOutput: payload.previousOutput,
      currentOutput: result.response,
      revisionRequest: payload.revisionRequest,
      createdAt: new Date().toISOString(),
    }, supabase);

    // Return response and set auth cookie for subsequent calls
    return NextResponse.json({
      prompt: result.prompt,
      response: result.response,
      debug: payload.options.ragDebug ? result.debug : undefined,
      sessionId,
      threadId,
      userId: user.id,
    });
  } catch (error) {
    const message = (error as Error).message || "Failed to generate response.";
    const status = isAuthenticationError(error) ? 401 : 500;
    console.error("/api/generate failed", error);
    return NextResponse.json(
      { error: status === 401 ? message : "Failed to generate response." },
      { status },
    );
  }
}
