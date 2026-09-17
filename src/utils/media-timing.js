export function logMediaTiming(stage, startedAt, details) {
  const enabled = process.env.NGH_UPLOAD_LATENCY_LOG ?? process.env.NGH_COMMAND_LATENCY_LOG;
  if (enabled !== "1") return;
  console.error(`[media-latency] ${JSON.stringify({
    stage,
    ...details,
    totalMs: Math.round(performance.now() - startedAt),
  })}`);
}
