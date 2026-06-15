import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/audit/audit.repository.js", () => ({
  insertAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const { insertAuditEvent } = await import("../../src/audit/audit.repository.js");
const { recordAuditEvent, recordIngestionDenied } = await import(
  "../../src/audit/audit.service.js"
);

const mockInsert = vi.mocked(insertAuditEvent);

describe("audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  it("redacts sensitive metadata before persisting", async () => {
    await recordAuditEvent({
      eventType: "test.event",
      actorType: "system",
      result: "allowed",
      metadata: { password: "secret", ok: 1 },
    });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsert.mock.calls[0]![0].metadata).toEqual({ password: "[REDACTED]", ok: 1 });
  });

  it("never throws when the repository fails", async () => {
    mockInsert.mockRejectedValueOnce(new Error("database down"));
    await expect(
      recordAuditEvent({ eventType: "test.event", actorType: "system", result: "failed" }),
    ).resolves.toBeUndefined();
  });

  it("maps denied ingestion to the correct event fields", async () => {
    await recordIngestionDenied({ reason: "missing_key", requestId: "req-1" });
    const event = mockInsert.mock.calls.at(-1)![0];
    expect(event.eventType).toBe("telemetry.ingestion.denied");
    expect(event.result).toBe("denied");
    expect(event.actorType).toBe("anonymous");
    expect(event.reason).toBe("missing_key");
    expect(event.requestId).toBe("req-1");
  });
});
