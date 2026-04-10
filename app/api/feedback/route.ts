/**
 * API Route: /api/feedback
 * File: app/api/feedback/route.ts
 *
 * -----------------------------------------------------------------------------
 * Overview
 * -----------------------------------------------------------------------------
 * This route records user feedback for a previously generated AI session.
 * Feedback is tied to a specific session via `sessionId` and allows the user
 * to rate the output (thumbs up/down) and optionally include written feedback.
 *
 * The route updates the stored session record using `updateSessionFeedback`
 * in the persistence layer.
 *
 *
 * -----------------------------------------------------------------------------
 * Dependencies
 * -----------------------------------------------------------------------------
 *
 * next/server
 *   - NextRequest: access to the incoming HTTP request body.
 *   - NextResponse: used to return JSON responses.
 *
 * @/lib/store
 *   - updateSessionFeedback(sessionId, rating, feedback)
 *     Updates a stored session with the provided rating and optional
 *     feedback message. Returns the updated session or null if the
 *     session does not exist.
 *
 *
 * -----------------------------------------------------------------------------
 * POST /api/feedback
 * -----------------------------------------------------------------------------
 * Purpose:
 *   Attach a rating and optional comment to a previously generated session.
 *
 * Expected Input (JSON):
 *
 *   {
 *     "sessionId": "uuid-of-session",
 *     "rating": "up" | "down",
 *     "feedback": "optional text comment"
 *   }
 *
 *
 * Validation:
 *   - `sessionId` must be provided.
 *   - `rating` must be either "up" or "down".
 *
 *
 * Responses:
 *
 *   200 OK
 *     { ok: true }
 *
 *   400 Bad Request
 *     { error: "sessionId and rating are required." }
 *
 *   404 Not Found
 *     { error: "Session not found." }
 *
 *
 * -----------------------------------------------------------------------------
 * Role in System
 * -----------------------------------------------------------------------------
 * The frontend calls this endpoint after displaying a generated report so
 * users can rate the quality of the AI output. The feedback is stored alongside
 * the session for future analysis, debugging, or model improvement.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getBearerToken, isAuthenticationError } from "@/lib/auth";
import { updatePlannerSessionFeedback } from "@/lib/planner-store";
import { getSupabaseUserClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    const token = getBearerToken(request);
    const { sessionId, rating, feedback } = (await request.json()) as {
      sessionId: string;
      rating: "up" | "down";
      feedback?: string;
    };
    if (!sessionId || !rating) {
      return NextResponse.json(
        { error: "sessionId and rating are required." },
        { status: 400 },
      );
    }
    const updated = await updatePlannerSessionFeedback(
      user.id,
      sessionId,
      rating,
      feedback,
      token ? getSupabaseUserClient(token) : undefined,
    );
    if (!updated) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: isAuthenticationError(error) ? 401 : 500 },
    );
  }
}
