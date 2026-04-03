const cameraSelect = document.querySelector("#cameraSelect");
const startCameraBtn = document.querySelector("#startCameraBtn");
const scanBtn = document.querySelector("#scanBtn");
const cameraFeed = document.querySelector("#cameraFeed");
const captureCanvas = document.querySelector("#captureCanvas");
const statusText = document.querySelector("#statusText");
const emptyState = document.querySelector("#emptyState");
const cardPanel = document.querySelector("#cardPanel");
const cardImage = document.querySelector("#cardImage");
const cardNumber = document.querySelector("#cardNumber");
const cardName = document.querySelector("#cardName");
const cardTags = document.querySelector("#cardTags");
const cardMeta = document.querySelector("#cardMeta");
const priceList = document.querySelector("#priceList");
const detailsList = document.querySelector("#detailsList");
const rulesList = document.querySelector("#rulesList");
const attackList = document.querySelector("#attackList");
const scanText = document.querySelector("#scanText");
const matchStrip = document.querySelector("#matchStrip");

const state = {
  stream: null,
  devices: [],
  isScanning: false,
};

const tagColors = {
  pokemon: "#91d47c",
  trainer: "#f7d95f",
  energy: "#77b6f7",
  item: "#ffd59e",
  supporter: "#f4a4b4",
  stadium: "#c3c0ff",
  tool: "#dcc6ff",
  basic: "#efe1b0",
  stage: "#f0bf86",
  special: "#97d2ff",
  "rapid strike": "#99d5ff",
  "single strike": "#ffb38d",
  "fusion strike": "#f9a6ff",
  ex: "#ffb46a",
  gx: "#7ec8ff",
  vmax: "#ffc875",
  vstar: "#f1d88b",
  ace: "#f58f82",
};

initialize();

async function initialize() {
  bindEvents();
  await populateCameraOptions();
}

function bindEvents() {
  startCameraBtn.addEventListener("click", () => startCamera(cameraSelect.value));
  cameraSelect.addEventListener("change", async () => {
    if (state.stream) {
      await startCamera(cameraSelect.value);
    }
  });
  scanBtn.addEventListener("click", scanCurrentFrame);
}

async function populateCameraOptions() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    updateStatus("This browser does not support camera selection.");
    return;
  }

  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stopStream(tempStream);

    const devices = await navigator.mediaDevices.enumerateDevices();
    state.devices = devices.filter((device) => device.kind === "videoinput");

    cameraSelect.innerHTML = "";
    if (!state.devices.length) {
      cameraSelect.add(new Option("No cameras found", ""));
      cameraSelect.disabled = true;
      startCameraBtn.disabled = true;
      updateStatus("No cameras were found on this device.");
      return;
    }

    state.devices.forEach((device, index) => {
      const label = device.label || `Camera ${index + 1}`;
      cameraSelect.add(new Option(label, device.deviceId));
    });

    cameraSelect.disabled = false;
    startCameraBtn.disabled = false;
    updateStatus("Choose a camera, then scan a Pokemon TCG card.");
  } catch (error) {
    console.error(error);
    updateStatus("Camera permission was denied or unavailable. Allow camera access and reload.");
  }
}

async function startCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus("Camera access is not supported in this browser.");
    return;
  }

  const constraints = {
    video: deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        }
      : {
          facingMode: "environment",
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
    audio: false,
  };

  try {
    scanBtn.disabled = true;
    updateStatus("Starting selected camera...");
    stopStream(state.stream);

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    cameraFeed.srcObject = stream;
    await cameraFeed.play();

    const activeTrack = stream.getVideoTracks()[0];
    syncSelectedCamera(activeTrack.getSettings().deviceId);
    scanBtn.disabled = false;
    updateStatus("Camera is live. Center the card name and number, then press Scan Card.");
  } catch (error) {
    console.error(error);
    updateStatus("Unable to start that camera. Try a different one from the list.");
  }
}

function syncSelectedCamera(activeDeviceId) {
  const matchIndex = state.devices.findIndex((device) => device.deviceId === activeDeviceId);
  if (matchIndex >= 0) {
    cameraSelect.selectedIndex = matchIndex;
  }
}

