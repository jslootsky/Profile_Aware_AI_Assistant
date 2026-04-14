import type { SupabaseClient } from "@supabase/supabase-js";
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
  custom_budget_sections?: WeddingProfile["customBudgetSections"] | null;
  updated_at: string;
};

type PlannerSessionRow = {
  id: string;
  user_id: string;
  thread_id: string | null;
  base_task: string | null;
  previous_output_json: StoredSessionOutput["previousOutput"] | null;
  current_output_json: StoredSessionOutput["currentOutput"] | null;
  revision_request: string | null;
  task: string;
  refinement: string | null;
  report_json: StoredSessionOutput["currentOutput"];
  rating: "up" | "down" | null;
  feedback: string | null;
  created_at: string;
};

function mapSessionRow(row: PlannerSessionRow): StoredSessionOutput {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id || row.id,
    baseTask: row.base_task || row.task,
    previousOutput: row.previous_output_json || null,
    currentOutput: row.current_output_json || row.report_json,
    revisionRequest: row.revision_request || row.refinement || "",
    rating: row.rating || undefined,
    feedback: row.feedback || undefined,
    createdAt: row.created_at,
  };
}

export async function getPlannerProfile(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<WeddingProfile | null> {
  if (!isSupabaseConfigured()) {
    return getLocalProfile(userId);
  }

  const supabase = supabaseClient || getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  const row = data as WeddingProfileRow;
  return {
    ...row.profile_json,
    customBudgetSections:
      row.custom_budget_sections || row.profile_json.customBudgetSections || [],
  };
}

export async function savePlannerProfile(
  userId: string,
  profile: WeddingProfile,
  supabaseClient?: SupabaseClient,
) {
  if (!isSupabaseConfigured()) {
    return saveLocalProfile(userId, profile);
  }

  const supabase = supabaseClient || getSupabaseAdmin();
  const { error } = await supabase.from("wedding_profiles").upsert(
    {
      user_id: userId,
      profile_json: {
        ...profile,
        customBudgetSections: profile.customBudgetSections || [],
      },
      custom_budget_sections: profile.customBudgetSections || [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function savePlannerSession(
  output: StoredSessionOutput,
  supabaseClient?: SupabaseClient,
) {
  if (!isSupabaseConfigured()) {
    return saveLocalSession(output);
  }

  const supabase = supabaseClient || getSupabaseAdmin();
  const { error } = await supabase.from("planner_sessions").insert({
    id: output.id,
    user_id: output.userId,
    thread_id: output.threadId,
    base_task: output.baseTask,
    previous_output_json: output.previousOutput || null,
    current_output_json: output.currentOutput,
    revision_request: output.revisionRequest || null,
    task: output.baseTask,
    refinement: output.revisionRequest || null,
    report_json: output.currentOutput,
    rating: output.rating || null,
    feedback: output.feedback || null,
    created_at: output.createdAt,
  });

  if (error) {
    throw error;
  }
}

export async function updatePlannerSessionFeedback(
  userId: string,
  sessionId: string,
  rating: "up" | "down",
  feedback?: string,
  supabaseClient?: SupabaseClient,
) {
  if (!isSupabaseConfigured()) {
    void userId;
    return updateLocalSessionFeedback(sessionId, rating, feedback);
  }

  const supabase = supabaseClient || getSupabaseAdmin();
  const { data, error } = await supabase
    .from("planner_sessions")
    .update({
      rating,
      feedback: feedback || null,
    })
    .eq("user_id", userId)
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSessionRow(data as PlannerSessionRow) : null;
}

export async function listPlannerSessions(
  userId: string,
  supabaseClient?: SupabaseClient,
) {
  if (!isSupabaseConfigured()) {
    return listLocalSessions(userId);
  }

  const supabase = supabaseClient || getSupabaseAdmin();
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
