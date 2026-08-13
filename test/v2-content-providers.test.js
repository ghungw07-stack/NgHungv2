import assert from "node:assert/strict";
import test from "node:test";
import { WeatherProvider } from "../src-v2/modules/content/weather-provider.js";
import { TranslateProvider } from "../src-v2/modules/content/translate-provider.js";

test("weather provider combines geocoding and current weather", async () => {
  const http = { async json(url) {
    if (url.includes("geocoding-api")) return { results: [{ name: "Hà Nội", country: "Việt Nam", latitude: 21, longitude: 105 }] };
    return { current: { temperature_2m: 30, apparent_temperature: 33, relative_humidity_2m: 70, precipitation: 0, weather_code: 1, wind_speed_10m: 10, time: "now" } };
  } };
  const result = await new WeatherProvider(http).current("Hà Nội");
  assert.equal(result.place, "Hà Nội, Việt Nam");
  assert.equal(result.description, "Ít mây");
  assert.equal(result.temperature, 30);
});

test("translate provider parses translated segments", async () => {
  const http = { async json() { return [[["Xin chào", "Hello"]], null, "en"]; } };
  const result = await new TranslateProvider(http).translate("Hello", "vi");
  assert.equal(result.text, "Xin chào");
  assert.equal(result.detectedLanguage, "en");
});
