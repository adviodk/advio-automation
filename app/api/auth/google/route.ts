import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google";

// Visit this endpoint once to start the one-time Google authorization.
// It redirects to Google's consent screen; after approving access to
// Calendar + Sheets, Google redirects back to /api/auth/google/callback
// which prints the refresh token to store as GOOGLE_REFRESH_TOKEN.
export async function GET() {
  return NextResponse.redirect(getGoogleAuthUrl());
}
