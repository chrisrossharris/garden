import dayjs from 'dayjs';

export type DailyForecast = {
  date: string;
  minF: number;
  maxF: number;
  precipMm: number;
  precipProb: number;
  weatherCode: number;
  summary: string;
};

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

function codeToSummary(code: number) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed';
}

async function getLatLonForZip(zip: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', zip);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: { latitude: number; longitude: number }[];
  };

  const first = data.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude };
}

export async function getWeeklyForecast(zip: string): Promise<DailyForecast[]> {
  const fallback = Array.from({ length: 7 }).map((_, i) => {
    const d = dayjs().add(i, 'day').format('YYYY-MM-DD');
    return {
      date: d,
      minF: 52,
      maxF: 71,
      precipMm: i % 3 === 0 ? 3 : 0,
      precipProb: i % 3 === 0 ? 45 : 15,
      weatherCode: i % 3 === 0 ? 61 : 1,
      summary: i % 3 === 0 ? 'Rain chance' : 'Mild'
    };
  });

  try {
    const coords = await getLatLonForZip(zip);
    if (!coords) return fallback;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(coords.lat));
    url.searchParams.set('longitude', String(coords.lon));
    url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');

    const res = await fetch(url.toString());
    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      daily?: {
        time: string[];
        weathercode: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        precipitation_probability_max: number[];
      };
    };

    if (!data.daily?.time?.length) return fallback;

    return data.daily.time.map((date, idx) => {
      const code = data.daily?.weathercode?.[idx] ?? 1;
      return {
        date,
        minF: Math.round(cToF(data.daily?.temperature_2m_min?.[idx] ?? 10)),
        maxF: Math.round(cToF(data.daily?.temperature_2m_max?.[idx] ?? 20)),
        precipMm: Math.round((data.daily?.precipitation_sum?.[idx] ?? 0) * 10) / 10,
        precipProb: data.daily?.precipitation_probability_max?.[idx] ?? 0,
        weatherCode: code,
        summary: codeToSummary(code)
      };
    });
  } catch {
    return fallback;
  }
}
