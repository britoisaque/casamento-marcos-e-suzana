import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "COLE_AQUI";
const db = configured ? getFirestore(initializeApp(firebaseConfig)) : null;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" }[c]));

function showFeedback(target, message, type = "error") { target.innerHTML = `<div class="${type}">${message}</div>`; }
function openDialog(dialog) { dialog.showModal(); }
function closeDialog(dialog) { dialog.close(); }

async function searchGuests() {
  const term = $("#guest-search").value.trim(); const results = $("#guest-results");
  if (term.length < 2) return showFeedback(results, "Digite ao menos 2 letras para buscar.");
  if (!db) return showFeedback(results, "O site ainda precisa ser conectado ao Firebase. Veja o arquivo README.");
  results.innerHTML = '<div class="loading">Buscando seu convite…</div>';
  try {
    // A busca por prefixo permite procurar rapidamente pelo nome.
    const normalized = term.toLocaleLowerCase("pt-BR");
    const guests = await getDocs(query(collection(db, "guests"), where("searchName", ">=", normalized), where("searchName", "<=", normalized + "\uf8ff")));
    if (guests.empty) return showFeedback(results, "Não encontramos um convite com este nome. Tente outro trecho do nome.", "notice");
    results.innerHTML = guests.docs.map(d => `<button class="guest-result" data-guest-id="${d.id}"><span>${escapeHtml(d.data().name)}</span><small>${d.data().category || "Individual"} · ${statusText(d.data().status)}</small><b>Ver convite →</b></button>`).join("");
    results.querySelectorAll("[data-guest-id]").forEach(button => button.addEventListener("click", () => openInvite(button.dataset.guestId)));
  } catch (error) { console.error(error); showFeedback(results, "Não foi possível buscar agora. Verifique a conexão e tente novamente."); }
}
function statusText(status) { return ({ pending: "Aguardando confirmação", confirmed: "Confirmado", absent: "Ausente" })[status] || "Aguardando confirmação"; }

async function openInvite(guestId) {
  const dialog = $("#rsvp-dialog"), content = $("#rsvp-content"); openDialog(dialog); content.innerHTML = '<div class="loading">Carregando convite…</div>';
  try {
    const main = await getDoc(doc(db, "guests", guestId)); if (!main.exists()) throw new Error("Guest unavailable");
    const guest = { id: main.id, ...main.data() }; const inviteId = guest.inviteId || guest.id;
    const members = await getDocs(query(collection(db, "guests"), where("inviteId", "==", inviteId)));
    const group = members.empty ? [guest] : members.docs.map(d => ({ id: d.id, ...d.data() }));
    content.innerHTML = `<p class="eyebrow">Confirmação de presença</p><h2>Olá, ${escapeHtml(guest.name)}!</h2><p class="dialog-intro">Selecione a situação de cada pessoa deste convite e salve a confirmação.</p><form id="rsvp-form"><div class="invite-members">${group.map(member => `<div class="member-row"><span>${escapeHtml(member.name)}</span><select name="${member.id}" aria-label="Status de ${escapeHtml(member.name)}"><option value="pending" ${member.status === "pending" ? "selected" : ""}>Aguardando confirmação</option><option value="confirmed" ${member.status === "confirmed" ? "selected" : ""}>Confirmado</option><option value="absent" ${member.status === "absent" ? "selected" : ""}>Ausente</option></select></div>`).join("")}</div><button class="button button-primary" type="submit">Salvar confirmação <span>→</span></button><div id="rsvp-save-feedback" class="feedback"></div></form>`;
    $("#rsvp-form").addEventListener("submit", e => saveRsvp(e, group));
  } catch (error) { console.error(error); content.innerHTML = '<h2>Algo não saiu como esperado</h2><p>Feche a janela e tente novamente.</p>'; }
}
async function saveRsvp(event, members) {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector("button"), feedback = $("#rsvp-save-feedback"); button.disabled = true; button.textContent = "Salvando…";
  try { await Promise.all(members.map(member => updateDoc(doc(db, "guests", member.id), { status: new FormData(form).get(member.id), updatedAt: serverTimestamp() }))); showFeedback(feedback, "Presença atualizada com carinho. Obrigado!", "success"); $("#guest-results").innerHTML = ""; }
  catch (error) { console.error(error); showFeedback(feedback, "Não foi possível salvar. Tente novamente."); }
  finally { button.disabled = false; button.innerHTML = "Salvar confirmação <span>→</span>"; }
}

