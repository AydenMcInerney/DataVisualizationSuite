const API_BASE = "https://api.coingecko.com/api/v3/coins/markets";

const svg = d3.select("#chart");
const tooltip = document.getElementById("tooltip");
const statusChip = document.getElementById("status");

const searchInput = document.getElementById("searchInput");
const topSelect = document.getElementById("topSelect");
const refreshBtn = document.getElementById("refreshBtn");

// Details panel
const detailTitle = document.getElementById("detailTitle");
const detailImg = document.getElementById("detailImg");
const detailBody = document.getElementById("detailBody");
const detailNote = document.getElementById("detailNote");

let width = 900;
let height = 560;

let allCoins = [];
let lastUpdated = null;

document.addEventListener("DOMContentLoaded", () => {
    const elems = document.querySelectorAll("select");
    M.FormSelect.init(elems);

    refreshBtn.addEventListener("click", () => loadAndRender());
    topSelect.addEventListener("change", () => loadAndRender());
    searchInput.addEventListener("input", () => renderFiltered());

    setupSvg();
    loadAndRender();

    window.addEventListener("resize", () => {
        setupSvg();
        renderFiltered();
    });
});

function setupSvg() {
    const rect = document.getElementById("chartWrap").getBoundingClientRect();
    width = Math.max(320, Math.floor(rect.width));
    height = 560;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
}

async function loadAndRender() {
    setStatus("Loading…");
    detailNote.textContent = "";

    try {
        const perPage = Number(topSelect.value || 50);
        const url = buildMarketsUrl(perPage);

        const data = await fetchJson(url);
        allCoins = (data || []).filter(d => typeof d.market_cap === "number" && d.market_cap > 0);

        lastUpdated = new Date();
        setStatus(`Loaded ${allCoins.length} coins`);
        renderFiltered();
    } catch (err) {
        console.error(err);
        setStatus("Error loading crypto data (check console)");
    }
}

function renderFiltered() {
    const q = (searchInput.value || "").trim().toLowerCase();

    const coins = allCoins.filter(c => {
        const name = (c.name || "").toLowerCase();
        const sym = (c.symbol || "").toLowerCase();
        return name.includes(q) || sym.includes(q);
    });

    renderTreemap(coins);
}

