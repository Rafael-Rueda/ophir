import type { TelemetrySignal } from "../config/runtime.js";

export type { TelemetrySignal };

export type SourceStatus = "active" | "disabled";
export type CredentialStatus = "active" | "disabled" | "rotated";

/** A registered external application allowed to send telemetry. */
export interface SourceApplication {
  id: string;
  slug: string;
  displayName: string;
  environment: string;
  ownerName: string | null;
  ownerContact: string | null;
  status: SourceStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** An ingestion API key belonging to a source application. */
export interface SourceCredential {
  id: string;
  sourceApplicationId: string;
  keyPrefix: string;
  keyHash: string;
  status: CredentialStatus;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  rotatedAt: Date | null;
}

/** How one source + telemetry signal should be forwarded. */
export interface TelemetryRoute {
  id: string;
  sourceApplicationId: string;
  telemetryType: TelemetrySignal;
  collectorEndpointPath: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of a successful source-key authentication. */
export interface AuthenticatedSource {
  source: SourceApplication;
  credentialId: string;
  keyPrefix: string;
}

/** Outcome of forwarding a telemetry batch to the Collector. */
export interface ForwardResult {
  ok: boolean;
  status: number;
  durationMs: number;
  error?: string;
}
