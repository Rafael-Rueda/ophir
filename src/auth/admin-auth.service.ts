import { query } from "../db/client.js";
import { ADMIN_ROLE } from "../config/runtime.js";
import { getEnv } from "../config/env.js";
import { ConflictError, UnauthorizedError } from "../shared/errors.js";
import { newId } from "../shared/ids.js";
import { isExpired, secondsFromNow } from "../shared/time.js";
import { recordAdminLogin } from "../audit/audit.service.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { signAdminToken, verifyAdminToken } from "./jwt.service.js";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: typeof ADMIN_ROLE;
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

type AdminRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  role: typeof ADMIN_ROLE;
  status: "active" | "disabled";
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

function mapAdmin(row: AdminRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- Repository ------------------------------------------------------------

async function getAdminRowByEmail(email: string): Promise<AdminRow | null> {
  const { rows } = await query<AdminRow>(`SELECT * FROM admin_users WHERE email = $1`, [
    normalizeEmail(email),
  ]);
  return rows[0] ?? null;
}

async function getAdminRowById(id: string): Promise<AdminRow | null> {
  const { rows } = await query<AdminRow>(`SELECT * FROM admin_users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

interface SessionRow {
  id: string;
  admin_user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

async function createSession(adminUserId: string): Promise<{ id: string; expiresAt: Date }> {
  const env = getEnv();
  const expiresAt = secondsFromNow(env.ACCESS_TOKEN_TTL_SECONDS);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO admin_sessions (admin_user_id, token_family_id, expires_at)
     VALUES ($1, $2, $3) RETURNING id`,
    [adminUserId, newId(), expiresAt],
  );
  return { id: rows[0]!.id, expiresAt };
}

async function getSession(id: string): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow>(
    `SELECT id, admin_user_id, expires_at, revoked_at FROM admin_sessions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// --- Public API ------------------------------------------------------------

export interface LoginResult {
  accessToken: string;
  admin: AdminUser;
}

/** Authenticates an admin and issues a session-backed access token. */
export async function login(
  email: string,
  password: string,
  requestId: string,
): Promise<LoginResult> {
  const row = await getAdminRowByEmail(email);

  if (!row || row.status !== "active" || !row.password_hash) {
    await recordAdminLogin({ email, requestId, success: false, reason: "invalid_credentials" });
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordOk = await verifyPassword(password, row.password_hash);
  if (!passwordOk) {
    await recordAdminLogin({
      adminId: row.id,
      email,
      requestId,
      success: false,
      reason: "invalid_credentials",
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  const session = await createSession(row.id);
  const accessToken = await signAdminToken({
    sub: row.id,
    sid: session.id,
    email: row.email,
    role: ADMIN_ROLE,
  });

  await query(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [row.id]);
  await recordAdminLogin({ adminId: row.id, email, requestId, success: true });

  return { accessToken, admin: mapAdmin({ ...row, last_login_at: new Date() }) };
}

/** Resolves the active admin behind a bearer token, validating the session. */
export async function getActiveAdminFromToken(token: string): Promise<AdminUser> {
  const claims = await verifyAdminToken(token);

  const session = await getSession(claims.sid);
  if (!session || session.revoked_at || isExpired(session.expires_at)) {
    throw new UnauthorizedError("Session is no longer valid");
  }

  const admin = await getAdminRowById(claims.sub);
  if (!admin || admin.status !== "active") {
    throw new UnauthorizedError("Admin account is not active");
  }

  return mapAdmin(admin);
}

/** Creates a new admin user (used by the admin:create script). */
export async function createAdmin(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<AdminUser> {
  const email = normalizeEmail(input.email);
  const existing = await getAdminRowByEmail(email);
  if (existing) {
    throw new ConflictError(`Admin with email '${email}' already exists`);
  }

  const passwordHash = await hashPassword(input.password);
  const { rows } = await query<AdminRow>(
    `INSERT INTO admin_users (email, display_name, password_hash)
     VALUES ($1, $2, $3) RETURNING *`,
    [email, input.displayName, passwordHash],
  );
  return mapAdmin(rows[0]!);
}
