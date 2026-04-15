// Background service worker
// Clics via chrome.debugger

let activeTabId = null;
let isAttached = false;
let clickTimer = null;
let clickCount = 0;
let clicking = false;
let missedClicks = 0;

const MAX_MISSED = 20;

// ============================
// Badge compteur sur l'icone
// ============================

function updateBadge(count) {
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" });
}

function setBadgeShiny() {
  chrome.action.setBadgeText({ text: "!!!" });
  chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
}

// ============================
// Son + Notification shiny
// ============================

async function playShinyAlert() {
  // Cree un offscreen document pour jouer le son
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Jouer le son d'alerte shiny"
    });
  } catch (e) {
    // Deja ouvert, c'est ok
  }

  // Envoie le message pour jouer le son
  chrome.runtime.sendMessage({ action: "playAlert" }).catch(() => {});

  // Notification systeme
  chrome.notifications.create("shiny-found", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "SHINY TROUVE !",
    message: "Flamachou shiny detecte apres " + clickCount + " resets ! La securite reste active.",
    priority: 2,
    requireInteraction: true
  });
}

// ============================
// Debugger
// ============================

function attach(tabId) {
  return new Promise((resolve) => {
    if (isAttached && activeTabId === tabId) {
      resolve(true);
      return;
    }
    const doAttach = () => {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          activeTabId = tabId;
          isAttached = true;
          resolve(true);
        }
      });
    };
    if (isAttached && activeTabId !== tabId) {
      chrome.debugger.detach({ tabId: activeTabId }, () => {
        isAttached = false;
        activeTabId = null;
        doAttach();
      });
    } else {
      doAttach();
    }
  });
}

function sendCommand(tabId, method, params) {
  return new Promise((resolve) => {
    if (!isAttached || activeTabId !== tabId) {
      resolve(null);
      return;
    }
    try {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(result);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// ============================
// Clic
// ============================

async function sendRealClick(tabId, x, y, clickMode) {
  if (!isAttached) return false;

  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "none"
  });

  await new Promise(r => setTimeout(r, 15));

  let r = await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1,
    pointerType: "mouse"
  });
  if (r === null && !isAttached) return false;

  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1,
    pointerType: "mouse"
  });

  if (clickMode === "double") {
    await new Promise(r => setTimeout(r, 10));
    await sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", clickCount: 2,
      pointerType: "mouse"
    });
    await sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", clickCount: 2,
      pointerType: "mouse"
    });
  }
  return true;
}

async function getElementPosition(tabId, selector) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: function (sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      },
      args: [selector]
    });
    return results?.[0]?.result;
  } catch (e) {
    return null;
  }
}

// ============================
// Stop
// ============================

