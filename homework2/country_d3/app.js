// World GeoJSON (countries with names already included)
const GEO_URL = "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson";

// Rest Countries API
const REST_BY_NAME = "https://restcountries.com/v3.1/name/";

// DOM
const svg = d3.select("#globe");
const mapStatus = document.getElementById("mapStatus");

const countryTitle = document.getElementById("countryTitle");
const flagImg = document.getElementById("flagImg");
const infoBody = document.getElementById("infoBody");
const apiStatus = document.getElementById("apiStatus");

// Globals
let width = 900;
let height = 520;

let projection, path;
let countriesSelection;

let currentRotation = [0, -15, 0]; // [lambda, phi, gamma]
let zoomScale = 1;

// Some common name mismatches between world datasets and Rest Countries
const NAME_FIXES = new Map([
    ["United States of America", "United States"],
    ["Russian Federation", "Russia"],
    ["Dem. Rep. Congo", "Congo"],
    ["Congo (Democratic Republic of the)", "Congo"],
    ["Congo, Dem. Rep.", "Congo"],
    ["Cote d'Ivoire", "Ivory Coast"],
    ["Côte d'Ivoire", "Ivory Coast"],
    ["Korea, Republic of", "South Korea"],
    ["Korea, Dem. Rep.", "North Korea"],
    ["Syrian Arab Republic", "Syria"],
    ["Viet Nam", "Vietnam"],
    ["Lao PDR", "Laos"],
    ["Iran (Islamic Republic of)", "Iran"],
    ["Bolivia (Plurinational State of)", "Bolivia"],
    ["Tanzania, United Republic of", "Tanzania"],
    ["Venezuela (Bolivarian Republic of)", "Venezuela"],
    ["Brunei Darussalam", "Brunei"],
    ["Myanmar", "Burma"],
    ["Czechia", "Czech Republic"]
]);

// Init
document.addEventListener("DOMContentLoaded", () => {
    setupSvg();
    loadMap();

    window.addEventListener("resize", () => {
        setupSvg();
        redraw();
    });
});

function setupSvg() {
    const wrap = document.getElementById("globeWrap");
    const rect = wrap ? wrap.getBoundingClientRect() : { width: 900 };

    width = Math.max(320, Math.floor(rect.width || 900));
    height = 520;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    projection = d3.geoOrthographic()
        .translate([width / 2, height / 2])
        .scale(Math.min(width, height) * 0.42 * zoomScale)
        .clipAngle(90)
        .rotate(currentRotation);

    path = d3.geoPath(projection);
}

async function loadMap() {
    setMapStatus("Loading map…");

    try {
        const geo = await d3.json(GEO_URL);

        if (!geo || !geo.features || !Array.isArray(geo.features)) {
            throw new Error("GeoJSON missing features");
        }

        // Ensure each feature has a usable name
        geo.features.forEach(f => {
            if (!f.properties) f.properties = {};
            if (!f.properties.name) f.properties.name = "Unknown";
        });

        drawGlobe(geo.features);
        setMapStatus("Ready: drag/zoom/click a country");
    } catch (err) {
        console.error(err);
        setMapStatus("Error loading map: " + (err && err.message ? err.message : "unknown"));
    }
}

function drawGlobe(countries) {
    svg.selectAll("*").remove();

    // Ocean sphere
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("d", path)
        .attr("fill", "#cfe8ff")
        .attr("stroke", "#9fbad6")
        .attr("stroke-width", 1);

    // Graticule lines
    const graticule = d3.geoGraticule10();
    svg.append("path")
        .datum(graticule)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#9fbad6")
        .attr("stroke-opacity", 0.55)
        .attr("stroke-width", 0.6);

    // Countries
    const g = svg.append("g").attr("class", "countries");

    countriesSelection = g.selectAll("path")
        .data(countries)
        .join("path")
        .attr("d", path)
        .attr("fill", "#f2f2f2")
        .attr("stroke", "#777")
        .attr("stroke-width", 0.5)
        .on("mousemove", (event) => {
            d3.select(event.currentTarget).attr("fill", "#ffe8a3");
        })
        .on("mouseout", (event) => {
            d3.select(event.currentTarget).attr("fill", "#f2f2f2");
        })
        .on("click", (event, d) => {
            event.stopPropagation();
            const rawName = (d.properties && d.properties.name) ? d.properties.name : "Unknown";
            selectCountry(d, rawName);
        });

    // Drag to rotate globe
    svg.call(
        d3.drag().on("drag", (event) => {
            const k = 0.25;
            currentRotation = [
                currentRotation[0] + event.dx * k,
                currentRotation[1] - event.dy * k,
                0
            ];
            projection.rotate(currentRotation);
            redraw();
        })
    );

    // Zoom to scale
    svg.call(
        d3.zoom()
            .scaleExtent([0.7, 2.2])
            .on("zoom", (event) => {
                zoomScale = event.transform.k;
                projection.scale(Math.min(width, height) * 0.42 * zoomScale);
                redraw();
            })
    );
}

