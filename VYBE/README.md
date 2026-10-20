# Vybe

Site de discussion façon Discord : comptes (email, Google, Apple), profil (pseudo, nom d'affichage, photo, bannière), amis, groupes avec chat, appels audio/vidéo entre amis.

Technos : HTML / CSS / JavaScript (modules) + Firebase (Auth, Firestore). Aucun outil de build.

## Mise en route

1. Crée un projet sur https://console.firebase.google.com et ajoute une **appli Web**.
2. Colle la configuration dans `firebase-config.js`.
3. **Authentication → Sign-in method** : active *Email/Mot de passe*, *Google* et *Apple*.
   - Apple demande un compte Apple Developer payant (Services ID, clé, etc.). Tu peux commencer sans.
4. **Firestore Database** : crée la base, puis colle `firestore.rules` dans l'onglet *Règles*.
5. *(Plus besoin de Storage : les photos de profil et bannières sont recadrées, compressées et enregistrées directement dans Firestore. `storage.rules` n'est plus utilisé.)*
6. **Authentication → Settings → Domaines autorisés** : ajoute ton domaine (`localhost` est déjà là).
7. **Teste le site sur ton ordinateur.** Les modules ES ne marchent pas en double-cliquant sur `index.html` (`file://`), il faut un petit serveur local. L'adresse `http://localhost:8000` ne fonctionne **que sur ton PC et seulement pendant que le serveur tourne** : ce n'est pas un site en ligne, donc ce lien ne mène à rien tant que tu n'as pas lancé le serveur. Choisis une méthode :
   - **Le plus simple (VS Code)** : installe l'extension *Live Server*, ouvre le dossier du site, clic droit sur `index.html` → *Open with Live Server*. Le navigateur s'ouvre tout seul.
   - **Avec Python** : dans le dossier du site, lance `python -m http.server 8000` (laisse la fenêtre ouverte), puis ouvre http://localhost:8000 dans ton navigateur.
   - **Avec Node** : dans le dossier du site, lance `npx serve .` et ouvre l'adresse affichée dans le terminal.
8. **Mise en ligne (pour avoir une vraie adresse partageable)** : `npm i -g firebase-tools`, puis dans le dossier du site `firebase login`, `firebase init hosting` (dossier public : `.`, application monopage : non) et `firebase deploy`. Firebase te donne une adresse du type `https://ton-projet.web.app`. Pense à l'ajouter dans *Authentication → Settings → Domaines autorisés* (normalement fait automatiquement).

## Fonctionnalités

- Inscription / connexion email, Google, Apple (le pseudo est réservé de façon unique via la collection `usernames`).
- Profil : nom d'affichage, nom d'utilisateur, photo de profil, bannière (images recadrées en 256×256 et 720×240, enregistrées dans Firestore).
- Messages privés entre amis : bouton 💬 dans la liste d'amis, conversations listées dans la barre latérale (rubrique *Messages*).
- Amis : demande par nom d'utilisateur, accepter / refuser, retirer.
- Groupes : création, invitation d'amis, liste des membres, chat en temps réel, quitter.
- Appels audio / vidéo 1-à-1 entre amis (WebRTC, signalisation via Firestore, serveurs STUN Google).

## Limites connues / pistes d'amélioration

- Les appels utilisent seulement STUN : derrière certains réseaux (4G, entreprise) il faut un serveur **TURN** (ex. Twilio, Metered, coturn) à ajouter dans `ICE` de `app.js`.
- Appels de groupe, statuts en ligne, notifications push, messages non lus : pas encore faits.
- Les règles permettent à un membre d'ajouter n'importe quel utilisateur à un groupe, et d'appeler n'importe qui. À durcir (amis uniquement) avant un lancement public, idéalement avec des Cloud Functions.
- Pas de modération ni de limitation de débit des messages.
