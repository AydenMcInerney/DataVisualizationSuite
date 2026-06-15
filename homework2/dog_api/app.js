const BREEDS_URL = "https://dog.ceo/api/breeds/list/all";
const imgCache = new Map(); // breedKey -> imageUrl

let allBreedKeys = []; // e.g. ["husky", "hound-afghan", "bulldog-french"]

const filterInput = document.getElementById("filterInput");
const cardsRow = document.getElementById("cardsRow");
const statusCard = document.getElementById("status");
const statusText = document.getElementById("statusText");

document.addEventListener("DOMContentLoaded", init);

function init() {
    filterInput.addEventListener("input", () => renderFiltered(filterInput.value));
    loadBreedsAndImages();
}

async function loadBreedsAndImages() {
    setStatus(true, "Loading…", "Fetching breed list and images.");

    try {
        const breedData = await fetchJson(BREEDS_URL);
        const breedKeys = flattenBreeds(breedData.message);
        allBreedKeys = breedKeys;

        // Load a single “representative image” per breed to keep it fast.
        await loadImagesForBreeds(breedKeys);

        setStatus(false);
        renderFiltered(filterInput.value);
    } catch (err) {
        setStatus(true, "Error", "Could not load Dog API data. Check console for details.");
        console.error(err);
    }
}

async function loadImagesForBreeds(breedKeys) {
    // Small concurrency so we don’t spam the API
    const CONCURRENCY = 8;
    let idx = 0;

    while (idx < breedKeys.length) {
        const chunk = breedKeys.slice(idx, idx + CONCURRENCY);
        statusText.textContent = `Loading images… (${Math.min(idx + CONCURRENCY, breedKeys.length)}/${breedKeys.length})`;

        await Promise.all(
            chunk.map(async (breedKey) => {
                const url = buildRandomImageUrl(breedKey);
                try {
                    const data = await fetchJson(url);
                    imgCache.set(breedKey, data.message);
                } catch {
                    imgCache.set(breedKey, null);
                }
            })
        );

        idx += CONCURRENCY;
    }
}

function renderFiltered(query) {
    const q = (query || "").trim().toLowerCase();

    const filtered = allBreedKeys.filter((k) => k.includes(q));

    cardsRow.innerHTML = "";

    if (filtered.length === 0) {
        cardsRow.innerHTML = `
      <div class="col s12">
        <div class="card white">
          <div class="card-content">
            <span class="card-title">No matches</span>
            <p class="small-note">Try typing something like: <b>hound</b>, <b>retriever</b>, <b>terrier</b>, <b>bulldog</b>.</p>
          </div>
        </div>
      </div>
    `;
        return;
    }

    filtered.forEach((breedKey) => {
        const imgUrl = imgCache.get(breedKey);
        cardsRow.appendChild(makeCard(breedKey, imgUrl));
    });
}

function makeCard(breedKey, imgUrl) {
    const col = document.createElement("div");
    col.className = "col s12 m6 l4";

    const prettyName = prettyBreedName(breedKey);
    const safeImg = imgUrl
        ? `<img src="${imgUrl}" alt="${prettyName}">`
        : `<div style="height:190px;display:flex;align-items:center;justify-content:center;background:#eaeaea;">
         <span class="grey-text">No image</span>
       </div>`;

    col.innerHTML = `
    <div class="card hoverable">
      <div class="card-image">
        ${safeImg}
        <span class="card-title" style="text-shadow: 0 1px 6px rgba(0,0,0,0.65);">${prettyName}</span>
      </div>
      <div class="card-content">
        <div class="chip breed-chip">${breedKey}</div>
        <p class="small-note">Click “More Images” to open the breed gallery endpoint.</p>
      </div>
      <div class="card-action">
        <a href="${buildAllImagesUrl(breedKey)}" target="_blank" rel="noopener noreferrer">More Images</a>
      </div>
    </div>
  `;

    return col;
}

function flattenBreeds(breedsObj) {
    // breedsObj: { hound: ["afghan","basset"...], husky: [], bulldog:["french","english"]...}
    const keys = [];
    for (const breed of Object.keys(breedsObj)) {
        const subs = breedsObj[breed];
        if (!subs || subs.length === 0) {
            keys.push(breed);
        } else {
            subs.forEach((sub) => keys.push(`${breed}-${sub}`));
        }
    }
    // Sort for nicer UX
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
}

function prettyBreedName(breedKey) {
    // "bulldog-french" -> "French Bulldog"
    const parts = breedKey.split("-");
    if (parts.length === 1) return capitalize(parts[0]);

    const [breed, sub] = parts;
    return `${capitalize(sub)} ${capitalize(breed)}`;
}

function capitalize(s) {
    if (!s) return s;
    return s[0].toUpperCase() + s.slice(1);
}

function buildRandomImageUrl(breedKey) {
    // For sub-breeds, Dog API format: /breed/{breed}/{subbreed}/images/random
    const parts = breedKey.split("-");
    if (parts.length === 1) {
        return `https://dog.ceo/api/breed/${parts[0]}/images/random`;
    }
    const [breed, sub] = parts;
    return `https://dog.ceo/api/breed/${breed}/${sub}/images/random`;
}

function buildAllImagesUrl(breedKey) {
    // Opens a JSON list of images
    const parts = breedKey.split("-");
    if (parts.length === 1) {
        return `https://dog.ceo/api/breed/${parts[0]}/images`;
    }
    const [breed, sub] = parts;
    return `https://dog.ceo/api/breed/${breed}/${sub}/images`;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
}

function setStatus(show, title = "", msg = "") {
    if (!show) {
        statusCard.style.display = "none";
        return;
    }
    statusCard.style.display = "block";
    statusCard.querySelector(".card-title").textContent = title;
    statusText.textContent = msg;
}