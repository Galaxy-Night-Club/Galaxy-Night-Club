import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
getAuth,
onAuthStateChanged,
signInWithEmailAndPassword,
signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
addDoc,
collection,
deleteDoc,
doc,
getFirestore,
onSnapshot,
orderBy,
query,
serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const defaultUsers = [
{ username: "adrian", email: "adrian@galaxy-night-club.com", password: "galaxyboss", role: "boss", department: "all", displayName: "Adrian" },
{ username: "grace", email: "grace@galaxy-night-club.com", password: "barboss", role: "manager", department: "bar", displayName: "Grace" },
{ username: "logan", email: "logan@galaxy-night-club.com", password: "secureboss", role: "manager", department: "security", displayName: "Logan" }
];

const storageKeys = {
users: "galaxyUsers",
session: "galaxyCurrentUser",
pointages: "galaxyPointages"
};

const departments = { bar: "Bar", security: "Securite", all: "Tous les poles" };
const statuses = { absent: "Absent", "en-service": "En service", "fin-service": "Fin de service" };
const adminUsernames = ["adrian", "grace", "logan"];

// Remplace ces valeurs par celles de ton projet Firebase.
const firebaseConfig = {
apiKey: "AIzaSyBKQtA5VlhzCuWuoVYpC2Xb61Pxc0j7eC8",
authDomain: "galaxy-night-club.firebaseapp.com",
projectId: "galaxy-night-club",
storageBucket: "galaxy-night-club.firebasestorage.app",
messagingSenderId: "755999399930",
appId: "1:755999399930:web:0c48a329e31a3c11228e43"
};

let currentUser = null;
let editingUsername = null;
let firebaseEnabled = false;
let db = null;
let auth = null;
let firestoreAvailable = false;
let pointagesCache = [];
let unsubscribePointages = null;
let firebaseStatusMessage = "";

