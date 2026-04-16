// --- Elements du DOM ---
const pickBtn = document.getElementById("pickBtn");
const targetInfo = document.getElementById("targetInfo");
const toggleBtn = document.getElementById("toggleBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const clickCountEl = document.getElementById("clickCount");
const presets = document.querySelectorAll(".preset");
const modeBtns = document.querySelectorAll(".mode-btn");
const speedInput = document.getElementById("speedInput");
const speedMinus = document.getElementById("speedMinus");
const speedPlus = document.getElementById("speedPlus");
const tabs = document.querySelectorAll(".tab");
const singleMode = document.getElementById("singleMode");
const pathMode = document.getElementById("pathMode");
const shinyMode = document.getElementById("shinyMode");
const recordBtn = document.getElementById("recordBtn");
const pathList = document.getElementById("pathList");
const clearPathBtn = document.getElementById("clearPathBtn");
const expandBtn = document.getElementById("expandBtn");
const clickModeStep = document.getElementById("clickModeStep");
const shinyStatus = document.getElementById("shinyStatus");

// Shiny elements
const shinyPickReset = document.getElementById("shinyPickReset");
const shinyPickZone = document.getElementById("shinyPickZone");
const shinyResetInfo = document.getElementById("shinyResetInfo");
const shinyZoneInfo = document.getElementById("shinyZoneInfo");
const shinyClearBtn = document.getElementById("shinyClearBtn");

// Click limit elements
const clickLimitInput = document.getElementById("clickLimitInput");
const limitBtn = document.querySelector(".limit-btn");

// Anti-AFK elements
const afkMode = document.getElementById("afkMode");
const afkModeBtns = document.querySelectorAll(".afk-mode-btn");
const afkIntervalMin = document.getElementById("afkIntervalMin");
const afkIntervalSec = document.getElementById("afkIntervalSec");

// Fullpage
const isFullPage = new URLSearchParams(window.location.search).has("fullpage");
if (isFullPage) document.body.classList.add("fullpage");

expandBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?fullpage=1") });
  window.close();
});

// --- Etat ---
let selectedInterval = 1000;
let selectedMode = "single";
let currentSelector = "";
let currentTab = "single";
let pathSelectors = [];
let isRunning = false;
let countTimer = null;

// Shiny state
let shinyResetSel = "";
let shinyZone = null; // { x, y, w, h } zone shiny
let shinyPickTarget = null;

// Anti-AFK state
let afkModeVal = "mouse"; // "mouse" ou "click"

const TAB_LIST = ["single", "path", "shiny", "afk"];
const panels = { single: singleMode, path: pathMode, shiny: shinyMode, afk: afkMode };

// --- Helpers ---

async function getTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function runInPage(func, args) {
  const tabId = await getTabId();
  if (!tabId) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId }, func, args: args || []
    });
    return results?.[0]?.result;
  } catch (e) {
    return null;
  }
}

// --- Picker (injecte dans la page) ---

