import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import {
  getProfile as getLocalProfile,
  listSessions as listLocalSessions,
  saveProfile as saveLocalProfile,
  saveSession as saveLocalSession,
  updateSessionFeedback as updateLocalSessionFeedback,
} from "./store";
import { StoredSessionOutput, WeddingProfile } from "./types";

type WeddingProfileRow = {
  user_id: string;
  profile_json: WeddingProfile;
  updated_at: string;
};

type PlannerSessionRow = {
  id: string;
  user_id: string;
  task: string;
  refinement: string | null;
  report_json: StoredSessionOutput["report"];
  rating: "up" | "down" | null;
  feedback: string | null;
  created_at: string;
};

function mapSessionRow(row: PlannerSessionRow): StoredSessionOutput {
  return {
    id: row.id,
    userId: row.user_id,
    task: row.task,
    refinement: row.refinement || "",
    report: row.report_json,
    rating: row.rating || undefined,
    feedback: row.feedback || undefined,
    createdAt: row.created_at,
  };
}

export async function getPlannerProfile(userId: string): Promise<WeddingProfile | null> {
  if (!isSupabaseConfigured()) {
    return getLocalProfile(userId);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? (data as WeddingProfileRow).profile_json : null;
}

export async function savePlannerProfile(userId: string, profile: WeddingProfile) {
  if (!isSupabaseConfigured()) {
    return saveLocalProfile(userId, profile);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wedding_profiles").upsert(
    {
      user_id: userId,
      profile_json: profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function savePlannerSession(output: StoredSessionOutput) {
  if (!isSupabaseConfigured()) {
    return saveLocalSession(output);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("planner_sessions").insert({
    id: output.id,
    user_id: output.userId,
    task: output.task,
    refinement: output.refinement || null,
    report_json: output.report,
    rating: output.rating || null,
    feedback: output.feedback || null,
    created_at: output.createdAt,
  });

  if (error) {
    throw error;
  }
}

export async function updatePlannerSessionFeedback(
  sessionId: string,
  rating: "up" | "down",
  feedback?: string,
) {
  if (!isSupabaseConfigured()) {
    return updateLocalSessionFeedback(sessionId, rating, feedback);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("planner_sessions")
    .update({
      rating,
      feedback: feedback || null,
    })
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSessionRow(data as PlannerSessionRow) : null;
}

export async function listPlannerSessions(userId: string) {
  if (!isSupabaseConfigured()) {
    return listLocalSessions(userId);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("planner_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as PlannerSessionRow[]).map(mapSessionRow);
}
