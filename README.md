# Auto-Clicker - Extension Chrome

Extension Chrome tout-en-un pour automatiser des clics sur n'importe quel site web. Utilise le protocole Chrome DevTools (`chrome.debugger`) pour envoyer de vrais clics au niveau du navigateur (`isTrusted: true`), indetectables par les sites.

---

## Installation

1. Ouvrir `chrome://extensions/` dans Chrome
2. Activer le **Mode developpeur** (en haut a droite)
3. Cliquer sur **Charger l'extension non empaquetee**
4. Selectionner le dossier `Auto-Clicker`
5. L'icone apparait dans la barre d'extensions

---

## Fonctionnalites

### 4 modes disponibles

| Mode | Description |
|------|-------------|
| **Clic unique** | Clique en boucle sur un seul element |
| **Chemin de clics** | Enregistre une sequence de clics et la rejoue en boucle |
| **Flamachou Shiny** | Mode specialise pour la chasse au shiny sur elmatte0.fr |
| **Anti-AFK** | Bouge la souris et clique aleatoirement pour rester actif |

---

## Mode : Clic unique

Le mode de base. Clique en boucle sur un element de la page.

### Utilisation

1. Cliquer sur **"Choisir sur la page"**
2. Le popup se ferme, un bandeau apparait sur la page
3. Cliquer sur l'element a auto-cliquer
4. Rouvrir le popup, l'element est selectionne
5. Regler la **vitesse** (5ms a 99999ms)
6. Choisir **Simple** ou **Double** clic
7. Cliquer **Demarrer**

### Vitesse

- **Input numerique** avec boutons -/+ (step intelligent)
- **Presets rapides** : 5ms / 50ms / 100ms / 500ms / 1s / 5s
- Maintenir -/+ pour changer rapidement

---

## Mode : Chemin de clics

Enregistre une sequence de clics sur plusieurs elements, puis les rejoue en boucle.

### Utilisation

1. Aller dans l'onglet **Chemin**
2. Cliquer **Enregistrer**
3. Un bandeau rouge apparait, cliquer les elements dans l'ordre
4. Chaque clic est confirme par un flash vert + compteur
5. Appuyer **Echap** pour terminer l'enregistrement
6. Rouvrir le popup, la sequence s'affiche
7. Cliquer **Demarrer**

### Comportement

- Clique chaque element de la liste dans l'ordre : A -> B -> C -> A -> B -> C...
- Respecte l'intervalle de vitesse entre chaque clic
- Si un element disparait temporairement, il passe au suivant

---

## Mode : Flamachou Shiny Hunter

