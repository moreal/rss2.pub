import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

export type Telemetry = {
  readonly enabled: boolean;
  shutdown(): Promise<void>;
};

/**
 * Boots the OpenTelemetry NodeSDK when an OTLP endpoint is configured
 * (standard OTEL_EXPORTER_OTLP_ENDPOINT env). When disabled, the no-op
 * global providers stay in place, so instrumented code costs nothing.
 * Fedify's built-in tracing/metrics pick up the global providers.
 */
export function startTelemetry(params: {
  readonly serviceName: string;
  readonly endpoint: string | undefined;
}): Telemetry {
  if (params.endpoint === undefined || params.endpoint.trim() === "") {
    return { enabled: false, shutdown: async () => {} };
  }
  const sdk = new NodeSDK({
    serviceName: params.serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
  });
  sdk.start();
  return {
    enabled: true,
    shutdown: () => sdk.shutdown(),
  };
}