async function scanCurrentFrame() {
  if (!state.stream || state.isScanning) {
    return;
  }

  if (!window.Tesseract) {
    updateStatus("OCR library failed to load. Refresh the page and try again.");
    return;
  }

  state.isScanning = true;
  scanBtn.disabled = true;
  updateStatus("Capturing frame and scanning card text...");

  try {
    const imageBlob = await captureFrame();
    const {
      data: { text },
    } = await Tesseract.recognize(imageBlob, "eng", {
      logger: ({ status, progress }) => {
        if (status === "recognizing text") {
          updateStatus(`Scanning text... ${Math.round(progress * 100)}%`);
        }
      },
    });

    renderScanText(text);
    const cards = await searchCardsFromOcr(text);

    if (!cards.length) {
      updateStatus("No matching trading card was found. Try getting the card name and set number clearer.");
      clearMatches();
      return;
    }

    renderMatchStrip(cards);
    renderCard(cards[0]);
    updateStatus(`Showing ${cards[0].name} from the Pokemon TCG database.`);
  } catch (error) {
    console.error(error);
    updateStatus("Scanning failed. Check camera access and try again.");
  } finally {
    state.isScanning = false;
    scanBtn.disabled = !state.stream;
  }
}

function captureFrame() {
  const width = cameraFeed.videoWidth;
  const height = cameraFeed.videoHeight;
  captureCanvas.width = width;
  captureCanvas.height = height;

  const context = captureCanvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(cameraFeed, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    captureCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create image blob from camera frame."));
      }
    }, "image/jpeg", 0.92);
  });
}

async function searchCardsFromOcr(rawText) {
  const normalizedText = normalizeText(rawText);
  const lines = extractCandidateLines(rawText);
  const cardNumber = extractCardNumber(normalizedText);
  const queries = buildSearchQueries(lines, cardNumber);

  for (const query of queries) {
    const cards = await fetchCards(query);
    if (cards.length) {
      return rankCards(cards, normalizedText, cardNumber);
    }
  }

  return [];
}

function buildSearchQueries(lines, cardNumber) {
  const queries = [];

  for (const line of lines) {
    if (line.length < 3) {
      continue;
    }

    const escapedLine = escapeQueryValue(line);
    const shortenedLine = escapeQueryValue(line.split(" ").slice(0, 3).join(" "));
    if (cardNumber) {
      queries.push(`name:"${escapedLine}" number:"${escapeQueryValue(cardNumber)}"`);
      queries.push(`name:"${shortenedLine}" number:"${escapeQueryValue(cardNumber)}"`);
    }
    queries.push(`name:"${escapedLine}"`);
    queries.push(`name:"${shortenedLine}"`);
  }

  if (cardNumber) {
    queries.push(`number:"${escapeQueryValue(cardNumber)}"`);
  }

  return [...new Set(queries)].slice(0, 8);
}

async function fetchCards(query) {
  const url = new URL("https://api.pokemontcg.io/v2/cards");
  url.searchParams.set("q", query);
  url.searchParams.set("pageSize", "12");
  url.searchParams.set(
    "select",
    [
      "id",
      "name",
      "supertype",
      "subtypes",
      "level",
      "hp",
      "types",
      "rules",
      "abilities",
      "attacks",
      "rarity",
      "number",
      "images",
      "set",
      "artist",
      "tcgplayer",
      "cardmarket",
    ].join(","),
  );
  url.searchParams.set("orderBy", "-set.releaseDate");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Card search failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.data || [];
}

function rankCards(cards, normalizedText, detectedNumber) {
  const scored = cards.map((card) => {
    const normalizedName = normalizeText(card.name);
    let score = 0;

    if (normalizedText.includes(normalizedName)) {
      score += 120;
    }

    const nameWords = normalizedName.split(" ").filter(Boolean);
    for (const word of nameWords) {
      if (normalizedText.includes(word)) {
        score += 15;
      }
    }

    if (detectedNumber && normalizeText(card.number) === normalizeText(detectedNumber)) {
      score += 80;
    }

    if (card.tcgplayer?.prices || card.cardmarket?.prices) {
      score += 12;
    }

    if (card.images?.large) {
      score += 5;
    }

    return { card, score };
  });

  return scored
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.card);
}