function stopClicker() {
  if (clickTimer) {
    clearInterval(clickTimer);
    clickTimer = null;
  }
  clicking = false;
  missedClicks = 0;
  clearBadge();
  chrome.storage.local.set({ running: false, clickCount: clickCount });

  const tabId = activeTabId;
  if (isAttached && tabId) {
    isAttached = false;
    activeTabId = null;
    try {
      chrome.debugger.detach({ tabId }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }
}

// ============================
// Clic unique
// ============================

async function doOneClick(tabId, selector, clickMode) {
  if (clicking || !isAttached) return;
  clicking = true;

  try {
    const pos = await getElementPosition(tabId, selector);

    if (!pos) {
      missedClicks++;
      if (missedClicks >= MAX_MISSED) {
        clicking = false;
        stopClicker();
        return;
      }
      clicking = false;
      return;
    }

    missedClicks = 0;
    if (!isAttached) { clicking = false; return; }

    const ox = Math.round((Math.random() - 0.5) * 4);
    const oy = Math.round((Math.random() - 0.5) * 4);
    const ok = await sendRealClick(tabId, pos.x + ox, pos.y + oy, clickMode);

    if (ok) {
      clickCount++;
      chrome.storage.local.set({ clickCount: clickCount, running: true });
      updateBadge(clickCount);
    }
  } catch (e) {}

  clicking = false;
}

async function startClicker(tabId, selector, interval, clickMode) {
  if (clickTimer) {
    clearInterval(clickTimer);
    clickTimer = null;
  }
  clickCount = 0;
  clicking = false;
  missedClicks = 0;

  const ok = await attach(tabId);
  if (!ok) {
    chrome.storage.local.set({ running: false, lastError: "Debugger impossible" });
    return;
  }

  chrome.storage.local.set({ running: true, clickCount: 0, lastError: "" });

  await doOneClick(tabId, selector, clickMode);

  clickTimer = setInterval(() => {
    if (isAttached) {
      doOneClick(tabId, selector, clickMode);
    } else {
      clearInterval(clickTimer);
      clickTimer = null;
      chrome.storage.local.set({ running: false });
    }
  }, interval);
}

// ============================
// Chemin de clics
// ============================

let pathIndex = 0;
let pathList = [];
let pathClickMode = "single";
let pathTabId = null;

async function doPathClick() {
  if (clicking || !isAttached) return;
  clicking = true;

  try {
    const selector = pathList[pathIndex];
    const pos = await getElementPosition(pathTabId, selector);

    if (!pos) {
      missedClicks++;
      if (missedClicks >= MAX_MISSED) {
        clicking = false;
        stopClicker();
        return;
      }
      pathIndex = (pathIndex + 1) % pathList.length;
      clicking = false;
      return;
    }

    missedClicks = 0;
    if (!isAttached) { clicking = false; return; }

    const ox = Math.round((Math.random() - 0.5) * 4);
    const oy = Math.round((Math.random() - 0.5) * 4);
    const ok = await sendRealClick(pathTabId, pos.x + ox, pos.y + oy, pathClickMode);

    if (ok) {
      clickCount++;
      chrome.storage.local.set({ clickCount: clickCount, running: true });
      updateBadge(clickCount);
    }

    pathIndex = (pathIndex + 1) % pathList.length;
  } catch (e) {}

  clicking = false;
}

async function startPathClicker(tabId, path, interval, clickMode) {
  if (clickTimer) {
    clearInterval(clickTimer);
    clickTimer = null;
  }
  clickCount = 0;
  clicking = false;
  missedClicks = 0;
  pathIndex = 0;
  pathList = path;
  pathClickMode = clickMode;
  pathTabId = tabId;

  const ok = await attach(tabId);
  if (!ok) {
    chrome.storage.local.set({ running: false, lastError: "Debugger impossible" });
    return;
  }

  chrome.storage.local.set({ running: true, clickCount: 0, lastError: "" });

  await doPathClick();

  clickTimer = setInterval(() => {
    if (isAttached) {
      doPathClick();
    } else {
      clearInterval(clickTimer);
      clickTimer = null;
      chrome.storage.local.set({ running: false });
    }
  }, interval);
}

// ============================
// Mode Flamachou Shiny
// ============================
// 1. Clique le bouton reset en boucle
// 2. Detecte quand la zone shiny change → STOP, shiny trouve !

let shinyResetSel = "";
let shinyZone = null;
let shinyTabId = null;
let shinyZoneTimer = null;
let shinyZoneSnapshot = null;

// Prend un snapshot de la zone : classes CSS, nombre d'elements, attributs visuels
async function takeZoneSnapshot(tabId, zone) {
  if (!zone) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: function (z) {
        var data = { classes: [], tags: [], childCount: 0, texts: [] };
        var step = 12;
        var seen = new Set();
        for (var px = z.x + 5; px < z.x + z.w; px += step) {
          for (var py = z.y + 5; py < z.y + z.h; py += step) {
            var el = document.elementFromPoint(px, py);
            if (!el || seen.has(el)) continue;
            seen.add(el);
            data.childCount++;
            data.tags.push(el.tagName);
            if (el.className && typeof el.className === "string") {
              el.className.split(/\s+/).forEach(function(c) {
                if (c) data.classes.push(c);
              });
            }
            var text = (el.textContent || "").trim().substring(0, 20);
            if (text) data.texts.push(text);
          }
        }
        data.classes.sort();
        data.tags.sort();
        data.texts.sort();
        return data;
      },
      args: [zone]
    });
    return results?.[0]?.result || null;
  } catch (e) {
    return null;
  }
}

