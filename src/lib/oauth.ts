import crypto from "node:crypto";

/** Short-lived cookie holding the OAuth `state` and PKCE verifier between redirect and callback. */
export const oauthCookieName = (secure: boolean) => (secure ? "__Host-dt_oauth" : "dt_oauth");

export const pkceChallenge = (verifier: string) => crypto.createHash("sha256").update(verifier).digest("base64url");

export const googleRedirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
