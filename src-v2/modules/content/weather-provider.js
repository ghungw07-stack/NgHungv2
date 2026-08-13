const WEATHER = Object.freeze({
  0: "Trời quang", 1: "Ít mây", 2: "Có mây", 3: "Nhiều mây",
  45: "Sương mù", 48: "Sương mù đóng băng", 51: "Mưa phùn nhẹ", 53: "Mưa phùn", 55: "Mưa phùn dày",
  61: "Mưa nhẹ", 63: "Mưa vừa", 65: "Mưa lớn", 71: "Tuyết nhẹ", 73: "Tuyết vừa", 75: "Tuyết lớn",
  80: "Mưa rào nhẹ", 81: "Mưa rào", 82: "Mưa rào lớn", 95: "Dông", 96: "Dông kèm mưa đá", 99: "Dông mạnh kèm mưa đá",
});

export class WeatherProvider {
  constructor(http) { this.http = http; }
  async current(location) {
    const searchUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=vi&format=json`;
    const search = await this.http.json(searchUrl);
    const place = search?.results?.[0];
    if (!place) throw new Error("Không tìm thấy địa điểm");
    const params = new URLSearchParams({
      latitude: String(place.latitude), longitude: String(place.longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
      timezone: "Asia/Ho_Chi_Minh",
    });
    const forecast = await this.http.json(`https://api.open-meteo.com/v1/forecast?${params}`);
    const current = forecast.current;
    if (!current) throw new Error("Dịch vụ thời tiết không trả dữ liệu");
    return {
      place: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
      description: WEATHER[current.weather_code] || `Mã thời tiết ${current.weather_code}`,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      windSpeed: current.wind_speed_10m,
      time: current.time,
    };
  }
}
