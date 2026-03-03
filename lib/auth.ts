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
