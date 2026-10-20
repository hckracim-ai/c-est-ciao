import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ---------- Utilitaires ---------- */
const $ = (s) => document.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const state = { me: null, profile: null, friends: [], reqIn: [], reqOut: [], groups: [], dms: [], friendsTab: "all", current: { type: "friends" }, unsubs: {} };
const cache = new Map();
let signupWanted = null;

const ICONS = {
  hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-4-5.6"/>',
  userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};
const icon = (n, s = 20) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

function toast(msg) {
  const d = document.createElement("div");
  d.textContent = msg;
  $("#toast").append(d);
  setTimeout(() => d.remove(), 4000);
}
/** Profil d'un utilisateur (mis en cache 60 s, pour que les changements de photo finissent par apparaître). */
function getUser(uid) {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.t < 60000) return hit.p;
  const p = getDoc(doc(db, "users", uid))
    .then((s) => (s.exists() ? { uid, ...s.data() } : { uid, username: "inconnu", displayName: "Utilisateur inconnu" }))
    .catch(() => ({ uid, username: "inconnu", displayName: "Utilisateur inconnu" }));
  cache.set(uid, { p, t: Date.now() });
  return p;
}
const avatar = (u, size = "") => u.photoURL
  ? `<img class="av ${size}" src="${esc(u.photoURL)}" alt="">`
  : `<div class="av ${size} ph">${esc((u.displayName || u.username || "?")[0].toUpperCase())}</div>`;
const unsub = (k) => { state.unsubs[k]?.(); delete state.unsubs[k]; };
const unsubAll = () => Object.keys(state.unsubs).forEach(unsub);
const dmId = (a, b) => [a, b].sort().join("_");
const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "?";

function openModal(html) { $("#modal-card").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; $("#modal-card").innerHTML = ""; }
$("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") closeModal(); });

/* ---------- Authentification ---------- */
let mode = "login";
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  mode = b.dataset.mode;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $("#a-username").hidden = mode !== "signup";
  $("#a-username").required = mode === "signup";
  $("#a-submit").textContent = mode === "signup" ? "Créer mon compte" : "Se connecter";
}));

const authError = (e) => ({
  "auth/invalid-credential": "Email ou mot de passe incorrect.",
  "auth/email-already-in-use": "Cet email est déjà utilisé.",
  "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
  "auth/popup-closed-by-user": "Connexion annulée.",
  "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet email via une autre méthode."
}[e.code] || e.message);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#a-email").value.trim(), pass = $("#a-pass").value;
  try {
    if (mode === "signup") {
      signupWanted = $("#a-username").value.trim().toLowerCase();
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) { signupWanted = null; toast(authError(err)); }
});
const social = (provider) => async () => { try { await signInWithPopup(auth, provider); } catch (err) { toast(authError(err)); } };
$("#btn-google").addEventListener("click", social(new GoogleAuthProvider()));
const apple = new OAuthProvider("apple.com"); apple.addScope("email"); apple.addScope("name");
$("#btn-apple").addEventListener("click", social(apple));

/** Crée le profil (et réserve le nom d'utilisateur) à la première connexion. */
async function ensureProfile(user, wanted) {
  const uref = doc(db, "users", user.uid);
  if ((await getDoc(uref)).exists()) return;
  const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 16);
  const base = clean(wanted || user.displayName || (user.email || "").split("@")[0]) || "user";
  const display = (wanted || user.displayName || base).slice(0, 32);
  for (let i = 0; i < 8; i++) {
    const name = (i === 0 && wanted && wanted.length >= 3) ? clean(wanted).padEnd(3, "_") : (base.padEnd(3, "_") + Math.floor(1000 + Math.random() * 9000));
    try {
      await runTransaction(db, async (tx) => {
        const nref = doc(db, "usernames", name);
        if ((await tx.get(nref)).exists()) throw new Error("taken");
        tx.set(nref, { uid: user.uid });
        tx.set(uref, { username: name, displayName: display, photoURL: user.photoURL || "", bannerURL: "", createdAt: serverTimestamp() });
      });
      if (i > 0 && wanted) toast(`« ${wanted} » était pris, ton pseudo est @${name} (modifiable dans le profil).`);
      return;
    } catch (e) { if (e.message !== "taken") throw e; }
  }
  throw new Error("Impossible de créer le profil, réessaie.");
}

