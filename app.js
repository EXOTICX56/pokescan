const cameraSelect = document.querySelector("#cameraSelect");
const startCameraBtn = document.querySelector("#startCameraBtn");
const scanBtn = document.querySelector("#scanBtn");
const cameraFeed = document.querySelector("#cameraFeed");
const captureCanvas = document.querySelector("#captureCanvas");
const statusText = document.querySelector("#statusText");
const emptyState = document.querySelector("#emptyState");
const pokemonCard = document.querySelector("#pokemonCard");
const pokemonSprite = document.querySelector("#pokemonSprite");
const pokemonNumber = document.querySelector("#pokemonNumber");
const pokemonName = document.querySelector("#pokemonName");
const pokemonTypes = document.querySelector("#pokemonTypes");
const pokemonHeight = document.querySelector("#pokemonHeight");
const pokemonWeight = document.querySelector("#pokemonWeight");
const pokemonAbilities = document.querySelector("#pokemonAbilities");
const statsList = document.querySelector("#statsList");

const POKEDEX_LIMIT = 1025;
const state = {
  stream: null,
  devices: [],
  pokedex: [],
  pokedexReady: false,
  isScanning: false,
};

const typeColors = {
  normal: "#d8c8a8",
  fire: "#f79b68",
  water: "#77b6f7",
  electric: "#f7d95f",
  grass: "#91d47c",
  ice: "#b4ecf4",
  fighting: "#d87c64",
  poison: "#bb8fd7",
  ground: "#d7b66d",
  flying: "#a8c7ff",
  psychic: "#ff95ae",
  bug: "#b2cb61",
  rock: "#c8b17e",
  ghost: "#9685d8",
  dragon: "#8da1ff",
  dark: "#8b776b",
  steel: "#acc0cf",
  fairy: "#f3b6d4",
};

initialize();

async function initialize() {
  bindEvents();
  await loadPokedex();
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

async function loadPokedex() {
  updateStatus("Loading Pokemon list...");
  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${POKEDEX_LIMIT}`);
    if (!response.ok) {
      throw new Error(`PokeAPI list request failed with ${response.status}`);
    }

    const { results } = await response.json();
    state.pokedex = results.map((entry) => ({
      ...entry,
      normalized: normalizeName(entry.name),
      tokens: normalizeName(entry.name).split(" "),
    }));
    state.pokedexReady = true;
    updateStatus("Pokemon list loaded. Pick a camera to start.");
  } catch (error) {
    console.error(error);
    updateStatus("Could not load the Pokemon list. Check your internet connection and refresh.");
  }
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
      const option = new Option("No cameras found", "");
      cameraSelect.add(option);
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
    updateStatus("Camera access is ready. Choose a camera and start the preview.");
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
    scanBtn.disabled = !state.pokedexReady;
    updateStatus("Camera is live. When the Pokemon name is visible, press Scan Pokemon.");
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
  updateStatus("Capturing frame and scanning text...");

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

    const match = findPokemonMatch(text);
    if (!match) {
      updateStatus("No Pokemon name could be recognized. Try better lighting or move closer.");
      return;
    }

    updateStatus(`Pokemon detected: ${toTitleCase(match.name)}. Loading stats...`);
    await renderPokemon(match.name);
    updateStatus(`Showing stats for ${toTitleCase(match.name)}.`);
  } catch (error) {
    console.error(error);
    updateStatus("Scanning failed. Check camera access and try again.");
  } finally {
    state.isScanning = false;
    scanBtn.disabled = !state.stream || !state.pokedexReady;
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

function findPokemonMatch(rawText) {
  const cleanedText = normalizeName(rawText);
  if (!cleanedText) {
    return null;
  }

  const exact = state.pokedex.find((entry) => cleanedText.includes(entry.normalized));
  if (exact) {
    return exact;
  }

  const words = cleanedText.split(" ").filter(Boolean);
  let bestMatch = null;
  let bestScore = Infinity;

  for (const entry of state.pokedex) {
    for (const word of words) {
      const score = levenshtein(word, entry.normalized);
      if (score < bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
  }

  return bestScore <= 2 ? bestMatch : null;
}

async function renderPokemon(name) {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`Pokemon lookup failed with ${response.status}`);
  }

  const pokemon = await response.json();
  emptyState.hidden = true;
  pokemonCard.hidden = false;
  pokemonSprite.src = pokemon.sprites.other["official-artwork"].front_default || pokemon.sprites.front_default || "";
  pokemonSprite.alt = `${pokemon.name} artwork`;
  pokemonNumber.textContent = `#${String(pokemon.id).padStart(4, "0")}`;
  pokemonName.textContent = toTitleCase(pokemon.name);
  pokemonHeight.textContent = `${pokemon.height / 10} m`;
  pokemonWeight.textContent = `${pokemon.weight / 10} kg`;
  pokemonAbilities.textContent = pokemon.abilities.map(({ ability }) => toTitleCase(ability.name)).join(", ");

  pokemonTypes.innerHTML = "";
  pokemon.types.forEach(({ type }) => {
    const pill = document.createElement("span");
    pill.className = "type-pill";
    pill.textContent = type.name;
    pill.style.background = typeColors[type.name] || "#e8dcc7";
    pokemonTypes.appendChild(pill);
  });

  statsList.innerHTML = "";
  pokemon.stats.forEach(({ stat, base_stat: value }) => {
    const row = document.createElement("div");
    row.className = "stat-row";

    const nameNode = document.createElement("span");
    nameNode.className = "stat-name";
    nameNode.textContent = stat.name.replace("-", " ");

    const track = document.createElement("div");
    track.className = "stat-track";

    const fill = document.createElement("div");
    fill.className = "stat-fill";
    fill.style.width = `${Math.min((value / 255) * 100, 100)}%`;
    track.appendChild(fill);

    const score = document.createElement("strong");
    score.textContent = value;

    row.append(nameNode, track, score);
    statsList.appendChild(row);
  });
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return value
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function levenshtein(a, b) {
  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const matrix = Array.from({ length: b.length + 1 }, () => []);

  for (let i = 0; i <= b.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const indicator = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + indicator,
      );
    }
  }

  return matrix[b.length][a.length];
}

window.addEventListener("beforeunload", () => stopStream(state.stream));
