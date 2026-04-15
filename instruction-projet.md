# 🧩 Projet : Extension Chrome Auto-Clicker

## 🎯 Objectif

Développer une extension Chrome permettant d’automatiser des clics sur une page web, avec configuration simple via une interface popup.

## ⚙️ Fonctionnalités principales

-   Activer / désactiver l’auto-clicker
-   Définir l’intervalle entre les clics (en millisecondes)
-   Sélectionner un élément HTML à cliquer :
-   Par clic direct (sélecteur automatique)
-   Ou via un sélecteur CSS manuel
-   Mode de clic :
-   Clic simple
-   Double clic
-   Affichage de l’état (actif / inactif)

## 🧠 Comportement attendu

1.  L’utilisateur installe l’extension
2.  Clique sur l’icône de l’extension
3.  Configure :

-   Intervalle (ex: 500 ms)
-   Élément cible

1.  Clique sur "Start"
2.  L’extension commence à cliquer automatiquement sur l’élément choisi
3.  L’utilisateur peut stopper à tout moment

## 🧱 Architecture de l’extension

L’extension doit respecter le format **Manifest V3**.

### Fichiers attendus :

-   `manifest.json`
-   `popup.html`
-   `popup.js`
-   `content.js`
-   `background.js` (optionnel si nécessaire)
-   `styles.css` (optionnel)

## 📄 Détails techniques

### manifest.json

-   Version : Manifest V3
-   Permissions :
-   `activeTab`
-   `scripting`
-   Déclarer :
-   popup
-   content script

### popup (UI)

Interface simple avec :

-   Input : intervalle (ms)
-   Input : sélecteur CSS
-   Boutons :
-   ▶️ Start
-   ⏹ Stop
-   Texte de statut

### content.js

Responsable de :

-   Recevoir les instructions depuis le popup
-   Trouver l’élément cible via `document.querySelector`
-   Simuler les clics avec :

element.click()

-   Gérer un `setInterval` pour répéter les clics
-   Pouvoir arrêter le processus proprement

### Communication

Utiliser :

-   `chrome.runtime.sendMessage`
-   ou `chrome.tabs.sendMessage`

## 🔒 Contraintes & sécurité

-   Ne pas surcharger le CPU (intervalle minimum raisonnable, ex: 50ms)
-   Vérifier que l’élément existe avant de cliquer
-   Stopper automatiquement si l’élément disparaît
-   Empêcher les erreurs silencieuses

## 🧪 Exemple de flux

-   Sélecteur : `.like-button`
-   Intervalle : 1000 ms
-   Résultat : un clic chaque seconde sur tous les boutons correspondants

## ✅ Livrables attendus

-   Code complet de l’extension
-   Instructions d’installation :
-   Mode développeur Chrome
-   Chargement de l’extension
-   Code propre et commenté

## 💡 Bonus (optionnel)

-   Mode sélection visuelle (cliquer sur un élément pour le choisir)
-   Multi-éléments (querySelectorAll)
-   Sauvegarde des paramètres
-   Limite de clics
-   UI améliorée