onAuthStateChanged(auth, async (user) => {
  unsubAll(); cache.clear();
  if (!user) {
    state.me = null; $("#app").hidden = true; $("#auth").hidden = false; return;
  }
  try { await ensureProfile(user, signupWanted); } catch (e) { toast(e.message); await signOut(auth); return; }
  signupWanted = null;
  state.me = user;
  $("#auth").hidden = true; $("#app").hidden = false;
  startListeners();
  navFriends();
});

/* ---------- Écouteurs temps réel ---------- */
function startListeners() {
  const uid = state.me.uid;

  state.unsubs.profile = onSnapshot(doc(db, "users", uid), (s) => {
    state.profile = { uid, ...s.data() };
    cache.set(uid, { p: Promise.resolve(state.profile), t: Date.now() });
    renderMe();
  });

  state.unsubs.groups = onSnapshot(query(collection(db, "groups"), where("members", "array-contains", uid)), (snap) => {
    state.groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (state.current.type === "group" && !state.groups.some((g) => g.id === state.current.id)) return navFriends();
    renderNav();
    if (state.current.type === "group") renderMembers();
  });

  state.unsubs.dms = onSnapshot(query(collection(db, "dms"), where("users", "array-contains", uid)), async (snap) => {
    state.dms = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data();
      return {
        id: d.id,
        other: await getUser(data.users.find((x) => x !== uid)),
        last: data.lastMessage || "",
        at: data.updatedAt?.seconds ?? Date.now() / 1000
      };
    }));
    state.dms.sort((a, b) => b.at - a.at);
    renderSide();
  });

  state.unsubs.friends = onSnapshot(query(collection(db, "friendships"), where("users", "array-contains", uid)), async (snap) => {
    state.friends = await Promise.all(snap.docs.map((d) => getUser(d.data().users.find((x) => x !== uid))));
    state.friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (state.current.type === "friends") renderFriends();
  });

  state.unsubs.reqIn = onSnapshot(query(collection(db, "requests"), where("to", "==", uid)), async (snap) => {
    state.reqIn = await Promise.all(snap.docs.map(async (d) => ({ id: d.id, user: await getUser(d.data().from) })));
    renderRail();
    if (state.current.type === "friends") renderFriends();
  });

  state.unsubs.reqOut = onSnapshot(query(collection(db, "requests"), where("from", "==", uid)), async (snap) => {
    state.reqOut = await Promise.all(snap.docs.map(async (d) => ({ id: d.id, user: await getUser(d.data().to) })));
    if (state.current.type === "friends") renderFriends();
  });

  state.unsubs.calls = onSnapshot(query(collection(db, "calls"), where("to", "==", uid), where("status", "==", "ringing")), async (snap) => {
    if (snap.empty || call) { hideIncoming(); return; }
    const d = snap.docs[0];
    showIncoming(d.id, d.data());
  });
}

/* ---------- Navigation : colonne des groupes, panneau latéral, membres ---------- */
function renderNav() { renderRail(); renderSide(); }

function renderRail() {
  const c = state.current, n = state.reqIn.length;
  $("#rail-home").parentElement.classList.toggle("active", c.type !== "group");
  $("#req-badge").hidden = !n; $("#req-badge").textContent = n;
  $("#rail-groups").innerHTML = state.groups.map((g) => `
    <div class="rail-item ${c.type === "group" && c.id === g.id ? "active" : ""}">
      <button class="rail-btn" data-gid="${g.id}" title="${esc(g.name)}">${esc(initials(g.name))}</button></div>`).join("");
  document.querySelectorAll("#rail-groups .rail-btn").forEach((b) => b.onclick = () => openGroup(b.dataset.gid));
}

