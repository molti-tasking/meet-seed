// Tiny structured logger. Pretty in dev, JSON lines in production (greppable in
// Coolify logs). Level via LOG_LEVEL (debug|info|warn|error).
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN =
  ORDER[(process.env.LOG_LEVEL as Level) ?? "debug"] ??
  (process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug);

type Ctx = Record<string, unknown>;

// Make errors (and anything thrown) serializable.
function clean(ctx?: Ctx): Ctx | undefined {
  if (!ctx) return undefined;
  const out: Ctx = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] =
      v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
}

function emit(level: Level, msg: string, ctx?: Ctx) {
  if (ORDER[level] < MIN) return;
  const c = clean(ctx);
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production") {
    sink(JSON.stringify({ t: new Date().toISOString(), level, msg, ...c }));
  } else {
    sink(`[${level}] ${msg}`, c ?? "");
  }
}

export const log = {
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};