function extractCandidateLines(rawText) {
  const cleaned = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length >= 3);

  const filtered = cleaned.filter((line) => {
    if (/^\d+$/.test(line)) {
      return false;
    }

    const skipWords = ["weakness", "resistance", "retreat", "damage", "trainer", "energy", "pokemon"];
    return !skipWords.includes(line);
  });

  return [...new Set(filtered)].slice(0, 6);
}

function extractCardNumber(text) {
  const match = text.match(/\b([a-z]{1,4}\d{1,3}|\d{1,3})\s*\/\s*\d{1,3}\b/i);
  if (match) {
    return match[1];
  }

  const altMatch = text.match(/\b([a-z]{1,4}\d{1,3}|\d{1,3})\b/i);
  return altMatch ? altMatch[1] : "";
}

function renderScanText(text) {
  scanText.textContent = text.trim() || "No OCR text returned.";
}

function clearMatches() {
  matchStrip.innerHTML = "";
}

function renderMatchStrip(cards) {
  clearMatches();

  cards.slice(0, 6).forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-chip";
    button.textContent = `${card.name} - ${card.set?.name || "Unknown set"}`;
    if (index === 0) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      [...matchStrip.querySelectorAll(".match-chip")].forEach((node) => node.classList.remove("is-active"));
      button.classList.add("is-active");
      renderCard(card);
      updateStatus(`Showing ${card.name} from ${card.set?.name || "the selected set"}.`);
    });

    matchStrip.appendChild(button);
  });
}

function renderCard(card) {
  emptyState.hidden = true;
  cardPanel.hidden = false;

  cardImage.src = card.images?.large || card.images?.small || "";
  cardImage.alt = `${card.name} card image`;
  cardNumber.textContent = `${card.set?.name || "Unknown set"} - #${card.number || "?"}`;
  cardName.textContent = card.name;

  cardTags.innerHTML = "";
  buildTagList(card).forEach((tag) => {
    const node = document.createElement("span");
    node.className = "type-pill";
    node.textContent = tag;
    node.style.background = tagColors[tag.toLowerCase()] || "#e8dcc7";
    cardTags.appendChild(node);
  });

  cardMeta.innerHTML = "";
  [
    ["Card Type", card.supertype || "Unknown"],
    ["Set", card.set?.name || "Unknown"],
    ["Rarity", card.rarity || "Unknown"],
    ["Artist", card.artist || "Unknown"],
  ].forEach(([label, value]) => {
    cardMeta.appendChild(createMetaCard(label, value));
  });

  if (card.hp) {
    cardMeta.appendChild(createMetaCard("HP", card.hp));
  }

  if (card.level) {
    cardMeta.appendChild(createMetaCard("Level", card.level));
  }

  renderPrices(card);
  renderDetails(card);
  renderRules(card);
  renderAttacks(card);
}

function buildTagList(card) {
  const tags = [card.supertype, ...(card.subtypes || []), ...(card.types || [])]
    .filter(Boolean)
    .map((value) => value.trim());
  return [...new Set(tags)];
}

function renderPrices(card) {
  priceList.innerHTML = "";

  const prices = [];
  const tcgplayerPrices = flattenPriceMap(card.tcgplayer?.prices, "TCGplayer");
  const cardmarketPrices = flattenCardmarketPrices(card.cardmarket?.prices);
  prices.push(...tcgplayerPrices, ...cardmarketPrices);

  if (!prices.length) {
    priceList.appendChild(createInfoRow("Market Price", "No live price data on this card"));
    return;
  }

  prices.forEach(({ label, value }) => {
    priceList.appendChild(createInfoRow(label, value));
  });
}