function renderSide() {
  const head = $("#side-head"), body = $("#side-body"), c = state.current;
  if (c.type === "group") {
    const g = state.groups.find((x) => x.id === c.id); if (!g) return;
    head.innerHTML = `<button class="head-btn gname" id="g-menu" title="Options du groupe"><span>${esc(g.name)}</span>${icon("chevron", 18)}</button>`;
    body.innerHTML = `<div class="label">Salons textuels</div>
      <button class="item ch active">${icon("hash", 20)}<span class="t"><b>général</b></span></button>`;
    $("#g-menu").onclick = () => groupMenu(g.id);
    return;
  }
  head.innerHTML = `<button class="head-btn find" id="btn-find">Trouver une conversation</button>`;
  body.innerHTML = `<button class="item ${c.type === "friends" ? "active" : ""}" id="nav-friends">${icon("users", 22)}<span class="t"><b>Amis</b></span></button>
    <div class="label">Messages privés</div>` + (state.dms.map((d) => `
    <button class="item dm ${c.type === "dm" && c.id === d.id ? "active" : ""}" data-uid="${d.other.uid}">
      ${avatar(d.other)}<span class="t"><b>${esc(d.other.displayName)}</b>${d.last ? `<small>${esc(d.last)}</small>` : ""}</span></button>`).join("")
    || `<p class="muted" style="padding:4px 8px;font-size:13px">Aucune conversation. Clique sur un ami pour lui écrire.</p>`);
  $("#btn-find").onclick = findModal;
  $("#nav-friends").onclick = () => navFriends();
  document.querySelectorAll(".item.dm").forEach((b) => b.onclick = () => openDm(b.dataset.uid));
}

async function renderMembers() {
  const box = $("#members"), c = state.current;
  const g = c.type === "group" && state.groups.find((x) => x.id === c.id);
  if (!g) { box.hidden = true; box.innerHTML = ""; return; }
  const users = await Promise.all(g.members.map(getUser));
  if (state.current !== c) return;
  box.hidden = false;
  box.innerHTML = `<div class="label">Membres — ${users.length}</div>` + users.map((u) => `
    <div class="member" data-profile="${u.uid}">${avatar(u)}<span>${esc(u.displayName)}</span>${u.uid === g.ownerId ? '<span class="crown" title="Créateur du groupe">👑</span>' : ""}</div>`).join("");
}

function renderMe() {
  const p = state.profile;
  $("#me-panel").innerHTML = `<div class="who">${avatar(p)}
    <div class="names"><b>${esc(p.displayName)}</b><small>@${esc(p.username)}</small></div></div>
    <button class="icon-btn" id="btn-settings" title="Modifier le profil">${icon("settings", 20)}</button>
    <button class="icon-btn" id="btn-logout" title="Déconnexion">${icon("logout", 20)}</button>`;
  $("#btn-settings").onclick = openSettings;
  $("#btn-logout").onclick = () => signOut(auth);
}

$("#rail-home").onclick = () => navFriends();
/* Petits écrans : le panneau latéral devient un menu qu'on ouvre avec ☰ */
$("#btn-menu").onclick = (e) => { e.stopPropagation(); document.body.classList.toggle("side-open"); };
$("#view").addEventListener("click", () => document.body.classList.remove("side-open"));
$(".side").addEventListener("click", (e) => { if (e.target.closest(".item, [data-profile]")) document.body.classList.remove("side-open"); });
$(".rail").addEventListener("click", (e) => { if (e.target.closest(".rail-btn:not(.add)")) document.body.classList.remove("side-open"); });
$("#btn-new-group").onclick = () => {
  openModal(`<h2>Créer un groupe</h2>
    <form id="f-group"><input name="name" maxlength="50" required placeholder="Nom du groupe" autofocus>
    <div class="actions"><button type="button" class="btn small" id="m-cancel">Annuler</button><button class="btn small primary">Créer</button></div></form>`);
  $("#m-cancel").onclick = closeModal;
  $("#f-group input").focus();
  $("#f-group").onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    const r = await addDoc(collection(db, "groups"), { name, ownerId: state.me.uid, members: [state.me.uid], createdAt: serverTimestamp() });
    closeModal(); openGroup(r.id);
  };
};

function findModal() {
  openModal(`<h2>Trouver une conversation</h2><input id="q-find" placeholder="Rechercher un ami" autocomplete="off"><div id="q-list" style="margin-top:12px"></div>`);
  const draw = (q) => {
    const list = state.friends.filter((u) => (u.displayName + " " + u.username).toLowerCase().includes(q.trim().toLowerCase()));
    $("#q-list").innerHTML = list.map((u) => userRow(u, `<button class="btn small primary" data-act="dm" data-uid="${u.uid}">Écrire</button>`)).join("")
      || `<p class="muted">Aucun ami trouvé.</p>`;
  };
  draw("");
  $("#q-find").oninput = (e) => draw(e.target.value);
  $("#q-find").focus();
}

/* ---------- Vue Amis ---------- */
function navFriends() {
  unsub("msgs"); state.current = { type: "friends" };
  renderNav(); renderMembers(); renderFriends();
}