async function loadGifts() {
  const list = $("#gift-list"); if (!db) { list.innerHTML = '<div class="notice">Configure o Firebase para mostrar a lista de presentes.</div>'; return; }
  try { const gifts = await getDocs(query(collection(db, "gifts"), where("available", "==", true))); if (gifts.empty) { list.innerHTML = '<div class="notice">Em breve teremos itens disponíveis por aqui.</div>'; return; }
    list.innerHTML = gifts.docs.map(d => { const gift = d.data(); return `<article class="gift-card"><div class="gift-icon">♢</div><div><h3>${escapeHtml(gift.name)}</h3>${gift.description ? `<p>${escapeHtml(gift.description)}</p>` : ""}</div><button class="button button-outline" data-gift-id="${d.id}">Escolher presente</button></article>`; }).join("");
    list.querySelectorAll("[data-gift-id]").forEach(button => button.addEventListener("click", () => openGift(button.dataset.giftId)));
  } catch (error) { console.error(error); list.innerHTML = '<div class="error">Não foi possível carregar os presentes agora.</div>'; }
}
async function openGift(id) {
  const dialog = $("#gift-dialog"), content = $("#gift-content"); openDialog(dialog); content.innerHTML = '<div class="loading">Verificando presente…</div>';
  try { const snap = await getDoc(doc(db, "gifts", id)); const gift = snap.data(); if (!snap.exists() || !gift.available) { closeDialog(dialog); loadGifts(); return showFeedback($("#gift-feedback"), "Este presente acabou de ser escolhido. Que tal selecionar outro?", "notice"); }
    content.innerHTML = `<p class="eyebrow">Lista de presentes</p><h2>${escapeHtml(gift.name)}</h2><p class="dialog-intro">Que alegria receber esse carinho! Deixe seus dados para reservar este item.</p><form id="gift-form"><input type="hidden" name="giftId" value="${id}"/><label>Seu nome<input name="buyerName" required maxlength="100" placeholder="Como podemos agradecer?" /></label><label>Telefone para contato<input name="buyerPhone" required inputmode="tel" maxlength="30" placeholder="(00) 00000-0000" /></label><button class="button button-primary" type="submit">Confirmar presente <span>♡</span></button><div id="gift-save-feedback" class="feedback"></div></form>`;
    $("#gift-form").addEventListener("submit", reserveGift);
  } catch (error) { console.error(error); content.innerHTML = '<p>Não foi possível verificar este presente.</p>'; }
}
async function reserveGift(event) {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), giftRef = doc(db, "gifts", data.get("giftId")); const button = form.querySelector("button"); button.disabled = true; button.textContent = "Reservando…";
  try { await runTransaction(db, async transaction => { const snap = await transaction.get(giftRef); if (!snap.exists() || !snap.data().available) throw new Error("unavailable"); transaction.update(giftRef, { available: false, reservedBy: { name: data.get("buyerName").trim(), phone: data.get("buyerPhone").trim() }, reservedAt: serverTimestamp() }); });
    $("#gift-content").innerHTML = `<div class="thank-you"><div>♡</div><p class="eyebrow">Muito obrigado</p><h2>Seu carinho nos alegrou!</h2><p>O presente foi reservado com sucesso. Marcos & Suzana agradecem de coração.</p><button class="button button-primary" data-close-dialog>Voltar à lista</button></div>`; $("#gift-content [data-close-dialog]").addEventListener("click", () => closeDialog($("#gift-dialog"))); loadGifts();
  } catch (error) { showFeedback($("#gift-save-feedback"), error.message === "unavailable" ? "Este presente acabou de ser escolhido por outra pessoa. Escolha outro item." : "Não foi possível reservar. Tente novamente."); button.disabled = false; button.innerHTML = "Confirmar presente <span>♡</span>"; }
}

$("#search-guests").addEventListener("click", searchGuests); $("#guest-search").addEventListener("keydown", e => { if (e.key === "Enter") searchGuests(); });
document.querySelectorAll("[data-close-dialog]").forEach(b => b.addEventListener("click", () => closeDialog(b.closest("dialog"))));
document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) closeDialog(d); }));
$(".menu-button").addEventListener("click", () => { const b = $(".menu-button"); b.classList.toggle("open"); $(".main-nav").classList.toggle("open"); b.setAttribute("aria-expanded", b.classList.contains("open")); });
document.querySelectorAll(".main-nav a").forEach(a => a.addEventListener("click", () => { $(".menu-button").classList.remove("open"); $(".main-nav").classList.remove("open"); }));
loadGifts();
