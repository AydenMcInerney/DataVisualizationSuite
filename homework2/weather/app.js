// API KEYS
const MAPQUEST_KEY = "IvKWh2Wod9NYkTLbTsykM2hhcGc7JrOP";
const OPENWEATHER_KEY = "6b296574dcf7375ec955f47d0cb6d18e";

// DOM
const form = document.getElementById("zipForm");
const zipInput = document.getElementById("zipInput");
const btn = document.getElementById("btn");
const statusEl = document.getElementById("status");

const currentSection = document.getElementById("current");
const dailySection = document.getElementById("daily");

const locationTitle = document.getElementById("locationTitle");
const currentTemp = document.getElementById("currentTemp");
const currentDesc = document.getElementById("currentDesc");
const feelsLike = document.getElementById("feelsLike");
const humidity = document.getElementById("humidity");
const wind = document.getElementById("wind");

const dailyGrid = document.getElementById("dailyGrid");

// Helpers
function setStatus(msg) {
    statusEl.textContent = msg || "";
}

function setLoading(isLoading) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "Loading..." : "Get Weather";
}

function clearUI() {
    currentSection.classList.add("hidden");
    dailySection.classList.add("hidden");
    dailyGrid.innerHTML = "";
}

function isValidZip(zip) {
    // Accepts "12345" or "12345-6789"
    return /^\d{5}(-\d{4})?$/.test(zip);
}

function dayNameFromUnix(sec) {
    const d = new Date(sec * 1000);
    return d.toLocaleDateString(undefined, { weekday: "short" });
}

function formatTemp(t) {
    return `${Math.round(t)}°F`;
}

// API 1: Zip -> Lat/Lon (MapQuest Geocoding)
async function getLatLonFromZip(zip) {
    const zip5 = zip.slice(0, 5);
    const url =
        `https://www.mapquestapi.com/geocoding/v1/address?key=${encodeURIComponent(MAPQUEST_KEY)}` +
        `&location=${encodeURIComponent(zip5)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding request failed.");

    const data = await res.json();

    const loc = data?.results?.[0]?.locations?.[0];
    const latLng = loc?.latLng;

    if (!latLng || typeof latLng.lat !== "number" || typeof latLng.lng !== "number") {
        throw new Error("Could not find coordinates for that zip code.");
    }

    const city = loc.adminArea5 || "";
    const state = loc.adminArea3 || "";
    const label = (city && state) ? `${city}, ${state}` : `Zip ${zip5}`;

    return { lat: latLng.lat, lon: latLng.lng, label };
}

// API 2a: Current Weather
async function getCurrentWeather(lat, lon) {
    const url =
        `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}` +
        `&lon=${encodeURIComponent(lon)}&units=imperial&appid=${encodeURIComponent(OPENWEATHER_KEY)}`;

    const res = await fetch(url);
    if (!res.ok) {
        let msg = "Current weather request failed.";
        try {
            const err = await res.json();
            if (err?.message) msg = err.message;
        } catch (_) {}
        throw new Error(msg);
    }
    return await res.json();
}

// API 2b: 5-Day / 3-Hour Forecast
async function get5DayForecast(lat, lon) {
    const url =
        `https://api.openweathermap.org/data/2.5/forecast?lat=${encodeURIComponent(lat)}` +
        `&lon=${encodeURIComponent(lon)}&units=imperial&appid=${encodeURIComponent(OPENWEATHER_KEY)}`;

    const res = await fetch(url);
    if (!res.ok) {
        let msg = "Forecast request failed.";
        try {
            const err = await res.json();
            if (err?.message) msg = err.message;
        } catch (_) {}
        throw new Error(msg);
    }
    return await res.json();
}

// Convert 3-hour forecast entries into daily min/max + representative icon/desc
function buildDailyFrom3HourList(list) {
    const byDate = new Map();

    for (const item of list) {
        const dateKey = item.dt_txt.slice(0, 10); // YYYY-MM-DD

        if (!byDate.has(dateKey)) {
            byDate.set(dateKey, {
                dt: item.dt,
                min: item.main.temp_min,
                max: item.main.temp_max,
                desc: item.weather?.[0]?.main || "—",
                icon: item.weather?.[0]?.icon || null,
                bestNoonDiff: Infinity
            });
        }

        const day = byDate.get(dateKey);
        day.min = Math.min(day.min, item.main.temp_min);
        day.max = Math.max(day.max, item.main.temp_max);

        // Prefer the forecast closest to 12:00 for icon/desc
        const hour = Number(item.dt_txt.slice(11, 13));
        const noonDiff = Math.abs(hour - 12);
        if (noonDiff < day.bestNoonDiff) {
            day.bestNoonDiff = noonDiff;
            day.desc = item.weather?.[0]?.main || day.desc;
            day.icon = item.weather?.[0]?.icon || day.icon;
            day.dt = item.dt;
        }
    }

    // Return next 5 days
    return Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([_, d]) => ({
            dt: d.dt,
            temp: { min: d.min, max: d.max },
            weather: [{ main: d.desc, icon: d.icon }]
        }));
}

// Render
function renderCurrent(label, data) {
    locationTitle.textContent = `Current Conditions — ${label}`;

    currentTemp.textContent = formatTemp(data.main.temp);
    currentDesc.textContent = data.weather?.[0]?.description || "—";

    feelsLike.textContent = formatTemp(data.main.feels_like);
    humidity.textContent = `${data.main.humidity}%`;
    wind.textContent = `${Math.round(data.wind.speed)} mph`;

    currentSection.classList.remove("hidden");
}

function renderDaily(dailyArr) {
    dailyGrid.innerHTML = dailyArr.map(d => {
        const name = dayNameFromUnix(d.dt);
        const hi = formatTemp(d.temp.max);
        const lo = formatTemp(d.temp.min);
        const desc = d.weather?.[0]?.main || "—";
        const icon = d.weather?.[0]?.icon || null;

        const iconUrl = icon ? `https://openweathermap.org/img/wn/${icon}@2x.png` : "";

        return `
      <div class="day">
        <h3>${name}</h3>
        ${icon ? `<img class="icon" src="${iconUrl}" alt="${desc}" />` : ""}
        <div class="small">${desc}</div>
        <div><strong>${hi}</strong> / ${lo}</div>
      </div>
    `;
    }).join("");

    dailySection.classList.remove("hidden");
}

// Main flow: submit -> validate -> geocode -> weather -> display
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearUI();
    setStatus("");

    const zip = zipInput.value.trim();

    if (!isValidZip(zip)) {
        setStatus("Please enter a valid 5-digit zip code (or 5+4 format).");
        return;
    }

    if (MAPQUEST_KEY === "YOUR_MAPQUEST_KEY" || OPENWEATHER_KEY === "YOUR_OPENWEATHER_KEY") {
        setStatus("Add your API keys in app.js before running.");
        return;
    }

    try {
        setLoading(true);
        setStatus("Looking up coordinates...");

        const { lat, lon, label } = await getLatLonFromZip(zip);

        setStatus("Fetching weather...");

        const [currentData, forecastData] = await Promise.all([
            getCurrentWeather(lat, lon),
            get5DayForecast(lat, lon)
        ]);

        if (!forecastData?.list || !Array.isArray(forecastData.list)) {
            throw new Error("Forecast data was missing expected fields.");
        }

        const dailyArr = buildDailyFrom3HourList(forecastData.list);

        renderCurrent(label, currentData);
        renderDaily(dailyArr);

        setStatus("");
    } catch (err) {
        setStatus(err.message || "Something went wrong.");
    } finally {
        setLoading(false);
    }
});