function injectedStartPicker(bannerText, color) {
  if (document.getElementById("__ac_overlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "__ac_overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.05);";

  var banner = document.createElement("div");
  banner.id = "__ac_banner";
  banner.style.cssText =
    "position:fixed;top:0;left:0;width:100%;padding:12px;background:" + color + ";color:#fff;text-align:center;font:600 14px sans-serif;z-index:2147483647;";
  banner.textContent = bannerText;

  var hoveredEl = null;
  var prevOutline = "";

  function buildSel(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var parent = cur.parentElement;
      if (!parent) break;
      var idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
      parts.unshift(cur.tagName.toLowerCase() + ":nth-child(" + idx + ")");
      cur = parent;
    }
    return parts.join(" > ");
  }

  function onMove(e) {
    if (hoveredEl) hoveredEl.style.outline = prevOutline;
    overlay.style.pointerEvents = "none";
    var t = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    if (t && t !== overlay && t !== banner) {
      hoveredEl = t;
      prevOutline = hoveredEl.style.outline;
      hoveredEl.style.outline = "3px solid " + color;
    }
  }

  function cleanup() {
    overlay.removeEventListener("mousemove", onMove);
    overlay.removeEventListener("click", onPick);
    document.removeEventListener("keydown", onKey);
    if (hoveredEl) hoveredEl.style.outline = prevOutline;
    if (overlay.parentNode) overlay.remove();
    if (banner.parentNode) banner.remove();
  }

  function onPick(e) {
    e.preventDefault();
    e.stopPropagation();
    overlay.style.pointerEvents = "none";
    var t = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    cleanup();
    if (t && t !== banner) {
      window.__ac_picked = buildSel(t);
    }
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("click", onPick);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  document.body.appendChild(banner);
}

function injectedGetPicked() {
  var val = window.__ac_picked || "";
  window.__ac_picked = "";
  return val;
}

// --- Picker multi pour chemin ---

function injectedStartRecorder() {
  if (document.getElementById("__ac_overlay")) return;
  window.__ac_path = [];
  window.__ac_recording = true;

  var overlay = document.createElement("div");
  overlay.id = "__ac_overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;background:rgba(255,68,68,0.03);";

  var banner = document.createElement("div");
  banner.id = "__ac_banner";
  banner.style.cssText =
    "position:fixed;top:0;left:0;width:100%;padding:10px;background:#ff4444;color:#fff;text-align:center;font:600 13px sans-serif;z-index:2147483647;";
  banner.textContent = "ENREGISTREMENT - Cliquez les elements dans l'ordre (Echap pour terminer)";

  var counter = document.createElement("span");
  counter.style.cssText = "margin-left:8px;background:#fff;color:#ff4444;padding:2px 8px;border-radius:10px;font-weight:700;";
  counter.textContent = "0";
  banner.appendChild(counter);

  var hoveredEl = null;
  var prevOutline = "";

  function buildSel(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var parent = cur.parentElement;
      if (!parent) break;
      var idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
      parts.unshift(cur.tagName.toLowerCase() + ":nth-child(" + idx + ")");
      cur = parent;
    }
    return parts.join(" > ");
  }

  function onMove(e) {
    if (hoveredEl) hoveredEl.style.outline = prevOutline;
    overlay.style.pointerEvents = "none";
    var t = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    if (t && t !== overlay && t !== banner) {
      hoveredEl = t;
      prevOutline = hoveredEl.style.outline;
      hoveredEl.style.outline = "3px solid #ff4444";
    }
  }

  function cleanup() {
    overlay.removeEventListener("mousemove", onMove);
    overlay.removeEventListener("click", onPick);
    document.removeEventListener("keydown", onKey);
    if (hoveredEl) hoveredEl.style.outline = prevOutline;
    if (overlay.parentNode) overlay.remove();
    if (banner.parentNode) banner.remove();
    window.__ac_recording = false;
  }

  function onPick(e) {
    e.preventDefault();
    e.stopPropagation();
    overlay.style.pointerEvents = "none";
    var t = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    if (t && t !== banner && t !== overlay) {
      var sel = buildSel(t);
      window.__ac_path.push(sel);
      counter.textContent = window.__ac_path.length;
      t.style.outline = "3px solid #00c853";
      setTimeout(function () { t.style.outline = ""; }, 400);
    }
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("click", onPick);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  document.body.appendChild(banner);
}

function injectedGetPath() {
  var path = window.__ac_path || [];
  var recording = !!window.__ac_recording;
  return { path: path, recording: recording };
}

// --- Zone picker (dessiner un rectangle) ---

function injectedStartZonePicker() {
  if (document.getElementById("__ac_overlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "__ac_overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.3);";

  var banner = document.createElement("div");
  banner.id = "__ac_banner";
  banner.style.cssText =
    "position:fixed;top:0;left:0;width:100%;padding:12px;background:#eab308;color:#000;text-align:center;font:600 14px sans-serif;z-index:2147483647;";
  banner.textContent = "Dessinez un rectangle sur la zone a surveiller (Echap pour annuler)";

  var rect = document.createElement("div");
  rect.style.cssText =
    "position:fixed;border:2px solid #eab308;background:rgba(234,179,8,0.15);z-index:2147483647;pointer-events:none;display:none;border-radius:4px;box-shadow:0 0 20px rgba(234,179,8,0.3);";

  var drawing = false;
  var startX = 0, startY = 0;

  function onDown(e) {
    e.preventDefault();
    drawing = true;
    startX = e.clientX;
    startY = e.clientY;
    rect.style.left = startX + "px";
    rect.style.top = startY + "px";
    rect.style.width = "0px";
    rect.style.height = "0px";
    rect.style.display = "block";
  }

  function onMove(e) {
    if (!drawing) return;
    var x = Math.min(startX, e.clientX);
    var y = Math.min(startY, e.clientY);
    var w = Math.abs(e.clientX - startX);
    var h = Math.abs(e.clientY - startY);
    rect.style.left = x + "px";
    rect.style.top = y + "px";
    rect.style.width = w + "px";
    rect.style.height = h + "px";
  }

  function cleanup() {
    overlay.removeEventListener("mousedown", onDown);
    overlay.removeEventListener("mousemove", onMove);
    overlay.removeEventListener("mouseup", onUp);
    document.removeEventListener("keydown", onKey);
    if (overlay.parentNode) overlay.remove();
    if (banner.parentNode) banner.remove();
    if (rect.parentNode) rect.remove();
  }

  function onUp(e) {
    if (!drawing) return;
    drawing = false;
    var x = Math.min(startX, e.clientX);
    var y = Math.min(startY, e.clientY);
    var w = Math.abs(e.clientX - startX);
    var h = Math.abs(e.clientY - startY);
    cleanup();

    if (w > 10 && h > 10) {
      window.__ac_zone = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
  }

  function onKey(e) {
    if (e.key === "Escape") { cleanup(); }
  }

  overlay.addEventListener("mousedown", onDown);
  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("mouseup", onUp);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  document.body.appendChild(banner);
  document.body.appendChild(rect);
}

function injectedGetZone() {
  var z = window.__ac_zone || null;
  window.__ac_zone = null;
  return z;
}

// --- UI ---

function updateUI() {
  let hasTarget;
  if (currentTab === "single") {
    hasTarget = !!currentSelector;
  } else if (currentTab === "path") {
    hasTarget = pathSelectors.length > 0;
  } else if (currentTab === "shiny") {
    hasTarget = !!shinyResetSel;
  } else if (currentTab === "afk") {
    hasTarget = true; // Anti-AFK marche toujours
  }

  // Cache vitesse et type de clic selon le mode
  clickModeStep.style.display = (currentTab === "shiny" || currentTab === "afk") ? "none" : "";
  const speedStep = document.getElementById("speedStep");
  if (speedStep) speedStep.style.display = currentTab === "afk" ? "none" : "";

  // Badge shiny
  shinyStatus.classList.add("hidden");

  if (isRunning) {
    toggleBtn.textContent = "Arreter";
    toggleBtn.className = "btn-toggle on";
    toggleBtn.disabled = false;
    statusDot.className = "dot on";
    statusText.textContent = currentTab === "shiny" ? "Shiny hunting..." : "En cours...";
    clickCountEl.classList.remove("hidden");
  } else {
    const labels = { single: "Demarrer", path: "Demarrer", shiny: "Lancer le hunt", afk: "Activer Anti-AFK" };
    toggleBtn.textContent = labels[currentTab] || "Demarrer";
    toggleBtn.className = "btn-toggle off-" + currentTab;
    toggleBtn.disabled = !hasTarget;
    statusDot.className = "dot off";
    statusText.textContent = hasTarget ? "Pret" : "Configurez d'abord";
    clickCountEl.classList.add("hidden");
  }
}

function showTarget(selector) {
  currentSelector = selector;
  targetInfo.textContent = selector.length > 50 ? selector.substring(0, 47) + "..." : selector;
  targetInfo.classList.remove("hidden");
  pickBtn.textContent = "Changer l'element";
  pickBtn.classList.add("picked");
  chrome.storage.local.set({ selector: selector });
  updateUI();
}

function renderPathList() {
  if (pathSelectors.length === 0) {
    pathList.classList.add("hidden");
    clearPathBtn.classList.add("hidden");
    return;
  }
  pathList.classList.remove("hidden");
  clearPathBtn.classList.remove("hidden");
  pathList.innerHTML = "";
  pathSelectors.forEach((sel, i) => {
    const item = document.createElement("div");
    item.className = "path-item";
    const num = document.createElement("span");
    num.className = "path-num";
    num.textContent = i + 1;
    const text = document.createElement("span");
    text.className = "path-item-text";
    text.textContent = sel.split(" > ").pop();
    item.appendChild(num);
    item.appendChild(text);
    pathList.appendChild(item);
  });
  chrome.storage.local.set({ pathSelectors: pathSelectors });
  updateUI();
}

function updateShinyUI() {
  if (shinyResetSel) {
    shinyResetInfo.textContent = shinyResetSel.split(" > ").pop();
    shinyResetInfo.classList.remove("hidden");
    shinyPickReset.textContent = "Changer le bouton reset";
    shinyPickReset.classList.add("picked");
  }
  if (shinyZone) {
    shinyZoneInfo.textContent = shinyZone.w + "x" + shinyZone.h + " px (position " + shinyZone.x + "," + shinyZone.y + ")";
    shinyZoneInfo.classList.remove("hidden");
    shinyPickZone.textContent = "Redessiner la zone";
    shinyPickZone.classList.add("picked");
  }
  chrome.storage.local.set({
    shinyResetSel, shinyZone
  });
  updateUI();
}

function startPolling() {
  stopPolling();
  clickCountEl.textContent = "0 resets";
  // Ignore les anciens shinyFound au demarrage
  let ignoreShiny = true;
  setTimeout(() => { ignoreShiny = false; }, 3000);
  countTimer = setInterval(async () => {
    const data = await chrome.storage.local.get(["running", "clickCount", "shinyFound"]);
    if (data.shinyFound && !ignoreShiny) {
      shinyStatus.textContent = "SHINY TROUVE !";
      shinyStatus.className = "shiny-badge found";
      shinyStatus.classList.remove("hidden");
      clickCountEl.textContent = (data.clickCount || 0) + " resets";
      clickCountEl.classList.remove("hidden");
      statusDot.className = "dot off";
      statusText.textContent = "Shiny detecte !";
      isRunning = false;
      chrome.storage.local.set({ shinyFound: false });
      updateUI();
      stopPolling();
    } else if (data.running) {
      clickCountEl.textContent = (data.clickCount || 0) + (currentTab === "shiny" ? " resets" : " clics");
    } else {
      isRunning = false;
      updateUI();
      stopPolling();
    }
  }, 400);
}

function stopPolling() {
  if (countTimer) {
    clearInterval(countTimer);
    countTimer = null;
  }
}

// --- Onglets ---

const tabsContainer = document.querySelector(".tabs");

function switchTab(newTab) {
  if (newTab === currentTab) return;

  const oldIdx = TAB_LIST.indexOf(currentTab);
  const newIdx = TAB_LIST.indexOf(newTab);
  const goingRight = newIdx > oldIdx;

  const oldPanel = panels[currentTab];
  const newPanel = panels[newTab];

  // Indicateur glissant
  tabsContainer.className = "tabs pos-" + newIdx;

  // Active l'onglet
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === newTab));

  // Animation sortie
  oldPanel.classList.remove("active");
  oldPanel.classList.add(goingRight ? "exit-left" : "exit-right");

  // Prepare le nouveau panneau
  newPanel.classList.remove("hidden", "exit-left", "exit-right");
  newPanel.style.display = "block";
  newPanel.classList.add(goingRight ? "enter-right" : "enter-left");
  void newPanel.offsetHeight;
  newPanel.classList.remove("enter-right", "enter-left");
  newPanel.classList.add("active");

  setTimeout(() => {
    oldPanel.style.display = "none";
    oldPanel.classList.remove("exit-left", "exit-right");
  }, 400);

  currentTab = newTab;
  chrome.storage.local.set({ currentTab });
  updateUI();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// --- Evenements clic unique ---

pickBtn.addEventListener("click", async () => {
  await new Promise(r => chrome.storage.local.set({ shinyPickTarget: "single" }, r));
  await runInPage(injectedStartPicker, ["Cliquez sur l'element a auto-cliquer (Echap pour annuler)", "#6366f1"]);
  window.close();
});

// --- Evenements chemin ---

recordBtn.addEventListener("click", async () => {
  await runInPage(injectedStartRecorder);
  window.close();
});

clearPathBtn.addEventListener("click", () => {
  pathSelectors = [];
  renderPathList();
  chrome.storage.local.set({ pathSelectors: [] });
});

// --- Limite de clics ---

limitBtn.addEventListener("click", () => {
  limitBtn.classList.add("active");
  clickLimitInput.value = "";
});

clickLimitInput.addEventListener("input", () => {
  const val = parseInt(clickLimitInput.value);
  limitBtn.classList.toggle("active", !val || val <= 0);
});

// --- Evenements Flamachou ---

shinyPickReset.addEventListener("click", async () => {
  await new Promise(r => chrome.storage.local.set({ shinyPickTarget: "reset" }, r));
  await runInPage(injectedStartPicker, ["Cliquez sur le BOUTON RESET (Echap pour annuler)", "#ef4444"]);
  window.close();
});

shinyPickZone.addEventListener("click", async () => {
  await new Promise(r => chrome.storage.local.set({ shinyPickTarget: "zone" }, r));
  await runInPage(injectedStartZonePicker);
  window.close();
});

shinyClearBtn.addEventListener("click", () => {
  shinyResetSel = "";
  shinyZone = null;
  shinyResetInfo.classList.add("hidden");
  shinyZoneInfo.classList.add("hidden");
  shinyPickReset.textContent = "Choisir le bouton reset";
  shinyPickReset.classList.remove("picked");
  shinyPickZone.textContent = "Dessiner la zone shiny";
  shinyPickZone.classList.remove("picked");
  chrome.storage.local.set({ shinyResetSel: "", shinyZone: null });
  updateUI();
});

// --- Evenements Anti-AFK ---

afkModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    afkModeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    afkModeVal = btn.dataset.afkmode;
  });
});

