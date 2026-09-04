import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, adminEmails } from "./firebase-config.js";

const $ = selector => document.querySelector(selector);
const configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "AIzaSyCjhvPsc2fRh7XSgptFqZ16FtzZP7bn8NQ";
let app, auth, db, guests = [], gifts = [], currentUser;
if (configured) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }
const statusLabel = status => ({ pending: "Aguardando", confirmed: "Confirmado", absent: "Ausente" })[status] || "Aguardando";
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" }[c]));
function feedback(target, message, type = "error") { target.innerHTML = `<div class="${type}">${message}</div>`; }
function normalize(value = "") { return String(value).trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function slug(value = "") { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

async function isAdmin(user) {
  const token = await user.getIdTokenResult();
  return token.claims.admin === true || adminEmails.map(normalize).includes(normalize(user.email));
}
function showLogin(message) { $("#dashboard-view").hidden = true; $("#login-view").hidden = false; if (message) feedback($("#login-feedback"), message, "notice"); }
async function showDashboard(user) {
  if (!await isAdmin(user)) { await signOut(auth); showLogin("Esta conta não está autorizada a acessar o painel."); return; }
  currentUser = user; $("#login-view").hidden = true; $("#dashboard-view").hidden = false; $("#admin-email").textContent = user.email; $("#admin-name").textContent = user.displayName?.split(" ")[0] || user.email.split("@")[0];
  await Promise.all([loadGuests(), loadGifts()]);
}
async function loadGuests() {
  try { const snap = await getDocs(query(collection(db, "guests"), orderBy("name"))); guests = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderGuests(); }
  catch (error) { console.error(error); $("#guest-table").innerHTML = '<tr><td colspan="5" class="error">Não foi possível carregar convidados.</td></tr>'; }
}
function renderGuests() {
  const filter = normalize($("#guest-filter").value); const rows = guests.filter(g => !filter || normalize(g.name).includes(filter) || normalize(g.phone).includes(filter));
  $("#guest-count").textContent = `${guests.length} convidado${guests.length === 1 ? "" : "s"}`; $("#confirmed-count").textContent = `${guests.filter(g => g.status === "confirmed").length} confirmados`;
  $("#guest-table").innerHTML = rows.length ? rows.map(g => `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.phone || "—")}</td><td>${escapeHtml(g.category || "Individual")}<br><small>${escapeHtml(g.inviteId || "—")}</small></td><td><span class="status ${g.status || "pending"}">${statusLabel(g.status)}</span></td><td><div class="row-actions"><button data-edit-guest="${g.id}">Editar</button><button data-delete-guest="${g.id}">Excluir</button></div></td></tr>`).join("") : '<tr><td colspan="5" class="loading">Nenhum convidado encontrado.</td></tr>';
  document.querySelectorAll("[data-edit-guest]").forEach(b => b.addEventListener("click", () => editGuest(b.dataset.editGuest))); document.querySelectorAll("[data-delete-guest]").forEach(b => b.addEventListener("click", () => removeGuest(b.dataset.deleteGuest)));
}
function familyMode() { return $("#guest-category").value === "Família"; }
function addFamilyMember(member = {}) {
  const row = document.createElement("div"); row.className = "family-member-row";
  row.innerHTML = `<label>Nome<input class="family-member-name" required maxlength="120" value="${escapeHtml(member.name || "")}" placeholder="Nome da pessoa" /></label><label>Telefone<input class="family-member-phone" required maxlength="30" value="${escapeHtml(member.phone || "")}" placeholder="(00) 00000-0000" /></label><button class="remove-member" type="button">Remover</button>`;
  row.querySelector(".remove-member").addEventListener("click", () => row.remove()); $("#family-member-list").append(row);
}
function updateFamilyForm() { const active = familyMode(); $("#family-members").hidden = !active; if (!active) $("#family-member-list").innerHTML = ""; }
function familyEntries() { return Array.from(document.querySelectorAll(".family-member-row")).map(row => ({ name: row.querySelector(".family-member-name").value.trim(), phone: row.querySelector(".family-member-phone").value.trim() })); }
function resetGuestForm() { $("#guest-form").reset(); $("#guest-id").value = ""; $("#family-member-list").innerHTML = ""; updateFamilyForm(); $("#guest-form-title").textContent = "Adicionar convidado"; $("#cancel-guest-edit").hidden = true; $("#guest-form-feedback").innerHTML = ""; }
function editGuest(id) {
  const g = guests.find(item => item.id === id); if (!g) return; $("#guest-id").value = id; $("#guest-name").value = g.name || ""; $("#guest-phone").value = g.phone || ""; $("#guest-category").value = g.category || "Individual"; $("#guest-invite-id").value = g.inviteId || ""; $("#guest-status").value = g.status || "pending"; $("#family-member-list").innerHTML = ""; updateFamilyForm();
  if (g.category === "Família" && g.inviteId) { const relatives = guests.filter(member => member.id !== g.id && member.inviteId === g.inviteId); relatives.forEach(addFamilyMember); $("#guest-form-title").textContent = `Editar família (${relatives.length + 1} pessoas)`; } else $("#guest-form-title").textContent = "Editar convidado";
  $("#cancel-guest-edit").hidden = false; $("#guest-form").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function saveGuest(event) {
  event.preventDefault(); const id = $("#guest-id").value; const name = $("#guest-name").value.trim(), phone = $("#guest-phone").value.trim(), category = $("#guest-category").value; const inviteId = $("#guest-invite-id").value.trim() || (category === "Individual" ? undefined : slug(name)); const status = $("#guest-status").value; const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
  try {
    if (category === "Família") {
      const members = [{ name, phone }, ...familyEntries()]; if (members.some(member => !member.name || !member.phone)) throw new Error("Preencha nome e telefone de todas as pessoas da família.");
      const current = guests.find(guest => guest.id === id); const existing = current ? [current, ...(current.inviteId ? guests.filter(guest => guest.id !== id && guest.inviteId === current.inviteId) : [])] : [];
      const batch = writeBatch(db); members.forEach((member, index) => { const data = { name: member.name, phone: member.phone, category, inviteId, searchName: normalize(member.name), status: index === 0 ? status : (existing[index]?.status || "pending"), updatedAt: serverTimestamp() }; if (existing[index]) batch.update(doc(db, "guests", existing[index].id), data); else batch.set(doc(collection(db, "guests")), { ...data, createdAt: serverTimestamp() }); }); existing.slice(members.length).forEach(member => batch.delete(doc(db, "guests", member.id))); await batch.commit();
      feedback($("#guest-form-feedback"), `${members.length} pessoa(s) salvas no convite familiar.`, "success");
    } else { const data = { name, phone, category, status, searchName: normalize(name), ...(inviteId ? { inviteId } : {}), updatedAt: serverTimestamp() }; if (id) await updateDoc(doc(db, "guests", id), data); else await addDoc(collection(db, "guests"), { ...data, createdAt: serverTimestamp() }); feedback($("#guest-form-feedback"), id ? "Convidado atualizado." : "Convidado adicionado.", "success"); }
    await loadGuests(); setTimeout(resetGuestForm, 500);
  } catch (error) { console.error(error); feedback($("#guest-form-feedback"), error.message || "Não foi possível salvar o convidado."); } finally { button.disabled = false; }
}
async function removeGuest(id) { const guest = guests.find(g => g.id === id); if (!guest || !confirm(`Excluir ${guest.name}? Esta ação não pode ser desfeita.`)) return; try { await deleteDoc(doc(db, "guests", id)); await loadGuests(); } catch (error) { alert("Não foi possível excluir o convidado."); } }

async function loadGifts() { try { const snap = await getDocs(query(collection(db, "gifts"), orderBy("name"))); gifts = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderGifts(); } catch (error) { console.error(error); $("#gift-table").innerHTML = '<tr><td colspan="4" class="error">Não foi possível carregar presentes.</td></tr>'; } }
function renderGifts() { const filter = normalize($("#gift-filter").value); const rows = gifts.filter(g => !filter || normalize(g.name).includes(filter)); const available = gifts.filter(g => g.available).length; $("#gift-count").textContent = `${available} disponível${available === 1 ? "" : "is"}`; $("#reserved-count").textContent = `${gifts.filter(g => g.reservedBy).length} reservados`;
  $("#gift-table").innerHTML = rows.length ? rows.map(g => `<tr><td>${escapeHtml(g.name)}${g.description ? `<br><small>${escapeHtml(g.description)}</small>` : ""}</td><td><span class="status ${g.available ? "available" : "unavailable"}">${g.available ? "Disponível" : "Indisponível"}</span></td><td>${g.reservedBy ? `${escapeHtml(g.reservedBy.name)}<br><small>${escapeHtml(g.reservedBy.phone)}</small>` : "—"}</td><td><div class="row-actions"><button data-edit-gift="${g.id}">Editar</button><button data-delete-gift="${g.id}">Excluir</button></div></td></tr>`).join("") : '<tr><td colspan="4" class="loading">Nenhum presente encontrado.</td></tr>';
  document.querySelectorAll("[data-edit-gift]").forEach(b => b.addEventListener("click", () => editGift(b.dataset.editGift))); document.querySelectorAll("[data-delete-gift]").forEach(b => b.addEventListener("click", () => removeGift(b.dataset.deleteGift)));
}
function resetGiftForm() { $("#gift-form-admin").reset(); $("#gift-id").value = ""; $("#gift-form-title").textContent = "Adicionar presente"; $("#cancel-gift-edit").hidden = true; $("#gift-form-feedback").innerHTML = ""; }
function editGift(id) { const g = gifts.find(item => item.id === id); if (!g) return; $("#gift-id").value = id; $("#gift-name").value = g.name || ""; $("#gift-description").value = g.description || ""; $("#gift-available").value = String(Boolean(g.available)); $("#gift-form-title").textContent = "Editar presente"; $("#cancel-gift-edit").hidden = false; $("#gift-form-admin").scrollIntoView({ behavior: "smooth", block: "center" }); }
async function saveGift(event) { event.preventDefault(); const id = $("#gift-id").value, available = $("#gift-available").value === "true"; const data = { name: $("#gift-name").value.trim(), description: $("#gift-description").value.trim(), available, updatedAt: serverTimestamp() }; const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; try { if (id) await updateDoc(doc(db, "gifts", id), data); else await addDoc(collection(db, "gifts"), { ...data, createdAt: serverTimestamp() }); feedback($("#gift-form-feedback"), id ? "Presente atualizado." : "Presente adicionado.", "success"); await loadGifts(); setTimeout(resetGiftForm, 500); } catch (error) { console.error(error); feedback($("#gift-form-feedback"), "Não foi possível salvar o presente."); } finally { button.disabled = false; } }
async function removeGift(id) { const gift = gifts.find(g => g.id === id); if (!gift || !confirm(`Excluir o presente “${gift.name}”? Esta ação não pode ser desfeita.`)) return; try { await deleteDoc(doc(db, "gifts", id)); await loadGifts(); } catch (error) { alert("Não foi possível excluir o presente."); } }

function rowValue(row, names) { const keys = Object.keys(row); const key = keys.find(k => names.includes(normalize(k))); return key ? String(row[key] ?? "").trim() : ""; }
async function importGuests(file) { const target = $("#guest-import-feedback"); if (!file) return; feedback(target, "Lendo planilha…", "notice"); try { const buffer = await file.arrayBuffer(), workbook = XLSX.read(buffer, { type: "array" }), rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }); const valid = rows.map(row => ({ name: rowValue(row, ["nome", "name"]), phone: rowValue(row, ["telefone", "phone", "celular"]), category: rowValue(row, ["categoria", "tipo", "category"]) || "Individual", inviteId: rowValue(row, ["convite", "invite", "grupo", "familia"]), status: "pending" })).filter(row => row.name && row.phone); if (!valid.length) throw new Error("Nenhuma linha válida. Confira as colunas nome e telefone."); const batch = writeBatch(db); valid.forEach(row => { const ref = doc(collection(db, "guests")); batch.set(ref, { ...row, searchName: normalize(row.name), inviteId: row.inviteId || (row.category === "Individual" ? undefined : slug(row.name)), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }); await batch.commit(); feedback(target, `${valid.length} convidado(s) importado(s) com sucesso.`, "success"); await loadGuests(); } catch (error) { console.error(error); feedback(target, error.message || "Não foi possível importar a planilha."); } finally { $("#guest-import").value = ""; } }
async function importGifts(file) { const target = $("#gift-import-feedback"); if (!file) return; feedback(target, "Lendo planilha…", "notice"); try { const buffer = await file.arrayBuffer(), workbook = XLSX.read(buffer, { type: "array" }), rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }); const valid = rows.map(row => ({ name: rowValue(row, ["nome", "name", "presente"]), description: rowValue(row, ["descricao", "descrição", "description"]) })).filter(row => row.name); if (!valid.length) throw new Error("Nenhuma linha válida. Confira a coluna nome."); const batch = writeBatch(db); valid.forEach(row => batch.set(doc(collection(db, "gifts")), { ...row, available: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); await batch.commit(); feedback(target, `${valid.length} presente(s) importado(s) com sucesso.`, "success"); await loadGifts(); } catch (error) { console.error(error); feedback(target, error.message || "Não foi possível importar a planilha."); } finally { $("#gift-import").value = ""; } }

function setupEvents() { $("#login-form").addEventListener("submit", async e => { e.preventDefault(); if (!configured) return feedback($("#login-feedback"), "Configure o Firebase no arquivo firebase-config.js antes de entrar."); const button = e.currentTarget.querySelector("button"); button.disabled = true; try { await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-password").value); } catch (error) { feedback($("#login-feedback"), "Não foi possível entrar. Verifique e-mail e senha."); } finally { button.disabled = false; } });
  $("#logout").addEventListener("click", () => signOut(auth)); document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".tab").forEach(t => { t.classList.toggle("active", t === button); t.setAttribute("aria-selected", t === button); }); $("#guests-panel").hidden = button.dataset.tab !== "guests"; $("#gifts-panel").hidden = button.dataset.tab !== "gifts"; }));
  $("#guest-form").addEventListener("submit", saveGuest); $("#guest-category").addEventListener("change", updateFamilyForm); $("#add-family-member").addEventListener("click", () => addFamilyMember()); $("#cancel-guest-edit").addEventListener("click", resetGuestForm); $("#guest-filter").addEventListener("input", renderGuests); $("#refresh-guests").addEventListener("click", loadGuests); $("#guest-import").addEventListener("change", e => importGuests(e.target.files[0]));
  $("#gift-form-admin").addEventListener("submit", saveGift); $("#cancel-gift-edit").addEventListener("click", resetGiftForm); $("#gift-filter").addEventListener("input", renderGifts); $("#refresh-gifts").addEventListener("click", loadGifts); $("#gift-import").addEventListener("change", e => importGifts(e.target.files[0]));
}
setupEvents();
if (!configured) showLogin("Antes de usar, siga os passos do README para conectar seu projeto Firebase."); else onAuthStateChanged(auth, user => user ? showDashboard(user) : showLogin());
