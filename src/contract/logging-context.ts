import { Logging, LoggingConfig } from "@decaf-ts/logging";
import { Context as Ctx } from "fabric-contract-api";

let userFieldRegistered = false;

export function ensureContractLogFieldRegistration() {
  if (userFieldRegistered) return;
  userFieldRegistered = true;
  Logging.register({
    key: "correlationId",
    shouldInclude(payload: any) {
      const value = payload?.correlationId ?? payload?.config?.correlationId;
      return Boolean(value);
    },
    render(payload: any) {
      const value = payload?.correlationId ?? payload?.config?.correlationId;
      return value === undefined || value === null
        ? undefined
        : `, correlationId: ${String(value)}`;
    },
    style(rendered: string, payload: any) {
      return payload.applyTheme(rendered, "id");
    },
  } as any);
  Logging.register({
    key: "user",
    shouldInclude(payload: any) {
      const value = payload?.user ?? payload?.config?.user;
      return Boolean(value);
    },
    render(payload: any) {
      const value = payload?.user ?? payload?.config?.user;
      return value === undefined || value === null
        ? undefined
        : `, user: ${String(value)}`;
    },
    style(rendered: string, payload: any) {
      return payload.applyTheme(rendered, "id");
    },
  } as any);
}

export function enrichContractLoggingConfig(
  conf: Partial<LoggingConfig> | undefined,
  ctx?: Ctx
): (Partial<LoggingConfig> & { user?: string }) | undefined {
  if (!ctx) return conf;
  const txId = ctx.stub?.getTxID?.();
  const compactTxId = trimCorrelationId(txId);
  const user = extractUserFromIdentity(ctx.clientIdentity?.getID?.());
  const useDefaultFabricFormatting = !conf?.pattern;
  return {
    ...(conf || {}),
    correlationId: conf?.correlationId || compactTxId,
    user: (conf as any)?.user || user,
    pattern: conf?.pattern || "{message}{user}{correlationId} {stack}",
    logLevel: useDefaultFabricFormatting ? false : conf?.logLevel,
    timestamp: useDefaultFabricFormatting ? false : conf?.timestamp,
    context: useDefaultFabricFormatting ? false : conf?.context,
    separator: useDefaultFabricFormatting ? "" : conf?.separator,
  };
}

export function extractUserFromIdentity(id?: string): string | undefined {
  if (!id) return undefined;
  const emailMatch = id.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
  );
  return emailMatch?.[0];
}

export function trimCorrelationId(id?: string): string | undefined {
  if (!id) return undefined;
  if (id.length <= 10) return id;
  return `${id.slice(0, 5)}-${id.slice(-5)}`;
}
