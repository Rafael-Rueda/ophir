import { ConflictError, NotFoundError } from "../shared/errors.js";
import type { SourceApplication } from "../telemetry/telemetry-types.js";
import {
  ensureDefaultRoutes,
  getSourceById,
  getSourceBySlugEnvironment,
  insertSource,
  listSources,
  updateSource,
  type InsertSourceInput,
  type UpdateSourceInput,
} from "./source.repository.js";

/** Creates a source application and seeds default logs/traces/metrics routes. */
export async function createSource(input: InsertSourceInput): Promise<SourceApplication> {
  const existing = await getSourceBySlugEnvironment(input.slug, input.environment);
  if (existing) {
    throw new ConflictError(
      `Source '${input.slug}' already exists in environment '${input.environment}'`,
    );
  }
  const source = await insertSource(input);
  await ensureDefaultRoutes(source.id);
  return source;
}

export async function getSourceOrThrow(id: string): Promise<SourceApplication> {
  const source = await getSourceById(id);
  if (!source) throw new NotFoundError("Source application not found");
  return source;
}

export async function listAllSources(): Promise<SourceApplication[]> {
  return listSources();
}

export async function updateSourceById(
  id: string,
  input: UpdateSourceInput,
): Promise<SourceApplication> {
  const updated = await updateSource(id, input);
  if (!updated) throw new NotFoundError("Source application not found");
  return updated;
}
