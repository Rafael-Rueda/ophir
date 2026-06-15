import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "../config/env.js";
import { ADMIN_ROLE } from "../config/runtime.js";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export interface AdminTokenClaims {
  /** Admin user id. */
  sub: string;
  /** Session id (admin_sessions.id). */
  sid: string;
  email: string;
  role: typeof ADMIN_ROLE;
}

/** Signs a short-lived admin access token (HS256). */
export async function signAdminToken(claims: AdminTokenClaims): Promise<string> {
  const env = getEnv();
  return new SignJWT({ email: claims.email, role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Verifies an admin access token and returns its claims. Throws on failure. */
export async function verifyAdminToken(token: string): Promise<AdminTokenClaims> {
  const env = getEnv();
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  if (!payload.sub || typeof payload.sid !== "string" || typeof payload.email !== "string") {
    throw new Error("Malformed admin token claims");
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    email: payload.email,
    role: ADMIN_ROLE,
  };
}