function userRow(u, buttons) {
  return `<div class="user-row"><span data-profile="${u.uid}">${avatar(u, "md")}</span>
    <div class="names"><b>${esc(u.displayName)}</b><small>@${esc(u.username)}</small></div><div class="btns">${buttons}</div></div>`;
}
const cbtn = (ic, title, attrs, cls = "") => `<button class="circle-btn ${cls}" title="${esc(title)}" ${attrs}>${icon(ic, 18)}</button>`;

function renderFriends() {
  const tab = state.friendsTab, nIn = state.reqIn.length, nPend = nIn + state.reqOut.length;
  let body = "";
  if (tab === "all") {
    body = `<h3>Tous les amis — ${state.friends.length}</h3>` + (state.friends.length ? state.friends.map((u) =>
      userRow(u, cbtn("message", "Envoyer un message", `data-act="dm" data-uid="${u.uid}"`)
        + cbtn("phone", "Appel audio", `data-act="call" data-uid="${u.uid}"`)
        + cbtn("video", "Appel vidéo", `data-act="vcall" data-uid="${u.uid}"`)
        + cbtn("x", "Retirer l'ami", `data-act="unfriend" data-uid="${u.uid}"`, "bad"))).join("")
      : `<p class="empty">Pas encore d'amis. Va dans « Ajouter un ami » pour envoyer une demande avec un nom d'utilisateur.</p>`);
  } else if (tab === "pending") {
    body = `<h3>En attente — ${nPend}</h3>` + (nPend
      ? state.reqIn.map((r) => userRow(r.user, `<small class="muted">Demande reçue</small>`
          + cbtn("check", "Accepter", `data-act="accept" data-id="${r.id}"`, "ok")
          + cbtn("x", "Refuser", `data-act="refuse" data-id="${r.id}"`, "bad"))).join("")
        + state.reqOut.map((r) => userRow(r.user, `<small class="muted">Demande envoyée</small>`
          + cbtn("x", "Annuler la demande", `data-act="refuse" data-id="${r.id}"`, "bad"))).join("")
      : `<p class="empty">Aucune demande en attente.</p>`);
  } else {
    body = `<div class="add-box"><h2>Ajouter un ami</h2>
      <div class="muted">Tu peux ajouter des amis avec leur nom d'utilisateur Vybe.</div>
      <form id="f-add" class="add-form"><input name="n" placeholder="Entre un nom d'utilisateur" required autocomplete="off">
      <button class="btn small primary">Envoyer une demande d'ami</button></form></div>`;
  }
  view.innerHTML = `<header class="top"><span class="hash">${icon("users", 22)}</span><h2>Amis</h2><span class="vsep"></span>
    <div class="tabs2">
      <button data-tab="all" class="${tab === "all" ? "on" : ""}">Tous</button>
      <button data-tab="pending" class="${tab === "pending" ? "on" : ""}">En attente${nIn ? `<span class="badge">${nIn}</span>` : ""}</button>
      <button data-tab="add" class="add ${tab === "add" ? "on" : ""}">Ajouter un ami</button>
    </div></header><div class="scroll">${body}</div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { state.friendsTab = b.dataset.tab; renderFriends(); });
  const f = $("#f-add");
  if (f) {
    f.n.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await sendRequest(f.n.value); f.reset(); } catch (err) { toast(err.message); }
    };
  }
}
async function sendRequest(raw) {
  const name = raw.trim().toLowerCase().replace(/^@/, "");
  const s = await getDoc(doc(db, "usernames", name));
  if (!s.exists()) throw new Error("Utilisateur introuvable.");
  const to = s.data().uid, me = state.me.uid;
  if (to === me) throw new Error("C'est toi !");
  if (state.friends.some((f) => f.uid === to)) throw new Error("Vous êtes déjà amis.");
  const incoming = state.reqIn.find((r) => r.user.uid === to);
  if (incoming) return acceptRequest(incoming.id);
  await setDoc(doc(db, "requests", `${me}_${to}`), { from: me, to, createdAt: serverTimestamp() });
  toast("Demande envoyée ✔");
}
async function acceptRequest(id) {
  const r = await getDoc(doc(db, "requests", id));
  if (!r.exists()) return;
  const { from, to } = r.data();
  await setDoc(doc(db, "friendships", id), { users: [from, to], createdAt: serverTimestamp() });
  await deleteDoc(doc(db, "requests", id));
  toast("Ami ajouté 🎉");
}

/* ---------- Chat (commun aux groupes et aux messages privés) ---------- */
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function stamp(d) {
  const t = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Aujourd’hui à ${t}`;
  if (sameDay(d, y)) return `Hier à ${t}`;
  return `${d.toLocaleDateString("fr-FR")} ${t}`;
}

