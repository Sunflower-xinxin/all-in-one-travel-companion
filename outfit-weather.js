(() => {
  "use strict";

  const CACHE_PREFIX = "luxia:weather:v1";
  const CACHE_AGE = 30 * 60 * 1000;

  const weatherText = (code) => {
    if (code === 0) return ["晴朗", "☀"];
    if ([1, 2].includes(code)) return ["晴间多云", "◐"];
    if (code === 3) return ["多云", "☁"];
    if ([45, 48].includes(code)) return ["有雾", "≋"];
    if ([51, 53, 55, 56, 57].includes(code)) return ["毛毛雨", "☂"];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ["有雨", "☂"];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ["有雪", "❄"];
    if ([95, 96, 99].includes(code)) return ["雷雨", "ϟ"];
    return ["天气待更新", "○"];
  };

  function advice(min, max, rain) {
    const layers = max <= 8 ? "厚外套或羽绒，注意保暖" : max <= 15 ? "毛衣加外套，适合分层穿着" : max <= 22 ? "薄外套或针织衫，早晚可叠穿" : max <= 27 ? "轻薄上装，备一件防风层" : "透气轻薄衣物，注意防晒";
    return rain >= 45 ? `${layers}；降雨概率较高，建议带伞。` : `${layers}。`;
  }

  function cacheKey(destination) {
    return `${CACHE_PREFIX}:${encodeURIComponent(destination.toLowerCase())}`;
  }

  function getCache(destination) {
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey(destination)) || "null");
      return value && Date.now() - value.savedAt < CACHE_AGE ? value.payload : null;
    } catch {
      return null;
    }
  }

  function setCache(destination, payload) {
    try {
      localStorage.setItem(cacheKey(destination), JSON.stringify({ savedAt: Date.now(), payload }));
    } catch {
      // Weather can always be fetched again; storage failure should not block outfits.
    }
  }

  async function fetchWeather(trip) {
    const destination = trip?.trip?.primaryDestinationName || trip?.trip?.citiesAndAreas?.[0];
    if (!destination) throw new Error("缺少目的地");
    const cached = getCache(destination);
    if (cached) return cached;

    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", destination);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "zh");
    geoUrl.searchParams.set("format", "json");
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("目的地定位失败");
    const location = (await geoResponse.json()).results?.[0];
    if (!location) throw new Error("没有找到目的地天气位置");

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,wind_speed_10m_max");
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", "16");
    const forecastResponse = await fetch(forecastUrl);
    if (!forecastResponse.ok) throw new Error("天气服务暂时不可用");
    const forecast = await forecastResponse.json();
    const daily = forecast.daily || {};
    const byDate = {};
    (daily.time || []).forEach((date, index) => {
      const min = Math.round(daily.temperature_2m_min?.[index]);
      const max = Math.round(daily.temperature_2m_max?.[index]);
      const rain = Math.round(daily.precipitation_probability_max?.[index] || 0);
      const [condition, icon] = weatherText(daily.weather_code?.[index]);
      byDate[date] = {
        min,
        max,
        rain,
        wind: Math.round(daily.wind_speed_10m_max?.[index] || 0),
        condition,
        icon,
        advice: advice(min, max, rain)
      };
    });
    const payload = { byDate, destination: location.name || destination, updatedAt: new Date().toISOString(), source: "Open-Meteo" };
    setCache(destination, payload);
    return payload;
  }

  function dispatch(detail) {
    window.dispatchEvent(new CustomEvent("travel-weather-ready", { detail }));
  }

  document.addEventListener("travel-data-ready", (event) => {
    dispatch({ byDate: {}, loading: true });
    fetchWeather(event.detail).then(dispatch).catch((error) => dispatch({ byDate: {}, error: error.message }));
  });
})();
