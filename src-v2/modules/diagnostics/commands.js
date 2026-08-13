function mbps(value) { return ((Number(value) || 0) * 8 / 1_000_000).toFixed(2); }

export function registerDiagnosticCommands(registry, { diagnostics }) {
  registry.register({
    name: "benchmark", aliases: ["cpuspeed", "cpus"], cooldownMs: 120_000, description: "Đo nhanh hiệu năng CPU trong worker riêng",
    async execute({ reply }) {
      await reply("Đang benchmark CPU trong worker giới hạn...");
      const result = await diagnostics.benchmark();
      await reply(["KẾT QUẢ BENCHMARK", `CPU: ${result.cpu}`, `Luồng hệ thống: ${result.cores}`, `SHA-256: ${result.operations.toLocaleString("vi-VN")} phép tính`, `Thời gian: ${result.elapsedMs} ms`].join("\n"));
    },
  });
  registry.register({
    name: "speedtest", aliases: ["spdt", "spt"], cooldownMs: 60_000, active: false, description: "Đo tốc độ mạng của máy chủ bot",
    async execute({ reply }) {
      await reply("Đang đo tốc độ mạng, dự kiến khoảng 20–45 giây...");
      const result = await diagnostics.speedtest();
      await reply(["KẾT QUẢ SPEEDTEST", `Ping: ${Number(result.ping?.latency || 0).toFixed(2)} ms`, `Download: ${mbps(result.download?.bandwidth)} Mbps`, `Upload: ${mbps(result.upload?.bandwidth)} Mbps`, `Máy chủ: ${result.server?.name || "Không rõ"} — ${result.server?.location || ""}`, `Nhà mạng: ${result.isp || "Không rõ"}`].join("\n"));
    },
  });
}
export { mbps };
