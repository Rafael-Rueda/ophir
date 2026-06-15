import { query } from "../db/client.js";
import { getEnv } from "../config/env.js";
import type { TelemetrySignal } from "../config/runtime.js";

export interface DashboardLinkView {
  id: string;
  sourceId: string | null;
  title: string;
  telemetryType: TelemetrySignal | "overview";
  url: string;
}

interface DashboardRow {
  id: string;
  source_application_id: string | null;
  title: string;
  url_template: string;
  telemetry_type: TelemetrySignal | "overview";
  source_slug: string | null;
  source_environment: string | null;
}

function resolveUrl(
  template: string,
  context: { grafanaBaseUrl: string; sourceSlug: string | null; environment: string | null },
): string {
  return template
    .replaceAll("{grafanaBaseUrl}", context.grafanaBaseUrl)
    .replaceAll("{sourceSlug}", context.sourceSlug ?? "")
    .replaceAll("{environment}", context.environment ?? "")
    .replaceAll("{from}", "now-1h")
    .replaceAll("{to}", "now");
}

export interface DashboardLinkFilter {
  sourceId?: string;
  telemetryType?: TelemetrySignal | "overview";
}

/** Lists active dashboard links, resolving URL templates to absolute URLs. */
export async function listActiveDashboardLinks(
  filter: DashboardLinkFilter = {},
): Promise<DashboardLinkView[]> {
  const conditions: string[] = ["d.status = 'active'"];
  const params: unknown[] = [];
  let i = 1;

  if (filter.sourceId) {
    conditions.push(`d.source_application_id = $${i++}`);
    params.push(filter.sourceId);
  }
  if (filter.telemetryType) {
    conditions.push(`d.telemetry_type = $${i++}`);
    params.push(filter.telemetryType);
  }

  const { rows } = await query<DashboardRow>(
    `SELECT d.id, d.source_application_id, d.title, d.url_template, d.telemetry_type,
            s.slug AS source_slug, s.environment AS source_environment
     FROM dashboard_links d
     LEFT JOIN source_applications s ON s.id = d.source_application_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.title`,
    params,
  );

  const grafanaBaseUrl = getEnv().GRAFANA_PUBLIC_URL.replace(/\/+$/, "");

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_application_id,
    title: row.title,
    telemetryType: row.telemetry_type,
    url: resolveUrl(row.url_template, {
      grafanaBaseUrl,
      sourceSlug: row.source_slug,
      environment: row.source_environment,
    }),
  }));
}

/** Seeds default Grafana dashboard/Explore links if none exist yet. */
export async function seedDefaultDashboardLinks(): Promise<void> {
  const grafana = await query<{ id: string }>(
    `SELECT id FROM telemetry_integrations WHERE kind = 'grafana' ORDER BY created_at LIMIT 1`,
  );
  const grafanaId = grafana.rows[0]?.id ?? null;

  const defaults = [
    { title: "Ophir Overview", telemetryType: "overview", urlTemplate: "{grafanaBaseUrl}/d/ophir-overview" },
    { title: "Logs Explore (Loki)", telemetryType: "logs", urlTemplate: "{grafanaBaseUrl}/explore" },
    { title: "Traces Explore (Tempo)", telemetryType: "traces", urlTemplate: "{grafanaBaseUrl}/explore" },
    {
      title: "Metrics Explore (Prometheus)",
      telemetryType: "metrics",
      urlTemplate: "{grafanaBaseUrl}/explore",
    },
  ];

  for (const link of defaults) {
    await query(
      `INSERT INTO dashboard_links (integration_id, title, url_template, telemetry_type)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM dashboard_links WHERE title = $2)`,
      [grafanaId, link.title, link.urlTemplate, link.telemetryType],
    );
  }
}