Mode specialise pour la chasse au Flamachou shiny sur [elmatte0.fr](https://elmatte0.fr).

### Concept

Le site permet de "reset" un badge Flamachou. Le shiny est une variante rare avec des couleurs differentes. Ce mode automatise le processus de reset et detecte automatiquement quand le shiny apparait.

### Configuration

| Element | Quoi faire | Role |
|---------|-----------|------|
| **Bouton Reset** | Cliquer pour choisir le bouton de reset | Spam en boucle pour reroll le badge |
| **Zone Shiny** | Dessiner un rectangle autour du badge | Detecte quand le badge change (shiny detecte) |

### Detection du shiny

La zone shiny fonctionne en 2 phases :

1. **Apprentissage** (10 premiers resets) : memorise toutes les classes CSS et textes presents dans la zone. C'est la base de ce qui est "normal".
2. **Detection** (apres 10 resets) : compare chaque reset avec la base. Si une nouvelle classe CSS ou un nouveau texte apparait, c'est le shiny.

### Quand le shiny est detecte

- Les resets **s'arretent** immediatement
- **Notification systeme** Windows avec le nombre de resets
- **Son d'alerte** (melodie de victoire en 6 notes)
- **Badge "!!!"** dore sur l'icone de l'extension

### Flamachou normal vs shiny

| | Normal | Shiny |
|---|--------|-------|
| Corps | Rouge fonce | Rose saumon |
| Oreilles (interieur) | Orange | Orange clair |
| Teinte generale | Magenta | Peche |

---

## Mode : Anti-AFK

Empeche la deconnexion automatique sur les sites qui detectent l'inactivite.

### Utilisation

1. Aller dans l'onglet **Anti-AFK**
2. Choisir le mode :
   - **Souris seule** : bouge la souris a un endroit aleatoire
   - **Souris + Clics** : bouge la souris ET clique aleatoirement
3. Regler l'intervalle (par defaut 30 secondes)
4. Cliquer **Activer Anti-AFK**

### Cas d'usage

- Sessions qui expirent apres inactivite
- Jeux en ligne avec systeme anti-AFK
- Sites de streaming qui pausent apres un moment

---

## Interface

### Design

- Theme sombre inspire de [elmatte0.fr](https://elmatte0.fr)
- Couleurs violet/indigo avec effets glassmorphism
- Police Inter
- Animations liquid glass entre les onglets
- Indicateur de tab glissant avec couleur par mode

### Ouvrir en grand

Cliquer l'icone en haut a droite du popup pour ouvrir l'interface dans un onglet plein ecran (500px centre avec ombre).

### Compteur en temps reel

- **Badge sur l'icone** : affiche le nombre de clics meme popup ferme
- **Badge "!!!"** dore quand le shiny est detecte
- **Compteur dans le popup** : mis a jour toutes les 400ms

---

## Architecture technique

### Fichiers

```
Auto-Clicker/
  manifest.json        # Manifest V3
  popup.html           # Interface utilisateur
  popup.js             # Logique du popup (UI, picker, events)
  styles.css           # Styles (glassmorphism, animations)
  background.js        # Service worker (debugger, clics, detection)
  offscreen.html       # Document offscreen pour jouer les sons
  icons/
    icon16.png         # Icone 16x16 (curseur + ondes)
    icon48.png         # Icone 48x48
    icon128.png        # Icone 128x128
  test-shiny.html      # Page de test pour le mode Flamachou
  shiny.png            # Image Flamachou shiny
  pas shiny.png        # Image Flamachou normal
```

### Permissions

| Permission | Usage |
|-----------|-------|
| `activeTab` | Acces a l'onglet actif |
| `scripting` | Injection de scripts (picker, position) |
| `storage` | Sauvegarde des parametres et communication |
| `debugger` | Envoi de vrais clics via Chrome DevTools Protocol |
| `notifications` | Alertes quand le shiny est detecte |
| `offscreen` | Document cache pour jouer les sons |

### Communication popup <-> background

Toute la communication passe par `chrome.storage.local` :

```
Popup ecrit { command: { action: "start", ... } }
  -> background ecoute chrome.storage.onChanged
  -> background execute la commande
  -> background ecrit { running: true, clickCount: N }
  -> popup lit via polling toutes les 400ms
```

### Methode de clic

```
chrome.debugger.attach()
  -> Input.dispatchMouseEvent("mouseMoved")   // deplace la souris
  -> Input.dispatchMouseEvent("mousePressed")  // appuie
  -> Input.dispatchMouseEvent("mouseReleased") // relache
```

Les evenements ont `isTrusted: true` et `pointerType: "mouse"`, indistinguables d'un vrai clic humain.

### Selecteur CSS

Le picker genere des selecteurs bases sur `nth-child` uniquement :

```
div:nth-child(1) > main:nth-child(2) > button:nth-child(3)
```

Compatible avec tous les sites, y compris ceux qui utilisent Tailwind CSS (classes avec `[]`, `.`, `:` qui cassent les selecteurs classiques).

---

## Page de test

Le fichier `test-shiny.html` simule le comportement d'elmatte0.fr :

- Badge Flamachou avec les vraies images (normal / shiny)
- Bouton **Reset** avec cooldown de 3 secondes
- **1/1000** de chance de shiny a chaque reset
- Bouton **securite** qui apparait 1 fois sur 5 (doit etre clique en 3s)
- Boutons debug : **Forcer shiny**, **Forcer securite**, **Reinitialiser**

### Lancer le test

1. Ouvrir `test-shiny.html` dans Chrome
2. Ouvrir l'extension > onglet **Shiny**
3. Configurer les 3 elements (reset, securite, zone)
4. Lancer le hunt

---

## Notes

- Le bandeau jaune **"Auto-Clicker a commence le debogage"** est normal, c'est l'API debugger. Ne pas le fermer pendant l'utilisation.
- L'extension fonctionne sur **tous les sites** sauf les pages protegees (`chrome://`, `chrome-extension://`).
- Les parametres (selecteurs, vitesse, mode) sont **sauvegardes** entre les sessions.
- Chaque mode a sa propre **couleur** dans l'indicateur d'onglet : violet (clic), bleu (chemin), dore (shiny), rouge (anti-afk).
