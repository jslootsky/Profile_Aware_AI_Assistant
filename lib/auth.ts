import { NextRequest } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

export interface AuthedUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export function isAuthenticationError(error: unknown) {
  const message = (error as Error)?.message || "";
  return (
    message === "Missing bearer token." ||
    message === "Invalid or expired session." ||
    message.includes("Supabase auth is not configured")
  );
}

export function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export async function getAuthedUser(request: NextRequest): Promise<AuthedUser> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid or expired session.");
  }

  return {
    id: user.id,
    email: user.email,
    name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : undefined,
  };
}