function flattenPriceMap(priceMap, source) {
  if (!priceMap) {
    return [];
  }

  const rows = [];
  Object.entries(priceMap).forEach(([variant, values]) => {
    Object.entries(values).forEach(([label, amount]) => {
      if (typeof amount !== "number" || Number.isNaN(amount)) {
        return;
      }

      const niceVariant = variant.replace(/([A-Z])/g, " $1").trim();
      const niceLabel = label.replace(/([A-Z])/g, " $1").trim();
      rows.push({
        label: `${source} ${niceVariant} ${niceLabel}`.trim(),
        value: formatUsd(amount),
      });
    });
  });
  return rows.slice(0, 8);
}

function flattenCardmarketPrices(priceMap) {
  if (!priceMap) {
    return [];
  }

  const labels = {
    averageSellPrice: "Cardmarket Avg Sell",
    lowPrice: "Cardmarket Low",
    trendPrice: "Cardmarket Trend",
    reverseHoloSell: "Cardmarket Reverse Holo Sell",
    reverseHoloLow: "Cardmarket Reverse Holo Low",
    reverseHoloTrend: "Cardmarket Reverse Holo Trend",
    lowPriceExPlus: "Cardmarket Low EX+",
    avg1: "Cardmarket Avg 1 Day",
    avg7: "Cardmarket Avg 7 Day",
    avg30: "Cardmarket Avg 30 Day",
  };

  return Object.entries(labels)
    .filter(([key]) => typeof priceMap[key] === "number" && !Number.isNaN(priceMap[key]))
    .map(([key, label]) => ({
      label,
      value: formatEur(priceMap[key]),
    }))
    .slice(0, 6);
}

function renderDetails(card) {
  detailsList.innerHTML = "";

  const details = [];
  if (card.abilities?.length) {
    details.push(["Abilities", card.abilities.map((ability) => `${ability.name}: ${ability.text}`).join(" ")]);
  }
  if (card.set?.series) {
    details.push(["Series", card.set.series]);
  }
  if (card.set?.releaseDate) {
    details.push(["Release Date", card.set.releaseDate]);
  }
  if (card.set?.printedTotal && card.set?.total) {
    details.push(["Set Count", `${card.set.printedTotal}/${card.set.total}`]);
  }

  if (!details.length) {
    detailsList.appendChild(createInfoRow("Details", "No extra card details available"));
    return;
  }

  details.forEach(([label, value]) => {
    detailsList.appendChild(createInfoRow(label, value));
  });
}

function renderRules(card) {
  rulesList.innerHTML = "";
  const rules = [...(card.rules || [])];

  if (!rules.length) {
    rulesList.appendChild(createParagraph("No special rules listed for this card."));
    return;
  }

  rules.forEach((rule) => {
    rulesList.appendChild(createParagraph(rule));
  });
}

function renderAttacks(card) {
  attackList.innerHTML = "";

  if (!card.attacks?.length) {
    attackList.appendChild(createParagraph("No attacks listed for this card type."));
    return;
  }

  card.attacks.forEach((attack) => {
    const item = document.createElement("article");
    item.className = "attack-item";

    const title = document.createElement("h4");
    const cost = attack.cost?.length ? ` [${attack.cost.join(", ")}]` : "";
    const damage = attack.damage ? ` - ${attack.damage}` : "";
    title.textContent = `${attack.name}${cost}${damage}`;

    const text = document.createElement("p");
    text.textContent = attack.text || "No attack text available.";

    item.append(title, text);
    attackList.appendChild(item);
  });
}

function createMetaCard(label, value) {
  const card = document.createElement("div");
  card.className = "meta-card";

  const labelNode = document.createElement("span");
  labelNode.textContent = label;

  const valueNode = document.createElement("strong");
  valueNode.textContent = value;

  card.append(labelNode, valueNode);
  return card;
}

function createInfoRow(label, value) {
  const row = document.createElement("div");
  row.className = "info-row";

  const labelNode = document.createElement("span");
  labelNode.className = "info-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("strong");
  valueNode.className = "info-value";
  valueNode.textContent = value;

  row.append(labelNode, valueNode);
  return row;
}

function createParagraph(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeQueryValue(value) {
  return value.replace(/"/g, "");
}

function formatUsd(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatEur(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function updateStatus(message) {
  statusText.textContent = message;
}

function stopStream(stream) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
}

window.addEventListener("beforeunload", () => stopStream(state.stream));
