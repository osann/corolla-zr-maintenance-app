// Weather hints.
import { BACKEND_URL } from './config.js';
import { calcNextDue } from './log.js';
import { state } from './state.js';

export async function fetchWeatherForecast(postcode) {
  if (!/^\d{4}$/.test(postcode)) return null;
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/weather?postcode=${encodeURIComponent(postcode)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ── Weather triggers ─────────────────────────────────────────────────────

export function evalWeatherTriggers(forecast) {
  const result = { rainTomorrow: false, rainDay: null, heatWave: false, heatDay: null };
  if (!Array.isArray(forecast) || forecast.length < 2) return result;

  const toWeekday = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long' });
  };

  if ((forecast[1]?.rain_chance ?? 0) >= 50) {
    result.rainTomorrow = true;
    for (let i = 1; i < Math.min(forecast.length, 8); i++) {
      if ((forecast[i]?.rain_chance ?? 0) < 50) {
        result.rainDay = toWeekday(forecast[i].date);
        break;
      }
    }
  }

  for (let i = 0; i < Math.min(forecast.length, 7); i++) {
    if ((forecast[i]?.temp_max ?? 0) >= 35) {
      result.heatWave = true;
      result.heatDay = toWeekday(forecast[i].date);
      break;
    }
  }

  return result;
}

export function isBeadMachineDueSoon() {
  const due = calcNextDue('beadMachine');
  if (due === null) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86400000) <= 14;
}

export function renderWeatherCards(triggers) {
  const section = document.getElementById('weather-section');
  if (!section) return;

  const rainCard = document.getElementById('weather-rain-card');
  const rainDesc = document.getElementById('weather-rain-desc');
  const heatCard = document.getElementById('weather-heat-card');
  const heatDesc = document.getElementById('weather-heat-desc');

  if (triggers.rainTomorrow) {
    rainDesc.textContent = triggers.rainDay
      ? `Rain is likely tomorrow — wait until ${triggers.rainDay} for the next wash.`
      : `Rain is likely tomorrow — check the forecast before washing.`;
    rainCard.style.display = '';
  } else {
    rainCard.style.display = 'none';
  }

  const showHeat = triggers.heatWave && isBeadMachineDueSoon();
  if (showHeat) {
    const peak = triggers.heatDay ? ` Temperatures reaching 35°C+ are expected ${triggers.heatDay}.` : '';
    heatDesc.textContent = `High UV and heat accelerate sealant breakdown.${peak} Consider a Bead Machine reapplication before the heat arrives.`;
    heatCard.style.display = '';
  } else {
    heatCard.style.display = 'none';
  }

  section.style.display = triggers.rainTomorrow || showHeat ? '' : 'none';
}

export async function loadWeather() {
  const postcode = state.settings.car?.postcode?.trim();
  const section = document.getElementById('weather-section');
  if (!postcode || !section) {
    if (section) section.style.display = 'none';
    return;
  }
  const forecast = await fetchWeatherForecast(postcode);
  if (!forecast) {
    section.style.display = 'none';
    return;
  }
  state.weatherCache = forecast;
  renderWeatherCards(evalWeatherTriggers(forecast));
}