function makeId(){
return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getPhotoStorageKey(slot){
return "galaxyPhoto_" + slot;
}

function getSectionStorageKey(sectionId){
return "galaxySection_" + sectionId;
}

function hasFirebaseConfig(){
return Object.values(firebaseConfig).every((value)=> typeof value === "string" && value.trim() !== "");
}

function initFirebase(){
if(!hasFirebaseConfig()){
return;
}

try{
const app = initializeApp(firebaseConfig);
db = getFirestore(app);
auth = getAuth(app);
firebaseEnabled = true;
firebaseStatusMessage = "Firebase configure. Synchronisation en ligne active si Firestore accepte les acces.";
} catch (error){
firebaseEnabled = false;
firebaseStatusMessage = "Firebase n'a pas pu s'initialiser.";
console.error("Firebase init error:", error);
}
}

function seedUsers(){
const existingUsers = JSON.parse(localStorage.getItem(storageKeys.users) || "[]");

if(!existingUsers.length){
localStorage.setItem(storageKeys.users, JSON.stringify(defaultUsers));
return;
}

const systemUsernames = defaultUsers.map((user)=> user.username);
const preservedCustomUsers = existingUsers.filter((user)=> !systemUsernames.includes(user.username) && user.username !== "patron" && user.username !== "luna" && user.username !== "neo");
const mergedUsers = [...defaultUsers, ...preservedCustomUsers];

localStorage.setItem(storageKeys.users, JSON.stringify(mergedUsers));
}

function seedPointages(){
if(firebaseEnabled || localStorage.getItem(storageKeys.pointages)){ return; }
const demoPointages = [
{ id: makeId(), nom: "Grace", entree: "17:30", sortie: "02:15", savedAt: "2026-03-22 17:35", createdBy: "grace", department: "bar", status: "en-service" },
{ id: makeId(), nom: "Logan", entree: "18:30", sortie: "03:00", savedAt: "2026-03-22 18:32", createdBy: "logan", department: "security", status: "fin-service" }
];
localStorage.setItem(storageKeys.pointages, JSON.stringify(demoPointages));
pointagesCache = demoPointages;
}

function getUsers(){ return JSON.parse(localStorage.getItem(storageKeys.users) || "[]"); }
function setUsers(users){ localStorage.setItem(storageKeys.users, JSON.stringify(users)); }

function getPointages(){
if(firestoreAvailable){
return pointagesCache;
}
return JSON.parse(localStorage.getItem(storageKeys.pointages) || "[]");
}

function canUseFirestoreWrites(){
return firebaseEnabled && db && auth && auth.currentUser;
}

function setLocalPointages(pointages){
localStorage.setItem(storageKeys.pointages, JSON.stringify(pointages));
pointagesCache = pointages;
}

function getEmailLocalPart(email){
return (email || "").trim().toLowerCase().split("@")[0];
}

function getUserEmail(user){
return user.email || (user.username + "@galaxy-night-club.com");
}

function getDepartmentLabel(department){ return departments[department] || department; }
function getStatusLabel(status){ return statuses[status] || status; }

function hasAdminAccess(){
if(!currentUser){
return false;
}

const username = (currentUser.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(currentUser.email || "");
return currentUser.role === "boss" || currentUser.role === "manager" || adminUsernames.includes(username) || adminUsernames.includes(emailLocalPart);
}

function canManageAll(){ return hasAdminAccess(); }
function canManageStaff(){ return hasAdminAccess(); }

function openPhotoPicker(slot){
const input = document.getElementById("photo-input-" + slot);
if(input){
input.click();
}
}

function handlePhotoUpload(slot, event){
const file = event.target.files && event.target.files[0];

if(!file){
return;
}

const reader = new FileReader();
reader.onload = () => {
const imageUrl = reader.result;
localStorage.setItem(getPhotoStorageKey(slot), imageUrl);
const image = document.getElementById("photo-" + slot);
if(image){
image.src = imageUrl;
}
};
reader.readAsDataURL(file);
}

function loadSavedPhotos(){
["adrian", "grace", "logan"].forEach((slot)=>{
const savedPhoto = localStorage.getItem(getPhotoStorageKey(slot));
const image = document.getElementById("photo-" + slot);
if(savedPhoto && image){
image.src = savedPhoto;
}
});
}

function saveSectionContent(sectionId){
const field = document.getElementById(sectionId);
if(!field){
return;
}

localStorage.setItem(getSectionStorageKey(sectionId), field.value);
}

function loadSavedSections(){
[
"adrian_infosContent", "adrian_numerosContent", "adrian_modifsContent", "adrian_absencesContent", "adrian_soireesContent", "adrian_accesContent",
"grace_infosContent", "grace_numerosContent", "grace_modifsContent", "grace_absencesContent", "grace_soireesContent", "grace_accesContent",
"logan_infosContent", "logan_numerosContent", "logan_modifsContent", "logan_absencesContent", "logan_soireesContent", "logan_accesContent"
].forEach((sectionId)=>{
const field = document.getElementById(sectionId);
const savedValue = localStorage.getItem(getSectionStorageKey(sectionId));
if(field && savedValue !== null){
field.value = savedValue;
}
});
}

function canManageUser(targetUser){
if(!targetUser){ return false; }
if(canManageAll()){ return targetUser.role !== "boss"; }
return false;
}

function isUserVisibleToCurrentUser(user){
if(canManageAll()){ return true; }
return user.username === currentUser.username;
}

function isPointageVisibleToCurrentUser(pointage){
if(canManageAll()){ return true; }
return pointage.createdBy === currentUser.username;
}

function subscribePointages(){
if(!firebaseEnabled || unsubscribePointages){
return;
}

const pointagesQuery = query(collection(db, "pointages"), orderBy("savedAtTs", "desc"));
unsubscribePointages = onSnapshot(pointagesQuery, (snapshot)=>{
firestoreAvailable = true;
pointagesCache = snapshot.docs.map((entry)=>{
const data = entry.data();
return {
id: entry.id,
nom: data.nom || "",
entree: data.entree || "-",
sortie: data.sortie || "-",
savedAt: data.savedAt || "",
createdBy: data.createdBy || "",
department: data.department || "bar",
status: data.status || "en-service"
};
});

if(currentUser){
renderApp();
show("pointages");
}
}, (error)=>{
firestoreAvailable = false;
pointagesCache = JSON.parse(localStorage.getItem(storageKeys.pointages) || "[]");
firebaseStatusMessage = "Firestore indisponible. La pointeuse repasse en mode local.";
console.error("Firestore subscribe error:", error);
if(currentUser){
renderApp();
}
});
}

function getUserProfileFromEmail(email){
const loweredEmail = (email || "").trim().toLowerCase();
const localPart = getEmailLocalPart(loweredEmail);
return getUsers().find((entry)=> (entry.email && entry.email.toLowerCase() === loweredEmail) || entry.username === localPart) || null;
}

async function login(event){
if(event){
event.preventDefault();
}
const email = document.getElementById("username").value.trim().toLowerCase();
const password = document.getElementById("password").value.trim();
const loginMsg = document.getElementById("loginMsg");

if(!firebaseEnabled || !auth){
loginMsg.className = "status-msg error";
loginMsg.innerText = "Firebase Auth n'est pas configure.";
return;
}

try{
const credential = await signInWithEmailAndPassword(auth, email, password);
const profile = getUserProfileFromEmail(credential.user.email);

if(!profile){
await signOut(auth);
loginMsg.className = "status-msg error";
loginMsg.innerText = "Compte Firebase ok, mais profil staff introuvable.";
return;
}

currentUser = profile;
localStorage.setItem(storageKeys.session, JSON.stringify(profile));
loginMsg.className = "status-msg success";
loginMsg.innerText = "Connexion reussie.";
subscribePointages();
renderApp();
} catch (error){
console.error("Firebase Auth login error:", error);
loginMsg.className = "status-msg error";
loginMsg.innerText = "Connexion Firebase impossible. Verifie email, mot de passe ou Auth.";
}
}

async function logout(){
currentUser = null;
editingUsername = null;
localStorage.removeItem(storageKeys.session);
if(firebaseEnabled && auth && auth.currentUser){
try{
await signOut(auth);
} catch (error){
console.error("Firebase Auth logout error:", error);
}
}
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
document.getElementById("loginMsg").innerText = "";
document.getElementById("password").value = "";
}

function restoreSession(){
if(firebaseEnabled && auth){
onAuthStateChanged(auth, (user)=>{
if(!user){
currentUser = null;
localStorage.removeItem(storageKeys.session);
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
return;
}

const profile = getUserProfileFromEmail(user.email);
if(!profile){
currentUser = null;
localStorage.removeItem(storageKeys.session);
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
return;
}

currentUser = profile;
localStorage.setItem(storageKeys.session, JSON.stringify(profile));
subscribePointages();
renderApp();
});
return;
}

const savedUser = localStorage.getItem(storageKeys.session);
if(!savedUser){ return; }
currentUser = JSON.parse(savedUser);
renderApp();
}

function getScopeUsers(){ return getUsers().filter((user)=> isUserVisibleToCurrentUser(user)); }
function getVisiblePointages(){ return getPointages().filter((pointage)=> isPointageVisibleToCurrentUser(pointage)); }

function getRoleLabel(user){
if(user.role === "boss"){ return "Patron"; }
if(user.role === "manager"){ return "Responsable"; }
return "Staff";
}

function updatePointageFormState(){
const nameInput = document.getElementById("nom");
if(currentUser.role === "staff"){
nameInput.value = currentUser.displayName;
nameInput.readOnly = true;
nameInput.placeholder = currentUser.displayName;
return;
}
nameInput.readOnly = false;
nameInput.placeholder = "Nom du membre du staff";
nameInput.value = "";
}

function renderApp(){
const scopeUsers = getScopeUsers();
const isBoss = currentUser.role === "boss";
const isManager = currentUser.role === "manager";
document.getElementById("loginScreen").classList.add("hidden");
document.getElementById("appShell").classList.remove("hidden");
document.getElementById("welcomeText").innerText = "Salut " + currentUser.displayName;
document.getElementById("dashboardText").innerText = isBoss ? "Tu es connecte comme patron. Tu controles le bar, la securite et toute l'organisation." : isManager ? "Tu es connecte comme responsable avec le meme acces complet que le patron." : "Tu es connecte comme membre du staff. Ton espace est limite a ton compte.";
document.getElementById("pointageHint").innerText = canUseFirestoreWrites() ? (firebaseStatusMessage || "Connexion Firebase active. Les pointages essaient de se synchroniser en ligne.") : (firebaseStatusMessage || "Mode local actif. La pointeuse enregistre sur cet appareil.");
document.getElementById("pointagesNav").classList.remove("hidden");
document.getElementById("staffNav").classList.toggle("hidden", !canManageStaff());
document.getElementById("pointagesTitle").innerText = canManageAll() ? "Tous les pointages" : "Mes pointages";
document.getElementById("pointagesText").innerText = canManageAll() ? "Tu vois ici tous les pointages du club." : "Tu vois ici uniquement tes propres pointages.";
document.getElementById("staffPageText").innerText = canManageAll() ? "Tu peux creer, modifier ou supprimer n'importe quel compte hors patron." : "Tu peux creer et gerer uniquement les comptes lies a ton acces.";
document.getElementById("staffScopePanel").innerText = canManageAll() ? "Tu peux attribuer un role et un secteur a chaque compte." : "Tu peux gerer uniquement les comptes rattaches a ton acces.";
if(!canManageAll()){ document.getElementById("newRole").value = "staff"; }
document.getElementById("newDepartment").value = canManageAll() ? "bar" : currentUser.department;
document.getElementById("newDepartment").disabled = !canManageAll();
document.getElementById("filterDepartment").disabled = !canManageAll();
document.getElementById("filterDepartmentWrap").classList.toggle("hidden", !canManageAll());
document.getElementById("filterDepartment").value = "";
renderHierarchyDetails();
updatePointageFormState();
renderPointages();
if(canManageStaff()){ renderStaffList(); }
resetStaffForm(false);
show("dashboard");
document.querySelectorAll(".person-detail-panel").forEach((panel)=>{
panel.classList.add("hidden");
});
document.querySelectorAll(".tiny-person-card").forEach((card)=>{
card.classList.remove("active-person-card");
});
}

function showPersonPanel(person){
document.querySelectorAll(".person-detail-panel").forEach((panel)=>{
panel.classList.add("hidden");
});
document.querySelectorAll(".tiny-person-card").forEach((card)=>{
card.classList.toggle("active-person-card", card.dataset.person === person);
});
const target = document.getElementById("person-panel-" + person);
if(target){
target.classList.remove("hidden");
}
}

function show(page){
document.querySelectorAll(".page").forEach((section)=>{ section.style.display = "none"; });
document.querySelectorAll(".nav-btn").forEach((button)=>{ button.classList.toggle("active", button.dataset.page === page); });
document.getElementById(page).style.display = "block";
if(page === "pointages"){ renderPointages(); }
if(page === "staff" && canManageStaff()){ renderStaffList(); }
if(page === "hierarchie"){ renderHierarchyDetails(); }
}

function findUserByName(name){
return getUsers().find((user)=> user.displayName.toLowerCase() === name.toLowerCase());
}

async function savePointage(){
if(!currentUser){ return; }
const nameInput = document.getElementById("nom");
const entree = document.getElementById("heure-entree").value;
const sortie = document.getElementById("heure-sortie").value;
const status = document.getElementById("pointageStatus").value;
const message = document.getElementById("saveMsg");
const nom = currentUser.role === "staff" ? currentUser.displayName : nameInput.value.trim();
if(!nom){
message.innerText = "Merci de choisir un membre du staff.";
return;
}
if(status !== "absent" && !entree){
message.innerText = "Merci de renseigner une heure d'arrivee.";
return;
}
const targetUser = findUserByName(nom);
if(!targetUser){
message.innerText = "Ce membre n'existe pas dans le staff.";
return;
}
if(currentUser.role === "staff" && targetUser.username !== currentUser.username){
message.innerText = "Tu ne peux pointer que ton propre compte.";
return;
}

const payload = {
nom: targetUser.displayName,
entree: status === "absent" ? "-" : entree,
sortie: sortie || "-",
savedAt: new Date().toLocaleString("fr-FR"),
createdBy: targetUser.username,
department: targetUser.department,
status: status
};

try{
if(canUseFirestoreWrites()){
await addDoc(collection(db, "pointages"), {
...payload,
savedAtTs: serverTimestamp()
});
firestoreAvailable = true;
firebaseStatusMessage = "Pointages sauvegardes sur Firebase.";
} else {
const pointages = getPointages();
pointages.unshift({
id: makeId(),
...payload
});
setLocalPointages(pointages);
}
} catch (error){
console.error("Save pointage error:", error);
const pointages = JSON.parse(localStorage.getItem(storageKeys.pointages) || "[]");
pointages.unshift({
id: makeId(),
...payload
});
setLocalPointages(pointages);
firestoreAvailable = false;
firebaseStatusMessage = "Firebase a bloque l'ecriture. La pointeuse a enregistre en local.";
}

message.innerText = "Pointage enregistre pour " + targetUser.displayName + ".";
document.getElementById("heure-entree").value = "";
document.getElementById("heure-sortie").value = "";
document.getElementById("pointageStatus").value = "en-service";
updatePointageFormState();
renderApp();
show("pointage");
}

function getFilteredPointages(){
const nameFilter = document.getElementById("filterEmployee").value.trim().toLowerCase();
const departmentFilter = document.getElementById("filterDepartment").value;
const statusFilter = document.getElementById("filterStatus").value;
return getVisiblePointages().filter((item)=>{
const matchesName = !nameFilter || item.nom.toLowerCase().includes(nameFilter);
const matchesDepartment = !departmentFilter || item.department === departmentFilter;
const matchesStatus = !statusFilter || item.status === statusFilter;
return matchesName && matchesDepartment && matchesStatus;
});
}

function canDeletePointage(pointage){
if(canManageAll()){ return true; }
return pointage.createdBy === currentUser.username;
}

function renderPointages(){
const container = document.getElementById("pointagesList");
const visiblePointages = getFilteredPointages();
if(!visiblePointages.length){
container.innerHTML = "<div class='pointage-item'><strong>Aucun pointage</strong><div class='pointage-meta'>Aucun enregistrement disponible dans ton perimetre.</div></div>";
return;
}
container.innerHTML = visiblePointages.map((item)=>{
const deleteBtn = canDeletePointage(item) ? "<button class='danger-btn' onclick=\"deletePointage('" + item.id + "')\">Supprimer</button>" : "";
return "<div class='pointage-item'><span class='dept-badge'>" + getDepartmentLabel(item.department) + "</span> <span class='status-badge " + item.status + "'>" + getStatusLabel(item.status) + "</span><strong>" + item.nom + "</strong><div class='pointage-meta'>Arrivee : " + item.entree + "<br>Sortie : " + item.sortie + "<br>Enregistre le : " + item.savedAt + "</div><div class='staff-actions'>" + deleteBtn + "</div></div>";
}).join("");
}

async function deletePointage(id){
const pointage = getPointages().find((item)=> item.id === id);
if(!pointage || !canDeletePointage(pointage)){ return; }

try{
if(canUseFirestoreWrites()){
await deleteDoc(doc(db, "pointages", id));
} else {
setLocalPointages(getPointages().filter((item)=> item.id !== id));
}
} catch (error){
console.error("Delete pointage error:", error);
setLocalPointages(getPointages().filter((item)=> item.id !== id));
firestoreAvailable = false;
firebaseStatusMessage = "Firestore a bloque la suppression. Le retrait a ete fait en local.";
}

renderApp();
show("pointages");
}

function submitStaffForm(){
if(editingUsername){ updateStaff(); return; }
addStaff();
}

function addStaff(){
if(!canManageStaff()){ return; }
const displayNameInput = document.getElementById("newDisplayName");
const emailInput = document.getElementById("newEmail");
const passwordInput = document.getElementById("newPassword");
const roleInput = document.getElementById("newRole");
const departmentInput = document.getElementById("newDepartment");
const message = document.getElementById("staffMsg");
const displayName = displayNameInput.value.trim();
const email = emailInput.value.trim().toLowerCase();
const username = getEmailLocalPart(email);
const password = passwordInput.value.trim();
const role = canManageAll() ? roleInput.value : "staff";
const department = canManageAll() ? departmentInput.value : currentUser.department;
if(!displayName || !email || !password){
message.innerText = "Merci de remplir tous les champs du nouveau compte.";
return;
}
const users = getUsers();
if(users.some((user)=> user.username === username || (user.email && user.email.toLowerCase() === email))){
message.innerText = "Cet email existe deja.";
return;
}
users.push({ username: username, email: email, password: password, role: role, department: department, displayName: displayName });
setUsers(users);
message.innerText = "Compte cree pour " + displayName + ".";
resetStaffForm(true);
renderApp();
show("staff");
}

function editStaff(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!canManageUser(targetUser)){ return; }
editingUsername = username;
document.getElementById("newDisplayName").value = targetUser.displayName;
document.getElementById("newEmail").value = getUserEmail(targetUser);
document.getElementById("newPassword").value = targetUser.password;
document.getElementById("newRole").value = canManageAll() ? targetUser.role : "staff";
document.getElementById("newDepartment").value = canManageAll() ? targetUser.department : currentUser.department;
document.getElementById("newEmail").readOnly = true;
document.getElementById("staffSubmitBtn").innerText = "Modifier le compte";
document.getElementById("staffCancelBtn").classList.remove("hidden");
document.getElementById("staffMsg").innerText = "Mode modification actif pour " + targetUser.displayName + ".";
}

function updateStaff(){
const users = getUsers();
const targetUser = users.find((user)=> user.username === editingUsername);
const message = document.getElementById("staffMsg");
if(!canManageUser(targetUser)){ return; }
const displayName = document.getElementById("newDisplayName").value.trim();
const email = document.getElementById("newEmail").value.trim().toLowerCase();
const password = document.getElementById("newPassword").value.trim();
const role = canManageAll() ? document.getElementById("newRole").value : "staff";
const department = canManageAll() ? document.getElementById("newDepartment").value : currentUser.department;
if(!displayName || !email || !password){
message.innerText = "Merci de remplir les champs obligatoires.";
return;
}
targetUser.displayName = displayName;
targetUser.email = email;
targetUser.password = password;
targetUser.role = role;
targetUser.department = department;
setUsers(users);

if(!firebaseEnabled){
setLocalPointages(getPointages().map((item)=> item.createdBy === targetUser.username ? { ...item, nom: displayName, department: department } : item));
}

if(currentUser.username === targetUser.username){
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
}
message.innerText = "Compte modifie pour " + displayName + ".";
resetStaffForm(true);
renderApp();
show("staff");
}

function cancelEditStaff(){
resetStaffForm(true);
renderStaffList();
}

function resetStaffForm(clearMessage){
editingUsername = null;
document.getElementById("newDisplayName").value = "";
document.getElementById("newEmail").value = "";
document.getElementById("newPassword").value = "";
document.getElementById("newEmail").readOnly = false;
document.getElementById("newRole").value = "staff";
document.getElementById("newDepartment").value = canManageAll() ? "bar" : currentUser ? currentUser.department : "bar";
document.getElementById("staffSubmitBtn").innerText = "Ajouter le compte";
document.getElementById("staffCancelBtn").classList.add("hidden");
if(clearMessage){ document.getElementById("staffMsg").innerText = ""; }
}

function deleteStaff(username){
const users = getUsers();
const targetUser = users.find((user)=> user.username === username);
if(!canManageUser(targetUser)){ return; }
setUsers(users.filter((user)=> user.username !== username));

if(!firebaseEnabled){
setLocalPointages(getPointages().filter((item)=> item.createdBy !== username));
}

document.getElementById("staffMsg").innerText = "Compte supprime.";
resetStaffForm(false);
renderApp();
show("staff");
}

function renderStaffList(){
const container = document.getElementById("staffList");
const visibleUsers = getScopeUsers().filter((user)=> user.role !== "boss");
if(!visibleUsers.length){
container.innerHTML = "<div class='staff-item'><strong>Aucun employe</strong><div class='staff-meta'>Aucun compte visible dans ton perimetre.</div></div>";
return;
}
container.innerHTML = visibleUsers.map((user)=>{
const editButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"editStaff('" + user.username + "')\">Modifier</button>" : "";
const deleteButton = canManageUser(user) ? "<button class='danger-btn' onclick=\"deleteStaff('" + user.username + "')\">Supprimer</button>" : "";
return "<div class='staff-item'><span class='dept-badge'>" + getDepartmentLabel(user.department) + "</span><strong>" + user.displayName + "</strong><div class='staff-meta'>Email : " + getUserEmail(user) + "<br>Role : " + getRoleLabel(user) + "</div><div class='staff-actions'>" + editButton + deleteButton + "</div></div>";
}).join("");
}

function renderHierarchyDetails(){
const container = document.getElementById("hierarchieDetails");
const users = getUsers().filter((user)=> user.role !== "boss");
container.innerHTML = users.map((user)=> "<div class='hierarchy-item'><span class='dept-badge'>" + getDepartmentLabel(user.department) + "</span><strong>" + user.displayName + "</strong><div class='staff-meta'>Role : " + getRoleLabel(user) + "<br>Email : " + getUserEmail(user) + "</div></div>").join("");
}

initFirebase();
seedUsers();
seedPointages();
subscribePointages();
restoreSession();
loadSavedPhotos();
loadSavedSections();

Object.assign(window, {
login,
logout,
show,
savePointage,
deletePointage,
submitStaffForm,
cancelEditStaff,
editStaff,
deleteStaff,
openPhotoPicker,
handlePhotoUpload,
saveSectionContent,
showPersonPanel
});