/**
 * Affiche l'en-tête, la liste des messages (temps réel) et la zone de saisie.
 * msgPath : chemin Firestore de la collection de messages.
 * beforeSend : appelé avant l'envoi (ex. mettre à jour la conversation privée).
 */
function mountChat({ headerHtml, placeholder, empty, msgPath, beforeSend, disabled }) {
  const cur = state.current; // si l'utilisateur change de vue, cet objet n'est plus state.current
  unsub("msgs");
  view.innerHTML = `<header class="top">${headerHtml}</header>
    <div class="messages" id="msgs"></div>
    <form class="composer" id="f-msg"><input name="t" maxlength="2000" autocomplete="off" placeholder="${esc(placeholder)}" ${disabled ? "disabled" : ""}></form>`;
  $("#f-msg").onsubmit = async (e) => {
    e.preventDefault();
    const text = e.target.t.value.trim(); if (!text || disabled) return;
    e.target.reset();
    try {
      await beforeSend?.(text);
      await addDoc(collection(db, ...msgPath), { uid: state.me.uid, text, createdAt: serverTimestamp() });
    } catch (err) { console.error(err); toast("Message non envoyé. Vérifie que les règles Firestore sont à jour."); }
  };
  state.unsubs.msgs = onSnapshot(query(collection(db, ...msgPath), orderBy("createdAt", "desc"), limit(100)), async (snap) => {
    const box = $("#msgs"); if (!box || state.current !== cur) return;
    const items = await Promise.all([...snap.docs].reverse().map(async (d) => ({ m: d.data(), u: await getUser(d.data().uid) })));
    if (state.current !== cur) return;
    const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    let html = "", prev = null;
    for (const { m, u } of items) {
      const d = m.createdAt ? m.createdAt.toDate() : new Date();
      const newDay = !prev || !sameDay(prev.d, d);
      if (newDay) html += `<div class="divider"><span>${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></div>`;
      const cont = !newDay && prev.uid === u.uid && d - prev.d < 7 * 60000;
      html += cont
        ? `<div class="msg"><span class="gutter">${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span><div class="body"><p>${esc(m.text)}</p></div></div>`
        : `<div class="msg first"><span class="av-wrap" data-profile="${u.uid}">${avatar(u, "md")}</span><div class="body">
            <div class="meta"><b data-profile="${u.uid}">${esc(u.displayName)}</b><small>${stamp(d)}</small></div><p>${esc(m.text)}</p></div></div>`;
      prev = { uid: u.uid, d };
    }
    box.innerHTML = html || `<p class="empty">${esc(empty)}</p>`;
    if (stick || items.length <= 1) box.scrollTop = box.scrollHeight;
  }, (err) => { console.error(err); toast("Impossible de charger les messages (règles Firestore à jour ?)."); });
  if (!disabled) $("#f-msg input").focus();
}

/* ---------- Groupes ---------- */
function openGroup(gid) {
  const g = state.groups.find((x) => x.id === gid); if (!g) return;
  state.current = { type: "group", id: gid };
  renderNav(); renderMembers();
  mountChat({
    headerHtml: `<span class="hash">${icon("hash", 22)}</span><h2>général</h2><span class="sub">${esc(g.name)}</span><span class="sp"></span>
      <button class="icon-btn" id="g-invite" title="Inviter des amis">${icon("userplus", 22)}</button>`,
    placeholder: `Envoyer un message dans #général`,
    empty: `Bienvenue dans #général de ${g.name}. C'est le début du groupe, dis bonjour 👋`,
    msgPath: ["groups", gid, "messages"]
  });
  $("#g-invite").onclick = () => inviteModal(gid);
}
function groupMenu(gid) {
  const g = state.groups.find((x) => x.id === gid); if (!g) return;
  openModal(`<h2>${esc(g.name)}</h2>
    <button class="btn primary" id="m-invite" style="margin-top:0">Inviter des amis</button>
    <button class="btn danger" id="m-leave">Quitter le groupe</button>
    <div class="actions"><button class="btn small" id="m-cancel">Fermer</button></div>`);
  $("#m-cancel").onclick = closeModal;
  $("#m-invite").onclick = () => inviteModal(gid);
  $("#m-leave").onclick = async () => {
    if (!confirm(`Quitter « ${g.name} » ?`)) return;
    closeModal();
    await updateDoc(doc(db, "groups", gid), { members: arrayRemove(state.me.uid) });
  };
}
function inviteModal(gid) {
  const g = state.groups.find((x) => x.id === gid);
  const list = state.friends.filter((f) => !g.members.includes(f.uid));
  openModal(`<h2>Inviter des amis</h2>${list.length ? list.map((u) =>
    userRow(u, `<button class="btn small primary" data-act="invite" data-gid="${gid}" data-uid="${u.uid}">Ajouter</button>`)).join("")
    : `<p class="muted">Tous tes amis sont déjà dans ce groupe (ou tu n'as pas encore d'amis).</p>`}
    <div class="actions"><button class="btn small" id="m-cancel">Fermer</button></div>`);
  $("#m-cancel").onclick = closeModal;
}