// Surveillance de la zone shiny
// Apprend les etats "normaux" puis detecte quand quelque chose de NOUVEAU apparait
let knownClasses = new Set();
let knownTexts = new Set();
let shinyLearning = true;
let shinyZoneRef = null; // copie de la zone pour le timer

const LEARNING_CLICKS = 10; // Apprend pendant les 10 premiers resets

// Appele par doShinyClick apres chaque reset pour apprendre ou detecter
async function shinyZoneCheck(tabId) {
  if (!shinyZoneRef) return;

  // Attend un court instant que la page reagisse au clic
  await new Promise(r => setTimeout(r, 200));

  const snap = await takeZoneSnapshot(tabId, shinyZoneRef);
  if (!snap) return;

  if (shinyLearning) {
    // Phase d'apprentissage : memorise tout
    snap.classes.forEach(c => knownClasses.add(c));
    snap.texts.forEach(t => knownTexts.add(t));
    return;
  }

  // Phase de detection : cherche des classes ou textes jamais vus
  let newClasses = snap.classes.filter(c => !knownClasses.has(c));
  let newTexts = snap.texts.filter(t => !knownTexts.has(t));

  if (newClasses.length > 0 || newTexts.length > 0) {
    // SHINY TROUVE !
    shinyZoneRef = null;
    chrome.storage.local.set({ shinyFound: true, clickCount: clickCount });

    // Son + notification + badge dore
    setBadgeShiny();
    playShinyAlert();

    // Stop tout
    stopClicker();
  }
}

function startShinyZoneWatch(tabId, zone) {
  if (!zone) return;
  stopShinyZoneWatch();
  shinyZoneRef = zone;
  knownClasses = new Set();
  knownTexts = new Set();
  shinyLearning = true;
}

function stopShinyZoneWatch() {
  shinyZoneRef = null;
  shinyZoneSnapshot = null;
  knownClasses = new Set();
  knownTexts = new Set();
  shinyLearning = true;
}

async function doShinyClick(tabId) {
  if (clicking || !isAttached) return;
  clicking = true;

  try {
    // Clique le bouton reset
    const pos = await getElementPosition(tabId, shinyResetSel);

    if (!pos) {
      missedClicks++;
      if (missedClicks >= MAX_MISSED) {
        clicking = false;
        stopClicker();
        return;
      }
      clicking = false;
      return;
    }

    missedClicks = 0;
    if (!isAttached) { clicking = false; return; }

    const ox = Math.round((Math.random() - 0.5) * 4);
    const oy = Math.round((Math.random() - 0.5) * 4);
    const ok = await sendRealClick(tabId, pos.x + ox, pos.y + oy, "single");

    if (ok) {
      clickCount++;
      chrome.storage.local.set({ clickCount: clickCount, running: true });
      updateBadge(clickCount);

      // Apres le clic, scanne la zone shiny
      if (shinyZoneRef) {
        // Fin de la phase d'apprentissage apres N clics
        if (clickCount === LEARNING_CLICKS) {
          shinyLearning = false;
        }
        await shinyZoneCheck(tabId);
      }
    }
  } catch (e) {}

  clicking = false;
}