function redraw() {
    if (!path) return;
    svg.selectAll("path").attr("d", path);
}

function setMapStatus(text) {
    if (mapStatus) mapStatus.textContent = text;
}

function selectCountry(feature, name) {
    // Outline the selected country
    if (countriesSelection) {
        countriesSelection.attr("stroke-width", 0.5).attr("stroke", "#777");
    }
    d3.selectAll(".countries path")
        .filter(d => d === feature)
        .attr("stroke", "#263238")
        .attr("stroke-width", 1.4);

    loadCountryDetails(name);
}

function normalizeCountryName(name) {
    const trimmed = (name || "").trim();
    if (NAME_FIXES.has(trimmed)) return NAME_FIXES.get(trimmed);

    // Some datasets include extra parentheses bits; remove them lightly
    return trimmed.replace(/\s*\(.*?\)\s*/g, "").trim();
}

async function loadCountryDetails(mapName) {
    const name = normalizeCountryName(mapName);

    if (apiStatus) apiStatus.textContent = "Loading country details…";
    if (countryTitle) countryTitle.textContent = mapName;

    if (infoBody) infoBody.innerHTML = "";
    if (flagImg) {
        flagImg.style.display = "none";
        flagImg.src = "";
    }

    try {
        // Try fullText first (exact matches), then fallback to partial match
        const fullUrl = `${REST_BY_NAME}${encodeURIComponent(name)}?fullText=true`;
        let data = await fetchJson(fullUrl).catch(() => null);

        if (!data) {
            const fallbackUrl = `${REST_BY_NAME}${encodeURIComponent(name)}`;
            data = await fetchJson(fallbackUrl);
        }

        const best = pickBestMatch(data, name);
        renderCountry(best);

        if (apiStatus) apiStatus.textContent = "";
    } catch (err) {
        console.error(err);
        if (apiStatus) apiStatus.textContent = "Could not load details (try another country).";
        if (infoBody) {
            infoBody.innerHTML = `<p class="small-note">No data returned for "${escapeHtml(name)}".</p>`;
        }
    }
}

function pickBestMatch(arr, targetName) {
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("No results");

    const t = targetName.trim().toLowerCase();

    // Prefer exact "common" name match
    let best = arr.find(c => (c.name?.common || "").trim().toLowerCase() === t);
    if (best) return best;

    // Otherwise prefer exact "official" name match
    best = arr.find(c => (c.name?.official || "").trim().toLowerCase() === t);
    if (best) return best;

    // Otherwise just take the first result
    return arr[0];
}

function renderCountry(c) {
    const commonName = c.name?.common || "Unknown";
    if (countryTitle) countryTitle.textContent = commonName;

    const capital = (c.capital && c.capital.length) ? c.capital.join(", ") : "N/A";
    const region = c.region || "N/A";
    const subregion = c.subregion || "N/A";
    const population = (typeof c.population === "number") ? c.population.toLocaleString() : "N/A";

    const languages = c.languages ? Object.values(c.languages).join(", ") : "N/A";
    const currencies = c.currencies ? Object.values(c.currencies).map(x => x.name).join(", ") : "N/A";
    const timezones = (c.timezones && c.timezones.length) ? c.timezones.join(", ") : "N/A";

    const flagUrl = c.flags?.png || c.flags?.svg || "";

    if (flagImg && flagUrl) {
        flagImg.src = flagUrl;
        flagImg.style.display = "block";
    }

    if (infoBody) {
        infoBody.innerHTML = `
      <p class="kv"><span>Capital:</span> ${escapeHtml(capital)}</p>
      <p class="kv"><span>Region:</span> ${escapeHtml(region)} (${escapeHtml(subregion)})</p>
      <p class="kv"><span>Population:</span> ${escapeHtml(population)}</p>
      <p class="kv"><span>Languages:</span> ${escapeHtml(languages)}</p>
      <p class="kv"><span>Currencies:</span> ${escapeHtml(currencies)}</p>
      <p class="kv"><span>Timezones:</span> ${escapeHtml(timezones)}</p>
    `;
    }
}

// Helpers
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}