/* ---------- Messages privés ---------- */
async function openDm(otherUid) {
  const other = await getUser(otherUid);
  const me = state.me.uid, id = dmId(me, otherUid);
  state.current = { type: "dm", id };
  renderNav(); renderMembers();
  const isFriend = state.friends.some((f) => f.uid === otherUid);
  mountChat({
    headerHtml: `<span data-profile="${other.uid}">${avatar(other)}</span>
      <h2>${esc(other.displayName)}</h2><span class="sub">@${esc(other.username)}</span><span class="sp"></span>
      <button class="icon-btn" title="Appel audio" data-act="call" data-uid="${other.uid}">${icon("phone", 22)}</button>
      <button class="icon-btn" title="Appel vidéo" data-act="vcall" data-uid="${other.uid}">${icon("video", 22)}</button>`,
    placeholder: isFriend ? `Envoyer un message à @${other.username}` : "Vous n'êtes plus amis : tu ne peux plus écrire ici.",
    empty: `C'est le début de ta conversation avec ${other.displayName}. Dis bonjour 👋`,
    msgPath: ["dms", id, "messages"],
    disabled: !isFriend,
    beforeSend: (text) => setDoc(doc(db, "dms", id), {
      users: [me, otherUid].sort(), lastMessage: text.slice(0, 120), updatedAt: serverTimestamp()
    }, { merge: true })
  });
}

/* ---------- Profil ---------- */
async function showProfile(uid) {
  const u = await getUser(uid);
  const canWrite = uid !== state.me.uid && state.friends.some((f) => f.uid === uid);
  openModal(`<div class="banner" style="${u.bannerURL ? `background-image:url('${esc(u.bannerURL)}')` : ""}"></div>
    <div class="profile-head">${avatar(u, "big")}</div>
    <h2 style="margin:10px 0 0">${esc(u.displayName)}</h2><p class="muted" style="margin:2px 0">@${esc(u.username)}</p>
    <div class="actions"><button class="btn small" id="m-cancel">Fermer</button>
    ${canWrite ? `<button class="btn small primary" data-act="dm" data-uid="${u.uid}">Envoyer un message</button>` : ""}</div>`);
  $("#m-cancel").onclick = closeModal;
}
function openSettings() {
  const p = state.profile;
  openModal(`<h2>Modifier le profil</h2>
    <div class="banner" id="prev-banner" style="${p.bannerURL ? `background-image:url('${esc(p.bannerURL)}')` : ""}"></div>
    <div class="profile-head" id="prev-avatar">${avatar(p, "big")}</div>
    <form id="f-profile">
      <label>Nom d'affichage</label><input name="displayName" maxlength="32" required value="${esc(p.displayName)}">
      <label>Nom d'utilisateur</label><input name="username" required pattern="[a-zA-Z0-9_.]{3,20}" value="${esc(p.username)}">
      <label>Photo de profil</label><input name="avatar" type="file" accept="image/*">
      <label>Bannière</label><input name="banner" type="file" accept="image/*">
      <div class="actions"><button type="button" class="btn small" id="m-cancel">Annuler</button><button class="btn small primary" id="m-save">Enregistrer</button></div>
    </form>`);
  $("#m-cancel").onclick = closeModal;
  const f = $("#f-profile");
  f.avatar.onchange = () => { const x = f.avatar.files[0]; if (x) $("#prev-avatar").innerHTML = `<img class="av big" src="${URL.createObjectURL(x)}">`; };
  f.banner.onchange = () => { const x = f.banner.files[0]; if (x) $("#prev-banner").style.backgroundImage = `url('${URL.createObjectURL(x)}')`; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    $("#m-save").disabled = true;
    try { await saveProfile(f); closeModal(); toast("Profil mis à jour ✔"); }
    catch (err) {
      console.error(err);
      toast(err.message === "taken" ? "Profil enregistré, mais ce nom d'utilisateur est déjà pris." : err.message);
      $("#m-save").disabled = false;
    }
  };
}
/** Recadre l'image au format voulu et la compresse en JPEG (data URL), sans passer par Firebase Storage. */
async function imageToDataURL(file, w, h, quality) {
  if (!file.type.startsWith("image/")) throw new Error("Ce fichier n'est pas une image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image illisible (essaie un JPG ou un PNG)."));
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#101a30"; ctx.fillRect(0, 0, w, h);
    const s = Math.max(w / img.width, h / img.height); // remplit tout le cadre (recadrage centré)
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c.toDataURL("image/jpeg", quality);
  } finally { URL.revokeObjectURL(url); }
}
async function saveProfile(f) {
  const uid = state.me.uid, p = state.profile;
  const username = f.username.value.trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error("Nom d'utilisateur : 3 à 20 caractères (a-z, 0-9, _ .)");
  const upd = { displayName: f.displayName.value.trim().slice(0, 32) || p.username };
  const a = f.avatar.files[0], b = f.banner.files[0];
  if (a) upd.photoURL = await imageToDataURL(a, 256, 256, 0.85);
  if (b) upd.bannerURL = await imageToDataURL(b, 720, 240, 0.82);
  await updateDoc(doc(db, "users", uid), upd);
  if (username !== p.username) {
    await runTransaction(db, async (tx) => {
      const n = doc(db, "usernames", username);
      if ((await tx.get(n)).exists()) throw new Error("taken");
      tx.set(n, { uid });
      tx.delete(doc(db, "usernames", p.username));
      tx.update(doc(db, "users", uid), { username });
    });
  }
}