// --- Evenements communs ---

function setSpeed(ms) {
  ms = Math.max(5, Math.min(99999, ms));
  selectedInterval = ms;
  speedInput.value = ms;
  presets.forEach((b) => b.classList.toggle("active", parseInt(b.dataset.ms, 10) === ms));
  chrome.storage.local.set({ interval: ms });
}

// Determine le step intelligent selon la valeur
function getStep(val) {
  if (val <= 50) return 5;
  if (val <= 200) return 10;
  if (val <= 1000) return 50;
  if (val <= 5000) return 100;
  return 500;
}

presets.forEach((btn) => {
  btn.addEventListener("click", () => setSpeed(parseInt(btn.dataset.ms, 10)));
});

speedInput.addEventListener("change", () => {
  setSpeed(parseInt(speedInput.value, 10) || 1000);
});

speedMinus.addEventListener("click", () => {
  setSpeed(selectedInterval - getStep(selectedInterval));
});

speedPlus.addEventListener("click", () => {
  setSpeed(selectedInterval + getStep(selectedInterval));
});

// Maintien du bouton pour changer vite
let holdTimer = null;
let holdSpeed = 200;

function startHold(direction) {
  stopHold();
  holdSpeed = 200;
  holdTimer = setInterval(() => {
    setSpeed(selectedInterval + (direction * getStep(selectedInterval)));
    if (holdSpeed > 50) holdSpeed -= 20;
  }, holdSpeed);
}

