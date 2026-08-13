export function registerContentCommands(registry, { weather, translator }) {
  registry.register({
    name: "weather",
    aliases: ["thoitiet"],
    description: "Xem thời tiết hiện tại",
    async execute({ args, reply }) {
      const location = args.join(" ").trim();
      if (!location) { await reply("Dùng: !weather <địa điểm>"); return; }
      const data = await weather.current(location);
      await reply([
        `THỜI TIẾT — ${data.place}`,
        data.description,
        `Nhiệt độ: ${data.temperature}°C`,
        `Cảm giác: ${data.feelsLike}°C`,
        `Độ ẩm: ${data.humidity}%`,
        `Lượng mưa: ${data.precipitation} mm`,
        `Gió: ${data.windSpeed} km/h`,
        `Cập nhật: ${data.time}`,
      ].join("\n"));
    },
  });
  registry.register({
    name: "translate",
    aliases: ["dich"],
    description: "Dịch văn bản sang ngôn ngữ khác",
    async execute({ args, reply }) {
      let target = "vi";
      if (/^[a-z]{2,5}(?:-[A-Z]{2})?$/.test(args[0] || "")) target = args.shift();
      const text = args.join(" ").trim();
      if (!text) { await reply("Dùng: !translate [mã ngôn ngữ] <nội dung>"); return; }
      const result = await translator.translate(text, target);
      await reply(`Bản dịch (${result.detectedLanguage} → ${result.target}):\n${result.text}`);
    },
  });
}