/* ---------- Clics (délégation) ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-profile]"); if (!t) return;
  if (t.dataset.profile) return showProfile(t.dataset.profile);
  const { act, id, uid, gid } = t.dataset;
  try {
    if (act === "accept") await acceptRequest(id);
    else if (act === "refuse") await deleteDoc(doc(db, "requests", id));
    else if (act === "unfriend") {
      const fs = [`${state.me.uid}_${uid}`, `${uid}_${state.me.uid}`];
      if (confirm("Retirer cet ami ?")) for (const x of fs) await deleteDoc(doc(db, "friendships", x)).catch(() => {});
    }
    else if (act === "dm") { closeModal(); await openDm(uid); }
    else if (act === "call" || act === "vcall") startCall(await getUser(uid), act === "vcall");
    else if (act === "invite") { await updateDoc(doc(db, "groups", gid), { members: arrayUnion(uid) }); toast("Ami ajouté au groupe ✔"); closeModal(); }
  } catch (err) { toast(err.message); }
});

/* ---------- Appels audio / vidéo (WebRTC + signalisation Firestore) ---------- */
const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
let call = null;

function setStatus(t) { $("#call-status").textContent = t; }
async function initCall(role, id, video) {
  call = { id, role, pending: [], unsubs: [], pc: new RTCPeerConnection(ICE) };
  try { call.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video }); }
  catch (e) { call.pc.close(); call = null; throw e; }
  call.stream.getTracks().forEach((t) => call.pc.addTrack(t, call.stream));
  $("#local-video").srcObject = call.stream;
  $("#local-video").hidden = !video; $("#c-cam").hidden = !video;
  call.remote = new MediaStream();
  $("#remote-video").srcObject = call.remote;
  call.pc.ontrack = (e) => e.streams[0].getTracks().forEach((t) => call.remote.addTrack(t));
  call.pc.onicecandidate = (e) => {
    if (e.candidate) addDoc(collection(db, "calls", id, role === "caller" ? "callerCandidates" : "calleeCandidates"), e.candidate.toJSON());
  };
  call.pc.onconnectionstatechange = () => {
    const s = call?.pc.connectionState;
    if (s === "connected") setStatus("En appel");
    if (s === "failed" || s === "disconnected") setStatus("Connexion perdue…");
  };
  $("#c-mute").classList.remove("off"); $("#c-cam").classList.remove("off");
  $("#call").hidden = false;
}
async function addCand(c) {
  if (!call) return;
  if (call.pc.remoteDescription) await call.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  else call.pending.push(c);
}
async function flushCands() { const c = call; const list = c.pending.splice(0); for (const x of list) await c.pc.addIceCandidate(new RTCIceCandidate(x)).catch(() => {}); }