function stopHold() {
  if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
}

speedMinus.addEventListener("mousedown", () => startHold(-1));
speedMinus.addEventListener("mouseup", stopHold);
speedMinus.addEventListener("mouseleave", stopHold);
speedPlus.addEventListener("mousedown", () => startHold(1));
speedPlus.addEventListener("mouseup", stopHold);
speedPlus.addEventListener("mouseleave", stopHold);

modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMode = btn.dataset.mode;
    chrome.storage.local.set({ clickMode: selectedMode });
  });
});

toggleBtn.addEventListener("click", async () => {
  if (isRunning) {
    chrome.storage.local.set({ command: { action: "stop" } });
    isRunning = false;
    updateUI();
    stopPolling();
  } else {
    const tabId = await getTabId();
    if (!tabId) return;

    if (currentTab === "single") {
      if (!currentSelector) return;
      const limit = parseInt(clickLimitInput.value) || 0;
      chrome.storage.local.set({
        command: {
          action: "start", tabId, selector: currentSelector,
          interval: selectedInterval, clickMode: selectedMode,
          maxClicks: limit
        }
      });
    } else if (currentTab === "path") {
      if (pathSelectors.length === 0) return;
      chrome.storage.local.set({
        command: {
          action: "startPath", tabId, path: pathSelectors,
          interval: selectedInterval, clickMode: selectedMode
        }
      });
    } else if (currentTab === "shiny") {
      if (!shinyResetSel) return;
      chrome.storage.local.set({ shinyFound: false });
      chrome.storage.local.set({
        command: {
          action: "startShiny", tabId,
          resetSelector: shinyResetSel,
          shinyZone: shinyZone,
          interval: selectedInterval
        }
      });
    } else if (currentTab === "afk") {
      const mins = parseInt(afkIntervalMin.value) || 0;
      const secs = parseInt(afkIntervalSec.value) || 30;
      const intervalMs = (mins * 60 + secs) * 1000;
      chrome.storage.local.set({
        command: {
          action: "startAfk", tabId,
          afkMode: afkModeVal,
          interval: Math.max(1000, intervalMs)
        }
      });
    }

    isRunning = true;
    updateUI();
    startPolling();
  }
});

