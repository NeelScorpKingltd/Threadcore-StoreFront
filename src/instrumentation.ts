export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL_ENV === "preview") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({
      serviceName: process.env.VERCEL_PROJECT_NAME || "threadcore",
      // Explicit spans avoid automatic URL/header/body or SQL collection.
      instrumentations: [],
      propagators: ["tracecontext"],
      attributesFromHeaders: {},
    });
  }
}