async function startCall(friend, video) {
  if (call) return toast("Tu es déjà en appel.");
  const callRef = doc(collection(db, "calls"));
  try { await initCall("caller", callRef.id, video); }
  catch { return toast("Micro ou caméra inaccessible (vérifie les autorisations)."); }
  setStatus(`Appel de ${friend.displayName}…`);
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  await setDoc(callRef, { from: state.me.uid, to: friend.uid, status: "ringing", video, offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp() });
  call.unsubs.push(onSnapshot(callRef, async (s) => {
    const d = s.data(); if (!d || !call) return;
    if (d.answer && !call.pc.currentRemoteDescription) { await call.pc.setRemoteDescription(d.answer); await flushCands(); setStatus("En appel"); }
    if (d.status === "ended" || d.status === "declined") { toast(d.status === "declined" ? "Appel refusé." : "Appel terminé."); endCall(false); }
  }));
  call.unsubs.push(onSnapshot(collection(callRef, "calleeCandidates"), (s) => s.docChanges().forEach((c) => c.type === "added" && addCand(c.doc.data()))));
  // Pas de réponse au bout de 45 s
  const cid = call.id;
  setTimeout(() => { if (call && call.id === cid && call.pc.connectionState !== "connected" && !call.pc.currentRemoteDescription) { toast("Pas de réponse."); endCall(true); } }, 45000);
}
async function acceptCall(id, data) {
  hideIncoming();
  const callRef = doc(db, "calls", id);
  try { await initCall("callee", id, !!data.video); }
  catch { await updateDoc(callRef, { status: "declined" }); return toast("Micro ou caméra inaccessible."); }
  setStatus("Connexion…");
  await call.pc.setRemoteDescription(data.offer);
  const ans = await call.pc.createAnswer();
  await call.pc.setLocalDescription(ans);
  await updateDoc(callRef, { status: "active", answer: { type: ans.type, sdp: ans.sdp } });
  call.unsubs.push(onSnapshot(collection(callRef, "callerCandidates"), (s) => s.docChanges().forEach((c) => c.type === "added" && addCand(c.doc.data()))));
  call.unsubs.push(onSnapshot(callRef, (s) => { const d = s.data(); if (d?.status === "ended") { toast("Appel terminé."); endCall(false); } }));
  await flushCands();
}
async function endCall(notify = true) {
  if (!call) return;
  const c = call; call = null;
  c.unsubs.forEach((u) => u());
  c.stream?.getTracks().forEach((t) => t.stop());
  c.pc.close();
  $("#call").hidden = true;
  $("#remote-video").srcObject = null; $("#local-video").srcObject = null;
  if (notify) { try { await updateDoc(doc(db, "calls", c.id), { status: "ended" }); } catch { /* ignore */ } }
}
async function showIncoming(id, data) {
  const u = await getUser(data.from);
  const box = $("#incoming");
  box.innerHTML = `${avatar(u, "md")}<div><b>${esc(u.displayName)}</b><div class="muted">Appel ${data.video ? "vidéo" : "audio"} entrant…</div></div>
    <button class="btn small primary" id="in-ok">Répondre</button><button class="btn small danger" id="in-no">Refuser</button>`;
  box.hidden = false;
  $("#in-ok").onclick = () => acceptCall(id, data);
  $("#in-no").onclick = async () => { hideIncoming(); await updateDoc(doc(db, "calls", id), { status: "declined" }).catch(() => {}); };
}
function hideIncoming() { $("#incoming").hidden = true; $("#incoming").innerHTML = ""; }

$("#c-hang").onclick = () => endCall(true);
$("#c-mute").onclick = (e) => {
  const t = call?.stream.getAudioTracks()[0]; if (!t) return;
  t.enabled = !t.enabled; e.currentTarget.classList.toggle("off", !t.enabled);
};
$("#c-cam").onclick = (e) => {
  const t = call?.stream.getVideoTracks()[0]; if (!t) return;
  t.enabled = !t.enabled; e.currentTarget.classList.toggle("off", !t.enabled);
};
window.addEventListener("beforeunload", () => { if (call) endCall(true); });