// --- Au chargement ---
(async () => {
  const data = await chrome.storage.local.get([
    "selector", "interval", "clickMode", "running",
    "currentTab", "pathSelectors",
    "shinyResetSel", "shinyZone", "shinyPickTarget"
  ]);

  if (data.interval) selectedInterval = data.interval;
  if (data.clickMode) selectedMode = data.clickMode;
  if (data.selector) currentSelector = data.selector;
  if (data.pathSelectors) pathSelectors = data.pathSelectors;
  if (data.currentTab) currentTab = data.currentTab;
  if (data.shinyResetSel) shinyResetSel = data.shinyResetSel;
  if (data.shinyZone) shinyZone = data.shinyZone;

  // Verifie si le picker a choisi un element
  const picked = await runInPage(injectedGetPicked);
  const pickedZone = await runInPage(injectedGetZone);
  const target = data.shinyPickTarget || null;
  chrome.storage.local.remove("shinyPickTarget");

  if (pickedZone && target === "zone") {
    shinyZone = pickedZone;
    currentTab = "shiny";
  } else if (picked) {
    if (target === "reset") {
      shinyResetSel = picked;
      currentTab = "shiny";
    } else {
      // "single" ou null → clic unique
      currentSelector = picked;
      chrome.storage.local.set({ selector: picked });
      currentTab = "single";
    }
  }

  // Verifie si le recorder a enregistre un chemin
  const pathData = await runInPage(injectedGetPath);
  if (pathData && pathData.path && pathData.path.length > 0 && !pathData.recording) {
    pathSelectors = pathData.path;
    chrome.storage.local.set({ pathSelectors });
    await runInPage(function () { window.__ac_path = []; });
    currentTab = "path";
  }

  // Affiche le bon onglet (sans animation)
  const tabIdx = TAB_LIST.indexOf(currentTab);
  tabsContainer.className = "tabs pos-" + tabIdx;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));

  Object.entries(panels).forEach(([key, panel]) => {
    if (key === currentTab) {
      panel.classList.add("active");
      panel.style.display = "block";
    } else {
      panel.classList.remove("active");
      panel.style.display = "none";
    }
  });

  if (currentSelector) showTarget(currentSelector);
  renderPathList();
  updateShinyUI();


  speedInput.value = selectedInterval;
  presets.forEach((b) => b.classList.toggle("active", parseInt(b.dataset.ms, 10) === selectedInterval));
  modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === selectedMode));

  if (data.running) {
    isRunning = true;
    startPolling();
  }

  updateUI();
})();