async function startShinyHunter(tabId, resetSel, zone, interval) {
  if (clickTimer) {
    clearInterval(clickTimer);
    clickTimer = null;
  }
  stopShinyZoneWatch();

  clickCount = 0;
  clicking = false;
  missedClicks = 0;
  shinyResetSel = resetSel;
  shinyZone = zone;
  shinyTabId = tabId;

  const ok = await attach(tabId);
  if (!ok) {
    chrome.storage.local.set({ running: false, lastError: "Debugger impossible" });
    return;
  }

  chrome.storage.local.set({ running: true, clickCount: 0, lastError: "", shinyFound: false });

  // Lance la surveillance de la zone shiny
  startShinyZoneWatch(tabId, zone);

  // Premier reset
  await doShinyClick(tabId);

  // Resets en boucle
  clickTimer = setInterval(() => {
    if (isAttached) {
      doShinyClick(tabId);
    } else {
      clearInterval(clickTimer);
      clickTimer = null;
      stopSafetyWatch();
      chrome.storage.local.set({ running: false });
    }
  }, interval);
}

// Override stopClicker pour aussi arreter la surveillance
const _origStop = stopClicker;
stopClicker = function () {
  stopShinyZoneWatch();
  if (afkTimer) { clearInterval(afkTimer); afkTimer = null; }
  _origStop();
};

// ============================
// Anti-AFK
// ============================

let afkTimer = null;
let afkTabId = null;

async function doAfkAction(tabId, mode) {
  if (!isAttached) return;

  // Position aleatoire sur la page
  const viewport = await chrome.scripting.executeScript({
    target: { tabId },
    func: function () {
      return { w: window.innerWidth, h: window.innerHeight };
    }
  }).catch(() => null);

  if (!viewport || !viewport[0]?.result) return;
  const { w, h } = viewport[0].result;

  const x = Math.round(100 + Math.random() * (w - 200));
  const y = Math.round(100 + Math.random() * (h - 200));

  // Bouge la souris vers un point aleatoire
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "none", pointerType: "mouse"
  });

  // Si mode click, clique aussi
  if (mode === "click") {
    await new Promise(r => setTimeout(r, 100));
    await sendRealClick(tabId, x, y, "single");
  }

  clickCount++;
  chrome.storage.local.set({ clickCount: clickCount, running: true });
  updateBadge(clickCount);
}

async function startAfk(tabId, mode, interval) {
  if (afkTimer) { clearInterval(afkTimer); afkTimer = null; }
  clickCount = 0;
  afkTabId = tabId;

  const ok = await attach(tabId);
  if (!ok) {
    chrome.storage.local.set({ running: false });
    return;
  }

  chrome.storage.local.set({ running: true, clickCount: 0 });

  await doAfkAction(tabId, mode);

  afkTimer = setInterval(() => {
    if (isAttached) {
      doAfkAction(tabId, mode);
    } else {
      clearInterval(afkTimer);
      afkTimer = null;
      chrome.storage.local.set({ running: false });
    }
  }, interval);
}

// ============================
// Ecoute commandes
// ============================

chrome.storage.onChanged.addListener((changes) => {
  if (changes.command && changes.command.newValue) {
    const cmd = changes.command.newValue;
    chrome.storage.local.remove("command");

    if (cmd.action === "start") {
      startClicker(cmd.tabId, cmd.selector, cmd.interval, cmd.clickMode);
    } else if (cmd.action === "startPath") {
      startPathClicker(cmd.tabId, cmd.path, cmd.interval, cmd.clickMode);
    } else if (cmd.action === "startShiny") {
      startShinyHunter(cmd.tabId, cmd.resetSelector, cmd.shinyZone, cmd.interval);
    } else if (cmd.action === "startAfk") {
      startAfk(cmd.tabId, cmd.afkMode, cmd.interval);
    } else if (cmd.action === "stop") {
      stopClicker();
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) stopClicker();
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === activeTabId) {
    isAttached = false;
    activeTabId = null;
    if (clickTimer) {
      clearInterval(clickTimer);
      clickTimer = null;
    }
    clicking = false;
    missedClicks = 0;
    chrome.storage.local.set({ running: false });
  }
});
