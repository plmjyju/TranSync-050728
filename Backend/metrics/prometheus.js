import client from "prom-client";

// Default registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Counters
export const splitScanCounter = new client.Counter({
  name: "split_scan_total",
  help: "Total split package scans",
  labelNames: ["tenant", "warehouse"],
});
export const splitFinalizeCounter = new client.Counter({
  name: "split_finalize_total",
  help: "Total finalize attempts",
  labelNames: ["tenant", "warehouse", "result"],
});
export const ledgerOutboxCounter = new client.Counter({
  name: "ledger_outbox_events_total",
  help: "Outbox events processed",
  labelNames: ["event"],
});

// Gauges
export const ledgerOutboxPendingGauge = new client.Gauge({
  name: "ledger_outbox_pending",
  help: "Current pending ledger outbox records",
});

// Histograms
export const finalizeDurationHist = new client.Histogram({
  name: "split_finalize_duration_seconds",
  help: "Duration of finalize transactions",
  buckets: [0.5, 1, 2, 3, 5, 8, 13, 21],
});

register.registerMetric(splitScanCounter);
register.registerMetric(splitFinalizeCounter);
register.registerMetric(ledgerOutboxCounter);
register.registerMetric(ledgerOutboxPendingGauge);
register.registerMetric(finalizeDurationHist);

export function metricsMiddleware(req, res) {
  res.set("Content-Type", register.contentType);
  register.metrics().then((m) => res.end(m));
}

export default register;