function renderTreemap(coins) {
    svg.selectAll("*").remove();

    if (!coins || coins.length === 0) {
        svg.append("text")
            .attr("x", 18)
            .attr("y", 30)
            .attr("font-size", 16)
            .text("No matches. Try a different filter.");
        return;
    }

    const root = d3.hierarchy({ children: coins })
        .sum(d => d.market_cap)
        .sort((a, b) => b.value - a.value);

    const treemap = d3.treemap()
        .size([width, height])
        .paddingInner(2)
        .paddingOuter(4);

    treemap(root);

    // Most coins move within a few percent daily, so we clamp to +/- 5%
    const CLAMP = 5;

    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

    // Diverging scale: red -> white -> green
    const diverge = d3.scaleDiverging()
        .domain([-CLAMP, 0, CLAMP])
        .interpolator(d3.interpolateRgbBasis(["#b91c1c", "#ffffff", "#15803d"]));

    const emphasize = (pct) => {
        const v = clamp(Number(pct || 0), -CLAMP, CLAMP);
        const sign = v < 0 ? -1 : 1;
        const a = Math.abs(v) / CLAMP;       // 0..1
        const boosted = Math.pow(a, 0.55);   // boost small values (0.55 < 1)
        return sign * boosted * CLAMP;
    };

    const color = (pct) => diverge(emphasize(pct));

    const nodes = svg.selectAll("g.node")
        .data(root.leaves())
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x0},${d.y0})`);

    nodes.append("rect")
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("rx", 8)
        .attr("ry", 8)
        .attr("fill", d => color(d.data.price_change_percentage_24h))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1)
        .on("mousemove", (event, d) => showTooltip(event, d))
        .on("mouseleave", hideTooltip)
        .on("click", (event, d) => {
            event.stopPropagation();
            showDetails(d.data);
        });

    // Labels (symbol + %), only if tile big enough
    nodes.each(function(d) {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 90 || h < 55) return;

        const g = d3.select(this);

        const sym = (d.data.symbol || "").toUpperCase();
        const pctVal = d.data.price_change_percentage_24h;
        const pct = formatPct(pctVal);

        // Choose text color based on background brightness for readability
        const bg = d3.color(color(pctVal));
        const luminance = bg ? (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) : 255;
        const textColor = luminance < 140 ? "#ffffff" : "#0b1220";

        g.append("text")
            .attr("x", 8)
            .attr("y", 20)
            .attr("font-size", 15)
            .attr("font-weight", 700)
            .attr("fill", textColor)
            .text(sym);

        g.append("text")
            .attr("x", 8)
            .attr("y", 40)
            .attr("font-size", 13)
            .attr("fill", textColor)
            .text(pct);
    });

    if (lastUpdated) {
        const msg = `Updated: ${lastUpdated.toLocaleTimeString()} (CoinGecko)`;
        svg.append("text")
            .attr("x", 12)
            .attr("y", height - 12)
            .attr("font-size", 12)
            .attr("fill", "#6b7280")
            .text(msg);
    }
}

function showTooltip(event, d) {
    const c = d.data;

    const name = c.name || "Unknown";
    const sym = (c.symbol || "").toUpperCase();
    const price = formatUsd(c.current_price);
    const mcap = formatUsd(c.market_cap);
    const pct = formatPct(c.price_change_percentage_24h);

    tooltip.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(name)} (${escapeHtml(sym)})</div>
    <div>Price: <b>${escapeHtml(price)}</b></div>
    <div>Market Cap: <b>${escapeHtml(mcap)}</b></div>
    <div>24h: <b>${escapeHtml(pct)}</b></div>
    <div style="margin-top:6px; opacity:0.85;">Click for details</div>
  `;

    tooltip.style.display = "block";

    const wrapRect = document.getElementById("chartWrap").getBoundingClientRect();
    const x = event.clientX - wrapRect.left + 12;
    const y = event.clientY - wrapRect.top + 12;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function hideTooltip() {
    tooltip.style.display = "none";
}

function showDetails(c) {
    const name = c.name || "Unknown";
    const sym = (c.symbol || "").toUpperCase();

    detailTitle.textContent = `${name} (${sym})`;

    if (c.image) {
        detailImg.src = c.image;
        detailImg.style.display = "block";
    } else {
        detailImg.src = "";
        detailImg.style.display = "none";
    }

    const price = formatUsd(c.current_price);
    const mcap = formatUsd(c.market_cap);
    const vol = formatUsd(c.total_volume);
    const high = formatUsd(c.high_24h);
    const low = formatUsd(c.low_24h);
    const pct = formatPct(c.price_change_percentage_24h);
    const rank = (typeof c.market_cap_rank === "number") ? `#${c.market_cap_rank}` : "N/A";

    detailBody.innerHTML = `
    <p class="kv"><span>Rank:</span> ${escapeHtml(rank)}</p>
    <p class="kv"><span>Price:</span> ${escapeHtml(price)}</p>
    <p class="kv"><span>24h Change:</span> ${escapeHtml(pct)}</p>
    <p class="kv"><span>Market Cap:</span> ${escapeHtml(mcap)}</p>
    <p class="kv"><span>24h Volume:</span> ${escapeHtml(vol)}</p>
    <p class="kv"><span>24h High:</span> ${escapeHtml(high)}</p>
    <p class="kv"><span>24h Low:</span> ${escapeHtml(low)}</p>
  `;

    detailNote.textContent = "Data source: CoinGecko markets endpoint";
}

function setStatus(text) {
    statusChip.textContent = text;
}

function buildMarketsUrl(perPage) {
    const params = new URLSearchParams({
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: String(perPage),
        page: "1",
        sparkline: "false",
        price_change_percentage: "24h"
    });
    return `${API_BASE}?${params.toString()}`;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
}

function formatUsd(n) {
    if (typeof n !== "number") return "N/A";
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    if (Math.abs(n) < 1) return `$${n.toFixed(6)}`;
    return `$${n.toFixed(2)}`;
}

function formatPct(n) {
    if (typeof n !== "number" || Number.isNaN(n)) return "N/A";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}