const defaultUsers = [
{ username: "adrian", email: "adrian@galaxynightclub.com", password: "galaxyboss", role: "boss", department: "all", displayName: "Adrian", active: true, mustChangePassword: false, dateJoined: "2026-03-22" },
{ username: "grace", email: "grace@galaxynightclub.com", password: "barboss", role: "responsable", department: "bar", displayName: "Grace", active: true, mustChangePassword: false, dateJoined: "2026-03-22" },
{ username: "logan", email: "logan@galaxynightclub.com", password: "secureboss", role: "responsable", department: "security", displayName: "Logan", active: true, mustChangePassword: false, dateJoined: "2026-03-22" }
];

const storageKeys = {
users: "galaxyUsers",
session: "galaxyCurrentUser",
pointages: "galaxyPointages",
theme: "galaxyTheme",
planning: "galaxyPlanning",
presence: "galaxyPresence",
announcements: "galaxyAnnouncements",
announcementReads: "galaxyAnnouncementReads",
logs: "galaxyAdminLogs",
archivedStaff: "galaxyArchivedStaff",
archivedPointages: "galaxyArchivedPointages",
archivedNotes: "galaxyArchivedNotes",
sharedSections: "galaxySharedSections",
requests: "galaxyInternalRequests",
notifications: "galaxyNotifications",
trainings: "galaxyTrainingRequests",
materials: "galaxyMaterialTracking",
checklists: "galaxyChecklistTracking",
contacts: "galaxyEmergencyContacts"
};

const departments = { bar: "Bar", security: "Securite", dj: "DJ", dance: "Danseur / danseuse", all: "Tous les poles" };
const statuses = { absent: "Absent", "en-service": "En service", "fin-service": "Fin de service" };
const adminUsernames = ["adrian", "grace", "logan"];
const formationLabels = {
secourisme_ems: "Secourisme (EMS)",
manager: "Manager",
accueil_vip: "Accueil VIP",
autre: "Autre"
};
const cloudinaryConfig = {
cloudName: "dr4heoups",
uploadPreset: "galaxy_unsigned"
};
const sharedDataKeys = {
requests: "shared_requests_data",
notifications: "shared_notifications_data",
trainings: "shared_trainings_data",
materials: "shared_materials_data",
checklists: "shared_checklists_data",
contacts: "shared_contacts_data"
};
const checklistTemplates = {
bar: {
opening: ["Verifier le stock", "Preparer la caisse", "Nettoyer le comptoir"],
closing: ["Fermer la caisse", "Compter le stock sensible", "Nettoyer le bar"]
},
security: {
opening: ["Verifier les acces", "Tester les radios", "Brief equipe securite"],
closing: ["Faire la ronde finale", "Remonter les incidents", "Rendre le materiel securite"]
},
dj: {
opening: ["Verifier la regie", "Tester le son et les micros", "Valider la playlist du soir"],
closing: ["Couper et securiser le materiel", "Ranger la regie", "Signer le compte-rendu technique"]
},
dance: {
opening: ["Verifier la tenue", "Brief de scene", "Controle de la zone backstage"],
closing: ["Debrief de fin", "Verifier la zone backstage", "Signaler tout incident ou oubli"]
}
};

let currentUser = null;
let editingUsername = null;
let selectedPointageUser = null;
let editingPlanningId = null;
let editingAnnouncementId = null;
let currentPageId = "dashboard";
let planningViewMode = "week";
let latestCredentialsMessage = "";
let announcementReadsCache = [];
let presenceCache = [];
let presencePromptSessionDate = "";

function makeId(){
return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getSystemRoleOverride(username = "", email = ""){
const normalizedUsername = String(username || "").trim().toLowerCase();
const emailLocalPart = getEmailLocalPart(email || "");
if(normalizedUsername === "adrian" || emailLocalPart === "adrian"){
return "boss";
}
if(normalizedUsername === "grace" || emailLocalPart === "grace" || normalizedUsername === "logan" || emailLocalPart === "logan"){
return "responsable";
}
return "";
}

function getNormalizedRole(role, username = "", email = ""){
return getSystemRoleOverride(username, email) || role || "staff";
}

function getTodayDateInputValue(){
return new Date().toISOString().slice(0, 10);
}

function getFormationLabel(type){
return formationLabels[type] || type || "Formation";
}

function getStaffSectionFields(){
return ["infos", "numeros", "grade", "dateentree", "disponibilites", "sanctions"];
}

function getPhotoStorageKey(slot){
return "galaxyPhoto_" + slot;
}

function hasCloudinaryConfig(){
return Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
}

function getCloudinaryUploadUrl(){
return "https://api.cloudinary.com/v1_1/" + cloudinaryConfig.cloudName + "/image/upload";
}

function getFriendlyPhotoErrorMessage(error, fallbackMessage){
if(!error){
return fallbackMessage;
}
if(typeof error === "string"){
return error;
}
if(error.message){
return error.message;
}
return fallbackMessage;
}

function mergeSystemUserWithExisting(defaultUser, existingUser){
return normalizeLocalStaffProfile({
...defaultUser,
...(existingUser || {}),
username: (existingUser && existingUser.username) || defaultUser.username,
email: (existingUser && existingUser.email) || defaultUser.email,
password: existingUser && typeof existingUser.password === "string" ? existingUser.password : defaultUser.password,
role: getNormalizedRole((existingUser && existingUser.role) || defaultUser.role, (existingUser && existingUser.username) || defaultUser.username, (existingUser && existingUser.email) || defaultUser.email),
department: (existingUser && existingUser.department) || defaultUser.department,
displayName: (existingUser && existingUser.displayName) || defaultUser.displayName,
dateJoined: (existingUser && existingUser.dateJoined) || defaultUser.dateJoined,
active: existingUser ? existingUser.active !== false : defaultUser.active !== false,
mustChangePassword: existingUser ? existingUser.mustChangePassword === true : defaultUser.mustChangePassword === true,
firebaseUid: (existingUser && existingUser.firebaseUid) || "",
discordId: (existingUser && existingUser.discordId) || "",
photoUrl: (existingUser && existingUser.photoUrl) || "",
cardDescription: (existingUser && existingUser.cardDescription) || ""
});
}

function getSectionStorageKey(sectionId){
return "galaxySection_" + sectionId;
}

function getCardDescriptionStorageKey(slot){
return "galaxyCardDescription_" + slot;
}

function getPhotoSlots(){
const slots = new Set(["adrian", "grace", "logan"]);
getUsers().forEach((user)=>{
if(user.username){
slots.add(user.username);
}
});
return Array.from(slots);
}

function applyTheme(theme){
const resolvedTheme = theme === "dark" ? "dark" : "light";
document.body.dataset.theme = resolvedTheme;
const lightButton = document.getElementById("themeLightBtn");
const darkButton = document.getElementById("themeDarkBtn");
if(lightButton){
lightButton.classList.toggle("active-theme", resolvedTheme === "light");
}
if(darkButton){
darkButton.classList.toggle("active-theme", resolvedTheme === "dark");
}
}

function restoreTheme(){
applyTheme(localStorage.getItem(storageKeys.theme) || "light");
}

function changeTheme(theme){
const nextTheme = theme === "dark" ? "dark" : "light";
localStorage.setItem(storageKeys.theme, nextTheme);
applyTheme(nextTheme);
}

function seedUsers(){
const existingUsers = JSON.parse(localStorage.getItem(storageKeys.users) || "[]");

if(!existingUsers.length){
localStorage.setItem(storageKeys.users, JSON.stringify(defaultUsers.map((user)=> normalizeLocalStaffProfile(user))));
return;
}

const systemUsernames = defaultUsers.map((user)=> user.username);
const existingUserMap = new Map(existingUsers.map((user)=> [user.username, user]));
const mergedSystemUsers = defaultUsers.map((user)=> mergeSystemUserWithExisting(user, existingUserMap.get(user.username)));
const preservedCustomUsers = existingUsers
.filter((user)=> !systemUsernames.includes(user.username) && user.username !== "patron" && user.username !== "luna" && user.username !== "neo")
.map((user)=> normalizeLocalStaffProfile(user));
localStorage.setItem(storageKeys.users, JSON.stringify([...mergedSystemUsers, ...preservedCustomUsers]));
}

function seedPointages(){
if(localStorage.getItem(storageKeys.pointages)){ return; }
const demoPointages = [
{ id: makeId(), nom: "Grace", entree: "17:30", sortie: "02:15", savedAt: "26/03/2026 17:35", createdBy: "grace", department: "bar", status: "en-service" },
{ id: makeId(), nom: "Logan", entree: "18:30", sortie: "03:00", savedAt: "26/03/2026 18:32", createdBy: "logan", department: "security", status: "fin-service" }
];
localStorage.setItem(storageKeys.pointages, JSON.stringify(demoPointages));
}

function getUsers(){ return JSON.parse(localStorage.getItem(storageKeys.users) || "[]"); }
function setUsers(users){ localStorage.setItem(storageKeys.users, JSON.stringify(users)); }
function getPointages(){ return JSON.parse(localStorage.getItem(storageKeys.pointages) || "[]"); }
function setPointages(pointages){ localStorage.setItem(storageKeys.pointages, JSON.stringify(pointages)); }
function getLocalCollection(key){ return JSON.parse(localStorage.getItem(key) || "[]"); }
function setLocalCollection(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function getPlanningEntries(){ return getLocalCollection(storageKeys.planning); }
function setPlanningEntries(entries){ setLocalCollection(storageKeys.planning, entries); }
function getPresenceEntries(){ return presenceCache.length ? presenceCache : getLocalCollection(storageKeys.presence); }
function setPresenceEntries(entries){ presenceCache = sortByDateField(entries, "date"); setLocalCollection(storageKeys.presence, presenceCache); }
function getAnnouncements(){ return getLocalCollection(storageKeys.announcements); }
function setAnnouncements(entries){ setLocalCollection(storageKeys.announcements, entries); }
function getAnnouncementReads(){ return announcementReadsCache.length ? announcementReadsCache : getLocalCollection(storageKeys.announcementReads); }
function setAnnouncementReads(entries){ announcementReadsCache = sortByDateField(entries, "readAt"); setLocalCollection(storageKeys.announcementReads, announcementReadsCache); }
function getAdminLogs(){ return getLocalCollection(storageKeys.logs); }
function setAdminLogs(entries){ setLocalCollection(storageKeys.logs, entries); }
function getArchivedStaff(){ return getLocalCollection(storageKeys.archivedStaff); }
function setArchivedStaff(entries){ setLocalCollection(storageKeys.archivedStaff, entries); }
function getArchivedPointages(){ return getLocalCollection(storageKeys.archivedPointages); }
function setArchivedPointages(entries){ setLocalCollection(storageKeys.archivedPointages, entries); }
function getArchivedNotes(){ return getLocalCollection(storageKeys.archivedNotes); }
function setArchivedNotes(entries){ setLocalCollection(storageKeys.archivedNotes, entries); }
function getSharedSectionValue(sectionId){
const sections = JSON.parse(localStorage.getItem(storageKeys.sharedSections) || "{}");
return sections[sectionId];
}
function setSharedSectionValue(sectionId, value){
const sections = JSON.parse(localStorage.getItem(storageKeys.sharedSections) || "{}");
sections[sectionId] = value;
localStorage.setItem(storageKeys.sharedSections, JSON.stringify(sections));
}

function getSharedJsonData(sectionId, storageKey, fallbackValue){
const rawValue = getSharedSectionValue(sectionId) ?? localStorage.getItem(storageKey);
if(!rawValue){
return fallbackValue;
}
try{
return JSON.parse(rawValue);
} catch (error){
console.error("Shared JSON parse error:", sectionId, error);
return fallbackValue;
}
}

async function saveSharedJsonData(sectionId, storageKey, value){
const rawValue = JSON.stringify(value);
localStorage.setItem(storageKey, rawValue);
setSharedSectionValue(sectionId, rawValue);
}

function getInternalRequests(){ return sortByDateField(getSharedJsonData(sharedDataKeys.requests, storageKeys.requests, []), "createdAt"); }
async function saveInternalRequests(entries){ await saveSharedJsonData(sharedDataKeys.requests, storageKeys.requests, sortByDateField(entries, "createdAt")); }
function getNotifications(){ return sortByDateField(getSharedJsonData(sharedDataKeys.notifications, storageKeys.notifications, []), "createdAt"); }
async function saveNotifications(entries){ await saveSharedJsonData(sharedDataKeys.notifications, storageKeys.notifications, sortByDateField(entries, "createdAt")); }
function getTrainingRequests(){ return sortByDateField(getSharedJsonData(sharedDataKeys.trainings, storageKeys.trainings, []), "createdAt"); }
async function saveTrainingRequests(entries){ await saveSharedJsonData(sharedDataKeys.trainings, storageKeys.trainings, sortByDateField(entries, "createdAt")); }
function getMaterialTracking(){ return getSharedJsonData(sharedDataKeys.materials, storageKeys.materials, []); }
async function saveMaterialTracking(entries){ await saveSharedJsonData(sharedDataKeys.materials, storageKeys.materials, entries); }
function getChecklists(){ return getSharedJsonData(sharedDataKeys.checklists, storageKeys.checklists, []); }
async function saveChecklists(entries){ await saveSharedJsonData(sharedDataKeys.checklists, storageKeys.checklists, entries); }
function getEmergencyContacts(){
return getSharedJsonData(sharedDataKeys.contacts, storageKeys.contacts, {
direction: "Direction du club\nAdrian\nGrace\nLogan",
security: "Securite interne\nResponsable securite\nNumero intervention",
urgence: "Urgence generale\nSecours\nPolice",
suppliers: "Fournisseurs boissons\nTechnique\nTransport",
useful: "Contacts utiles du club\nVTC\nSupport technique"
});
}
async function saveEmergencyContacts(entries){ await saveSharedJsonData(sharedDataKeys.contacts, storageKeys.contacts, entries); }
async function saveEmergencyContacts(contacts){ await saveSharedJsonData(sharedDataKeys.contacts, storageKeys.contacts, contacts); }
function getDefaultChecklistEntries(){
return Object.entries(checklistTemplates).flatMap(([department, phases])=>
Object.entries(phases).flatMap(([phase, items])=>
items.map((label)=> ({ id: makeId(), department, phase, label, assignedTo: "", done: false, updatedBy: "", updatedAt: "" }))
)
);
}
async function ensureOperationsDataSeeded(){
if(!getChecklists().length){
await saveChecklists(getDefaultChecklistEntries());
}
if(!localStorage.getItem(storageKeys.contacts) && getSharedSectionValue(sharedDataKeys.contacts) === undefined){
await saveEmergencyContacts(getEmergencyContacts());
}
}

function getEmailLocalPart(email){
return (email || "").trim().toLowerCase().split("@")[0];
}

function normalizeStaffEmail(email){
const loweredEmail = (email || "").trim().toLowerCase();
if(!loweredEmail.includes("@")){
return loweredEmail;
}
const [localPart, domain] = loweredEmail.split("@");
if(domain === "galaxy-night-club.com" || domain === "galaxynightclub.com"){
return localPart + "@galaxynightclub.com";
}
return loweredEmail;
}

function getStaffEmailAliases(email){
const normalizedEmail = normalizeStaffEmail(email);
if(!normalizedEmail){
return [];
}
if(!normalizedEmail.includes("@")){
return [normalizedEmail];
}
const localPart = getEmailLocalPart(normalizedEmail);
return Array.from(new Set([
localPart + "@galaxynightclub.com",
localPart + "@galaxy-night-club.com"
]));
}

function getUserEmail(user){
return normalizeStaffEmail(user.email || (user.username + "@galaxynightclub.com"));
}

function normalizeLocalStaffProfile(entry){
const username = entry.username || getEmailLocalPart(entry.email || "");
const email = normalizeStaffEmail(entry.email || "");
return {
username,
email,
firebaseUid: entry.firebaseUid || "",
discordId: entry.discordId || "",
password: entry.password || "",
role: getNormalizedRole(entry.role, username, email),
department: entry.department || "bar",
displayName: entry.displayName || entry.username || "Staff",
photoUrl: entry.photoUrl || "",
cardDescription: entry.cardDescription || "",
active: entry.active !== false,
mustChangePassword: entry.mustChangePassword === true,
dateJoined: entry.dateJoined || getTodayDateInputValue()
};
}

function getDepartmentLabel(department){ return departments[department] || department; }
function getStatusLabel(status){ return statuses[status] || status; }
function getPresenceStatusLabel(status){
const labels = { present: "Present", absent: "Absent", pending: "En attente" };
return labels[status] || status;
}
function sortByDateField(entries, fieldName = "createdAt"){
return [...entries].sort((first, second)=> String(second[fieldName] || second.date || "").localeCompare(String(first[fieldName] || first.date || "")));
}
function toComparableDate(value){
if(!value){ return null; }
const parsedDate = new Date(value);
if(!Number.isNaN(parsedDate.getTime())){ return parsedDate; }
const match = String(value).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})?/);
if(match){
const [, day, month, year, hours, minutes] = match;
return new Date(Number(year), Number(month) - 1, Number(day), Number(hours || 0), Number(minutes || 0));
}
return null;
}
function toDateKey(value){
const dateValue = toComparableDate(value);
if(!dateValue){ return ""; }
return dateValue.getFullYear() + "-" + String(dateValue.getMonth() + 1).padStart(2, "0") + "-" + String(dateValue.getDate()).padStart(2, "0");
}

function showMessage(elementId, text, isError = false){
const target = document.getElementById(elementId);
if(!target){ return; }
target.innerText = text;
target.classList.toggle("error", Boolean(isError));
target.classList.toggle("success", !isError && Boolean(text));
}
function getStartOfWeek(dateValue){
const date = new Date(dateValue);
const day = date.getDay();
const diff = day === 0 ? -6 : 1 - day;
date.setDate(date.getDate() + diff);
date.setHours(0, 0, 0, 0);
return date;
}
function getPointageTotalsForUser(username){
const userPointages = getVisiblePointages().filter((item)=> item.createdBy === username);
const now = new Date();
const weekStart = getStartOfWeek(now);
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
return userPointages.reduce((accumulator, item)=>{
const entryDate = toComparableDate(item.savedAt);
const duration = getPointageMinutes(item);
if(!entryDate){ return accumulator; }
if(entryDate >= weekStart){ accumulator.weekMinutes += duration; }
if(entryDate >= monthStart){ accumulator.monthMinutes += duration; }
return accumulator;
}, { weekMinutes: 0, monthMinutes: 0 });
}
function logAdminAction(action, targetType, title, details){
const nextLogs = [{ id: makeId(), action, targetType, title, details, createdBy: currentUser ? currentUser.displayName : "Systeme", createdAt: new Date().toISOString(), viewed: false }, ...getAdminLogs()].slice(0, 150);
setAdminLogs(nextLogs);
}
function archiveNoteEntry(sectionId, previousValue){
if(!previousValue){ return; }
setArchivedNotes([{ id: makeId(), sectionId, value: previousValue, updatedBy: currentUser ? currentUser.displayName : "Systeme", updatedAt: new Date().toISOString() }, ...getArchivedNotes()].slice(0, 200));
}

function getPointageMinutes(pointage){
if(!pointage || !pointage.entree || !pointage.sortie || pointage.entree === "-" || pointage.sortie === "-"){
return 0;
}

const [startHours, startMinutes] = pointage.entree.split(":").map(Number);
const [endHours, endMinutes] = pointage.sortie.split(":").map(Number);

if([startHours, startMinutes, endHours, endMinutes].some((value)=> Number.isNaN(value))){
return 0;
}

let startTotal = startHours * 60 + startMinutes;
let endTotal = endHours * 60 + endMinutes;

if(endTotal < startTotal){
endTotal += 24 * 60;
}

return Math.max(0, endTotal - startTotal);
}

function formatDuration(totalMinutes){
const hours = Math.floor(totalMinutes / 60);
const minutes = totalMinutes % 60;
return hours + "h" + String(minutes).padStart(2, "0");
}

function hasAdminAccess(){
if(!currentUser){ return false; }
const username = (currentUser.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(currentUser.email || "");
return currentUser.role === "boss" || currentUser.role === "responsable" || adminUsernames.includes(username) || adminUsernames.includes(emailLocalPart);
}

function isBossUser(user = currentUser){
if(!user){ return false; }
const username = (user.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(user.email || "");
return user.role === "boss" || username === "adrian" || emailLocalPart === "adrian";
}

function getManagedDepartments(user = currentUser){
if(!user){ return []; }
if(isBossUser(user)){ return ["all"]; }
const username = (user.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(user.email || "");
if(username === "grace" || emailLocalPart === "grace"){ return ["bar", "dance"]; }
if(username === "logan" || emailLocalPart === "logan"){ return ["security"]; }
if(user.role === "responsable" && user.department){ return [user.department]; }
return [];
}

function canManageAll(){ return getManagedDepartments().includes("all"); }
function canManageDepartment(department){
const managed = getManagedDepartments();
return managed.includes("all") || managed.includes(department);
}
function canManageStaff(){ return hasAdminAccess(); }
function canViewLogs(){ return isBossUser(); }
function canViewArchives(){ return isBossUser(); }
function canEditAnnouncements(){ return hasAdminAccess(); }
function canEditPlanning(){ return hasAdminAccess(); }
function canEditDocumentsSection(sectionId){
if(isBossUser()){ return true; }
if(!currentUser || currentUser.role !== "responsable"){ return false; }
if(sectionId.includes("docs_bar")){ return canManageDepartment("bar"); }
if(sectionId.includes("docs_security")){ return canManageDepartment("security"); }
if(sectionId.includes("docs_dj")){ return canManageDepartment("dj"); }
if(sectionId.includes("docs_dance")){ return canManageDepartment("dance"); }
return false;
}
function canEditStaffCard(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!targetUser){ return false; }
if(isBossUser()){ return true; }
return canManageDepartment(targetUser.department);
}

function canManageRequestsForDepartment(department){ return hasAdminAccess() && canManageDepartment(department); }
function getVisibleInternalRequests(){
return getInternalRequests().filter((entry)=>{
if(canManageAll()){ return true; }
if(hasAdminAccess() && canManageDepartment(entry.department)){ return true; }
return currentUser && entry.createdBy === currentUser.username;
});
}
function getVisibleTrainingRequests(){
return getTrainingRequests().filter((entry)=>{
if(canManageAll()){ return true; }
if(hasAdminAccess() && canManageDepartment(entry.department)){ return true; }
return currentUser && entry.createdBy === currentUser.username;
});
}
function canManageTrainingForDepartment(department){ return hasAdminAccess() && canManageDepartment(department); }
function canUserSeeNotification(entry, user = currentUser){
if(!entry || !user){ return false; }
if(Array.isArray(entry.deletedFor) && entry.deletedFor.includes(user.username)){ return false; }
if(hasAdminAccess()){ return true; }
if(entry.audience === "all"){ return true; }
if(entry.audience === "user" && entry.recipientUsername === user.username){ return true; }
return false;
}
function getVisibleNotifications(){ return getNotifications().filter((entry)=> canUserSeeNotification(entry)); }
function isNotificationRead(entry, user = currentUser){ return !entry || !user ? true : Array.isArray(entry.readBy) && entry.readBy.includes(user.username); }
function getUnreadNotificationsCount(){ return getVisibleNotifications().filter((entry)=> !isNotificationRead(entry)).length; }
async function createNotification(payload){
const entry = {
id: payload.id || makeId(),
type: payload.type || "system",
title: payload.title || "Notification",
body: payload.body || "",
department: payload.department || "all",
audience: payload.audience || "all",
recipientUsername: payload.recipientUsername || "",
linkPage: payload.linkPage || "dashboard",
createdBy: payload.createdBy || (currentUser ? currentUser.displayName : "Systeme"),
createdAt: payload.createdAt || new Date().toISOString(),
deletedFor: Array.isArray(payload.deletedFor) ? payload.deletedFor : [],
readBy: Array.isArray(payload.readBy) ? payload.readBy : []
};
await saveNotifications([entry, ...getNotifications().filter((item)=> item.id !== entry.id)].slice(0, 300));
}
async function markNotificationRead(id){
const notifications = getNotifications();
const target = notifications.find((entry)=> entry.id === id);
if(!target || !currentUser){ return; }
const readBy = Array.isArray(target.readBy) ? [...target.readBy] : [];
if(!readBy.includes(currentUser.username)){
readBy.push(currentUser.username);
target.readBy = readBy;
await saveNotifications(notifications);
}
renderNotifications();
renderAppBadges();
}
async function markAllNotificationsRead(){
if(!currentUser){ return; }
const notifications = getNotifications();
let changed = false;
notifications.forEach((entry)=>{
if(canUserSeeNotification(entry) && !isNotificationRead(entry)){
const readBy = Array.isArray(entry.readBy) ? [...entry.readBy] : [];
readBy.push(currentUser.username);
entry.readBy = Array.from(new Set(readBy));
changed = true;
}
});
if(changed){ await saveNotifications(notifications); }
renderNotifications();
renderAppBadges();
}

async function deleteNotification(id){
if(!currentUser){ return; }
const notifications = getNotifications();
const target = notifications.find((entry)=> entry.id === id);
if(!target){ return; }
const deletedFor = Array.isArray(target.deletedFor) ? [...target.deletedFor] : [];
if(!deletedFor.includes(currentUser.username)){
deletedFor.push(currentUser.username);
target.deletedFor = deletedFor;
await saveNotifications(notifications);
}
renderNotifications();
renderAppBadges();
}

async function deleteAllNotifications(){
if(!currentUser){ return; }
const notifications = getNotifications();
let changed = false;
notifications.forEach((entry)=>{
if(canUserSeeNotification(entry)){
const deletedFor = Array.isArray(entry.deletedFor) ? [...entry.deletedFor] : [];
if(!deletedFor.includes(currentUser.username)){
deletedFor.push(currentUser.username);
entry.deletedFor = deletedFor;
changed = true;
}
}
});
if(changed){ await saveNotifications(notifications); }
renderNotifications();
renderAppBadges();
}
function getChecklistScopeDepartments(){ return canManageAll() ? ["bar", "security", "dj", "dance"] : getManagedDepartments().filter((department)=> department !== "all"); }
function canEditChecklistDepartment(department){ return hasAdminAccess() && canManageDepartment(department); }
function canEditMaterialForUser(user){ return hasAdminAccess() && (canManageAll() || canManageDepartment(user.department)); }
function getLiveStatusForUser(user){
const today = getTodayDateInputValue();
const todayPointages = getPointages().filter((item)=> item.createdBy === user.username && toDateKey(item.savedAt) === today).sort((first, second)=> String(second.savedAt).localeCompare(String(first.savedAt)));
const latestPointage = todayPointages[0];
const presenceEntry = getPresenceEntryForUser(user.username, today);
const planningEntry = findPlanningEntryForUserDate(user.username, today);
if(latestPointage && latestPointage.status === "fin-service"){ return { label: "Termine", tone: "done" }; }
if((latestPointage && latestPointage.status === "absent") || (presenceEntry && presenceEntry.status === "absent")){ return { label: "Absent", tone: "absent" }; }
if(latestPointage && latestPointage.status === "en-service"){ return { label: "En service", tone: "service" }; }
if(planningEntry || (presenceEntry && presenceEntry.status === "present")){ return { label: "Pas encore pointe", tone: "waiting" }; }
return { label: "Pas encore pointe", tone: "waiting" };
}

function saveSectionContent(sectionId){
const field = document.getElementById(sectionId);
if(!field){ return; }
if(sectionId.startsWith("docs_") && !canEditDocumentsSection(sectionId)){ return; }
if(!sectionId.startsWith("docs_") && sectionId.includes("_") && !canEditStaffCard(sectionId.split("_")[0])){ return; }
const previousValue = getSharedSectionValue(sectionId) ?? localStorage.getItem(getSectionStorageKey(sectionId)) ?? "";
localStorage.setItem(getSectionStorageKey(sectionId), field.value);
setSharedSectionValue(sectionId, field.value);
if(previousValue !== field.value){
archiveNoteEntry(sectionId, previousValue);
logAdminAction("section_update", sectionId.startsWith("docs_") ? "document" : "dashboard_card", "Contenu mis a jour", sectionId + " modifie.");
}
}

function loadSavedSections(){
const staffSectionIds = getUsers().flatMap((user)=> getStaffSectionFields().map((field)=> user.username + "_" + field + "Content"));
[
...staffSectionIds,
"docs_reglementContent",
"docs_ouvertureContent",
"docs_fermetureContent",
"docs_barContent",
"docs_securityContent",
"docs_djContent",
"docs_danceContent",
"docs_managersContent"
].forEach((sectionId)=>{
const field = document.getElementById(sectionId);
const savedValue = getSharedSectionValue(sectionId) ?? localStorage.getItem(getSectionStorageKey(sectionId));
if(field && savedValue !== null){
field.value = savedValue;
}
});
}

function getSavedSectionValue(sectionId, fallbackValue){
const savedValue = getSharedSectionValue(sectionId) ?? localStorage.getItem(getSectionStorageKey(sectionId));
return savedValue !== null ? savedValue : fallbackValue;
}

function openPhotoPicker(slot){
if(!canEditStaffCard(slot)){
return;
}
const input = document.getElementById("cloudinaryPhotoInput");
if(!input){
return;
}
input.value = "";
input.dataset.slot = slot;
input.click();
}

function getProjectPhotoUrl(slot){
return "photos/" + slot + ".png";
}

function getPhotoUrlForSlot(slot){
const targetUser = getUsers().find((user)=> user.username === slot);
return targetUser && targetUser.photoUrl ? targetUser.photoUrl : getProjectPhotoUrl(slot);
}

function handlePhotoUpload(slot, event){
const input = event && event.files ? event : (event && event.target ? event.target : document.getElementById("cloudinaryPhotoInput"));
const file = input && input.files ? input.files[0] : null;
if(input){
input.value = "";
}
if(!slot || !canEditStaffCard(slot)){
showMessage("photo-upload-msg-" + slot, "Tu ne peux pas modifier cette photo.", true);
return;
}
if(!hasCloudinaryConfig()){
showMessage("photo-upload-msg-" + slot, "Renseigne cloudName et uploadPreset Cloudinary dans local-script.js.", true);
return;
}
if(!file){
return;
}
if(!String(file.type || "").startsWith("image/")){
showMessage("photo-upload-msg-" + slot, "Choisis une image valide.", true);
return;
}
const users = getUsers();
const targetUser = users.find((user)=> user.username === slot);
if(!targetUser){
showMessage("photo-upload-msg-" + slot, "Employe introuvable.", true);
return;
}

showMessage("photo-upload-msg-" + slot, "Envoi Cloudinary en cours...");
const formData = new FormData();
formData.append("file", file);
formData.append("upload_preset", cloudinaryConfig.uploadPreset);

fetch(getCloudinaryUploadUrl(), {
method: "POST",
body: formData
}).then((response)=> response.json().then((result)=> ({ ok: response.ok, result }))).then(({ ok, result })=>{
if(!ok || !result.secure_url){
throw new Error(result && result.error && result.error.message ? result.error.message : "Upload Cloudinary impossible.");
}
targetUser.photoUrl = result.secure_url;
setUsers(users);
if(currentUser && currentUser.username === slot){
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
}
loadSavedPhotos();
renderDashboardHierarchy();
showMessage("photo-upload-msg-" + slot, "Photo mise a jour.");
}).catch((error)=>{
console.error("Cloudinary upload error:", error);
showMessage("photo-upload-msg-" + slot, getFriendlyPhotoErrorMessage(error, "Cloudinary a refuse l'envoi de la photo."), true);
});
}

function loadSavedPhotos(){
getPhotoSlots().forEach((slot)=>{
const targetUser = getUsers().find((user)=> user.username === slot);
const savedPhoto = targetUser && targetUser.photoUrl ? targetUser.photoUrl : getProjectPhotoUrl(slot);
document.querySelectorAll("#photo-" + slot).forEach((image)=>{
image.src = savedPhoto;
image.onerror = () => {
image.onerror = null;
image.src = "image.png";
};
});
});
}

function loadSavedCardDescriptions(){
getPhotoSlots().forEach((slot)=>{
const targetUser = getUsers().find((user)=> user.username === slot);
const savedDescription = (targetUser && targetUser.cardDescription) || localStorage.getItem(getCardDescriptionStorageKey(slot));
const display = document.getElementById("card-description-" + slot);
const input = document.getElementById("card-description-input-" + slot);
if(savedDescription){
if(display){
display.innerText = savedDescription;
}
if(input){
input.value = savedDescription;
}
}
});
}

function saveCardDescription(slot){
if(!currentUser || !canEditStaffCard(slot)){
return;
}

const input = document.getElementById("card-description-input-" + slot);
const display = document.getElementById("card-description-" + slot);
if(!input || !display){
return;
}

localStorage.setItem(getCardDescriptionStorageKey(slot), input.value);
display.innerText = input.value;
const users = getUsers();
const targetUser = users.find((user)=> user.username === slot);
if(targetUser){
targetUser.cardDescription = input.value;
setUsers(users);
}
logAdminAction("card_update", "dashboard_card", "Description mise a jour", "Description modifiee pour " + slot + ".");
}

function getUserProfileFromEmail(email){
const emailAliases = getStaffEmailAliases(email);
const localPart = getEmailLocalPart(email);
return getUsers().find((entry)=>{
const entryAliases = getStaffEmailAliases(entry.email || "");
return entryAliases.some((candidate)=> emailAliases.includes(candidate)) || entry.username === localPart;
}) || null;
}

function login(event){
if(event){
event.preventDefault();
}

const email = document.getElementById("username").value.trim().toLowerCase();
const password = document.getElementById("password").value.trim();
const loginMsg = document.getElementById("loginMsg");
const profile = getUserProfileFromEmail(email);

if(!profile || profile.password !== password){
loginMsg.className = "status-msg error";
loginMsg.innerText = "Connexion impossible. Verifie l'email et le mot de passe.";
return;
}
if(profile.active === false){
loginMsg.className = "status-msg error";
loginMsg.innerText = "Ce compte est actuellement desactive.";
return;
}

currentUser = profile;
localStorage.setItem(storageKeys.session, JSON.stringify(profile));
loginMsg.className = "status-msg success";
loginMsg.innerText = "Connexion locale reussie.";
renderApp();
if(currentUser.mustChangePassword){
showForcedPasswordModal();
}
}

function logout(){
currentUser = null;
editingUsername = null;
presencePromptSessionDate = "";
localStorage.removeItem(storageKeys.session);
document.body.classList.remove("mobile-menu-open");
hidePresencePromptModal();
hideForcedPasswordModal();
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
document.getElementById("loginMsg").innerText = "";
document.getElementById("password").value = "";
}

function showForcedPasswordModal(){
document.getElementById("forcePasswordModal").classList.remove("hidden");
}

function hideForcedPasswordModal(){
document.getElementById("forcePasswordModal").classList.add("hidden");
document.getElementById("forcedPasswordInput").value = "";
document.getElementById("forcedPasswordConfirm").value = "";
document.getElementById("forcedPasswordMsg").innerText = "";
}

function showPresencePromptModal(){
document.getElementById("presencePromptModal").classList.remove("hidden");
}

function hidePresencePromptModal(){
document.getElementById("presencePromptModal").classList.add("hidden");
document.getElementById("presencePromptMsg").innerText = "";
}

function toggleMobileMenu(){
document.body.classList.toggle("mobile-menu-open");
}

function submitForcedPasswordChange(){
if(!currentUser){ return; }
const nextPassword = document.getElementById("forcedPasswordInput").value.trim();
const confirmPassword = document.getElementById("forcedPasswordConfirm").value.trim();
const message = document.getElementById("forcedPasswordMsg");
if(!nextPassword || nextPassword.length < 6){
message.innerText = "Mets au moins 6 caracteres.";
return;
}
if(nextPassword !== confirmPassword){
message.innerText = "Les mots de passe ne correspondent pas.";
return;
}
const users = getUsers();
const targetUser = users.find((user)=> user.username === currentUser.username);
if(targetUser){
targetUser.password = nextPassword;
targetUser.mustChangePassword = false;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
}
hideForcedPasswordModal();
logAdminAction("password_forced_change", "staff", "Mot de passe change", currentUser.displayName + " a valide son nouveau mot de passe.");
renderApp();
}

function restoreSession(){
const savedUser = localStorage.getItem(storageKeys.session);
if(!savedUser){ return; }
currentUser = JSON.parse(savedUser);
if(currentUser.active === false){
currentUser = null;
localStorage.removeItem(storageKeys.session);
return;
}
renderApp();
if(currentUser.mustChangePassword){
showForcedPasswordModal();
}
}

function getScopeUsers(){ return getUsers().filter((user)=> canManageAll() || user.username === currentUser.username || isBossUser(user) || canManageDepartment(user.department)); }
function getVisiblePointages(){ return getPointages().filter((pointage)=> canManageAll() || pointage.createdBy === currentUser.username || canManageDepartment(pointage.department)); }

function getRoleLabel(user){
if(user.role === "boss"){ return "Patron"; }
if(user.role === "responsable"){ return "Responsable"; }
if(user.role === "manager"){ return "Manager"; }
return "Staff";
}

function getAccountStatusLabel(user){
return user.active === false ? "Inactif" : "Actif";
}

function getDepartmentThemeClass(department){
return "dept-theme-" + (department || "bar");
}

function getStaffCardDefaultDescription(user, roleLabel = getRoleLabel(user)){
return roleLabel === "Responsable"
? "Responsable du pole " + getDepartmentLabel(user.department).toLowerCase() + "."
: roleLabel === "Manager"
? "Manager du pole " + getDepartmentLabel(user.department).toLowerCase() + "."
: "Membre du staff du pole " + getDepartmentLabel(user.department).toLowerCase() + ".";
}

function buildCredentialsMessage(user, passwordOverride){
const password = passwordOverride || user.password || "(mot de passe non visible ici)";
return "Galaxy Night Club\nEmail : " + getUserEmail(user) + "\nMot de passe : " + password + "\nRole : " + getRoleLabel(user) + "\nPole : " + getDepartmentLabel(user.department) + (user.discordId ? "\nDiscord ID : " + user.discordId : "") + (user.mustChangePassword ? "\nAction : changement de mot de passe obligatoire a la premiere connexion." : "");
}

function updateCredentialsPreview(message){
latestCredentialsMessage = message || "";
const preview = document.getElementById("staffCredentialsPreview");
if(preview){
preview.innerText = latestCredentialsMessage || "Le message de connexion du staff apparaitra ici apres creation ou sur la fiche du compte.";
}
}

async function copyTextToClipboard(text){
if(!text){ return false; }
try{
await navigator.clipboard.writeText(text);
return true;
} catch (error){
console.error("Clipboard error:", error);
return false;
}
}

async function copyLatestCredentials(){
const copied = await copyTextToClipboard(latestCredentialsMessage);
document.getElementById("staffMsg").innerText = copied ? "Message de connexion copie." : "Impossible de copier automatiquement.";
}

async function copyStaffCredentials(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!targetUser || !canManageUser(targetUser)){ return; }
updateCredentialsPreview(buildCredentialsMessage(targetUser));
const copied = await copyTextToClipboard(latestCredentialsMessage);
document.getElementById("staffMsg").innerText = copied ? "Message de connexion copie pour " + targetUser.displayName + "." : "Impossible de copier automatiquement.";
}

function getFirestoreRulesSnippet(){
return [
"rules_version = '2';",
"",
"service cloud.firestore {",
"  match /databases/{database}/documents {",
"    function signedIn() {",
"      return request.auth != null;",
"    }",
"",
"    function hasAccessProfile() {",
"      return signedIn() && exists(/databases/$(database)/documents/accessProfiles/$(request.auth.uid));",
"    }",
"",
"    function accessData() {",
"      return get(/databases/$(database)/documents/accessProfiles/$(request.auth.uid)).data;",
"    }",
"",
"    function manager() {",
"      return hasAccessProfile() && (accessData().role == 'boss' || accessData().role == 'responsable');",
"    }",
"",
"    function boss() {",
"      return hasAccessProfile() && accessData().role == 'boss';",
"    }",
"",
"    match /accessProfiles/{uid} {",
"      allow read: if signedIn();",
"      allow create, update: if signedIn() && request.auth.uid == uid;",
"      allow delete: if boss();",
"    }",
"",
"    match /staffProfiles/{username} {",
"      allow read: if signedIn();",
"      allow create, update: if manager();",
"      allow delete: if boss();",
"    }",
"",
"    match /pointages/{pointageId} {",
"      allow read: if signedIn();",
"      allow create: if signedIn();",
"      allow update, delete: if manager();",
"    }",
"",
"    match /planningEntries/{entryId} {",
"      allow read: if signedIn();",
"      allow create, update, delete: if manager();",
"    }",
"",
"    match /announcements/{announcementId} {",
"      allow read: if signedIn();",
"      allow create, update, delete: if manager();",
"    }",
"",
"    match /announcementReads/{readId} {",
"      allow read: if signedIn();",
"      allow create, update: if signedIn() && request.resource.data.uid == request.auth.uid;",
"      allow delete: if manager();",
"    }",
"",
"    match /adminLogs/{logId} {",
"      allow read: if boss();",
"      allow create: if signedIn();",
"      allow update, delete: if false;",
"    }",
"",
"    match /sharedSections/{sectionId} {",
"      allow read: if signedIn();",
"      allow create, update: if manager();",
"      allow delete: if boss();",
"    }",
"",
"    match /archivedStaff/{docId} {",
"      allow read: if boss();",
"      allow create: if manager();",
"      allow update, delete: if false;",
"    }",
"",
"    match /archivedPointages/{docId} {",
"      allow read: if boss();",
"      allow create: if manager();",
"      allow update, delete: if false;",
"    }",
"",
"    match /archivedNotes/{docId} {",
"      allow read: if boss();",
"      allow create: if manager();",
"      allow update, delete: if false;",
"    }",
"  }",
"}"
].join("\n");
}

function getStorageRulesSnippet(){
return [
"rules_version = '2';",
"",
"service firebase.storage {",
"  match /b/{bucket}/o {",
"    function signedIn() {",
"      return request.auth != null;",
"    }",
"",
"    function hasAccessProfile() {",
"      return signedIn() && exists(/databases/(default)/documents/accessProfiles/$(request.auth.uid));",
"    }",
"",
"    function accessData() {",
"      return get(/databases/(default)/documents/accessProfiles/$(request.auth.uid)).data;",
"    }",
"",
"    function manager() {",
"      return hasAccessProfile() && (accessData().role == 'boss' || accessData().role == 'responsable');",
"    }",
"",
"    match /staffPhotos/{allPaths=**} {",
"      allow read: if signedIn();",
"      allow write: if manager()",
"        && request.resource.size < 10 * 1024 * 1024",
"        && request.resource.contentType.matches('image/.*');",
"    }",
"  }",
"}"
].join("\n");
}

async function copyFirestoreRules(){
const copied = await copyTextToClipboard(getFirestoreRulesSnippet());
showMessage("firebaseSecurityMsg", copied ? "Regles Firestore copiees." : "Impossible de copier les regles Firestore.", !copied);
}

async function copyStorageRules(){
const copied = await copyTextToClipboard(getStorageRulesSnippet());
showMessage("firebaseSecurityMsg", copied ? "Regles Storage copiees." : "Impossible de copier les regles Storage.", !copied);
}

function formatNotificationDate(value){
if(!value){ return "-"; }
if(typeof value === "string" && value.includes("/")){ return value; }
const date = new Date(value);
return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("fr-FR");
}

function renderAppBadges(){
if(!currentUser){ return; }
const notificationCount = getUnreadNotificationsCount();
const notificationBadge = document.getElementById("notificationsNavCount");
if(notificationBadge){
notificationBadge.innerText = String(notificationCount);
notificationBadge.classList.toggle("hidden", notificationCount <= 0);
}
const formationCount = getVisibleTrainingRequests().filter((entry)=> hasAdminAccess() ? entry.status === "En attente" || entry.status === "A planifier" : entry.createdBy === currentUser.username && entry.status !== "Validee").length;
const formationBadge = document.getElementById("formationsNavCount");
if(formationBadge){
formationBadge.innerText = String(formationCount);
formationBadge.classList.toggle("hidden", formationCount <= 0);
}
}

async function openNotificationPage(page, notificationId){
if(notificationId){ await markNotificationRead(notificationId); }
show(page || "notifications");
}

function getStaffPanelMarkup(user){
const roleLabel = getRoleLabel(user);
const canEditPhoto = canEditStaffCard(user.username);
const sections = [
{ label: "Photo", type: "photo" },
{ label: "Informations", id: user.username + "_infosContent", value: getSavedSectionValue(user.username + "_infosContent", "Informations internes pour " + user.displayName + ".") },
{ label: "Numeros", id: user.username + "_numerosContent", value: getSavedSectionValue(user.username + "_numerosContent", "Numeros utiles pour " + user.displayName + ".") },
{ label: "Grade", id: user.username + "_gradeContent", value: getSavedSectionValue(user.username + "_gradeContent", roleLabel) },
{ label: "Date d'entree", id: user.username + "_dateentreeContent", value: getSavedSectionValue(user.username + "_dateentreeContent", user.dateJoined || getTodayDateInputValue()) },
{ label: "Disponibilites", id: user.username + "_disponibilitesContent", value: getSavedSectionValue(user.username + "_disponibilitesContent", "Disponibilites a renseigner.") },
{ label: "Sanctions", id: user.username + "_sanctionsContent", value: getSavedSectionValue(user.username + "_sanctionsContent", "Aucune sanction enregistree.") }
];
return "<div class='dashboard-mini-grid'>" + sections.map((section)=>{
if(section.type === "photo"){
const photoSource = user.photoUrl ? "Photo partagee Cloudinary active." : "Ajoute une photo partagee pour cette fiche.";
const uploadButton = canEditPhoto ? "<button class='secondary-btn save-section-btn' type='button' onclick=\"openPhotoPicker('" + user.username + "')\">Choisir une photo</button>" : "";
const cloudinaryHint = hasCloudinaryConfig() ? "Les responsables peuvent envoyer une image partagee." : "Tu peux aussi remplir la config Cloudinary dans local-script.js pour partager les photos sans republier le site.";
return "<article class='mini-info-card editable-card'><strong>" + section.label + "</strong><p class='section-text'>" + photoSource + "</p><p class='section-text'>" + cloudinaryHint + "</p>" + uploadButton + "<p id='photo-upload-msg-" + user.username + "' class='save-msg'></p></article>";
}
return "<article class='mini-info-card editable-card'><strong>" + section.label + "</strong><textarea id='" + section.id + "' class='mini-editor'>" + section.value + "</textarea><button class='secondary-btn save-section-btn' onclick=\"saveSectionContent('" + section.id + "')\">Enregistrer</button></article>";
}).join("") + "</div>";
}

function refreshStaffPanels(){
getUsers().forEach((user)=>{
const panel = document.getElementById("staff-panel-" + user.username);
if(panel){
panel.innerHTML = getStaffPanelMarkup(user);
}
});
}

function getGroupCountLabel(count){
return count + " profil" + (count > 1 ? "s" : "");
}

function renderDashboardHierarchy(){
const users = getUsers();
const coreUsernames = ["adrian", "grace", "logan"];
const extraUsers = users.filter((user)=> !coreUsernames.includes(user.username));
const directionUsers = users.filter((user)=> ["adrian", "grace", "logan"].includes(user.username) || user.department === "all");
const barUsers = users.filter((user)=> !["grace", "logan"].includes(user.username) && user.department === "bar");
const securityUsers = users.filter((user)=> !["grace", "logan"].includes(user.username) && user.department === "security");
const djUsers = users.filter((user)=> user.department === "dj");
const danceUsers = users.filter((user)=> user.department === "dance");

document.getElementById("directionCount").innerText = getGroupCountLabel(directionUsers.length);
document.getElementById("barCount").innerText = getGroupCountLabel(barUsers.length);
document.getElementById("securityCount").innerText = getGroupCountLabel(securityUsers.length);
document.getElementById("djCount").innerText = getGroupCountLabel(djUsers.length);
document.getElementById("danceCount").innerText = getGroupCountLabel(danceUsers.length);

const sections = [
{ id: "directionExtraCards", panelId: "directionExtraPanels", department: "all" },
{ id: "barExtraCards", panelId: "barExtraPanels", department: "bar" },
{ id: "securityExtraCards", panelId: "securityExtraPanels", department: "security" },
{ id: "djExtraCards", panelId: "djExtraPanels", department: "dj" },
{ id: "danceExtraCards", panelId: "danceExtraPanels", department: "dance" }
];

sections.forEach((section)=>{
const container = document.getElementById(section.id);
const panelContainer = document.getElementById(section.panelId);
const scopedUsers = extraUsers.filter((user)=> user.department === section.department);

if(!scopedUsers.length){
container.innerHTML = "";
panelContainer.innerHTML = "";
container.classList.add("hidden");
panelContainer.classList.add("hidden");
return;
}

container.classList.remove("hidden");
panelContainer.classList.remove("hidden");
container.innerHTML = scopedUsers.map((user)=> {
const roleLabel = getRoleLabel(user);
const defaultDescription = roleLabel === "Responsable" ? "Responsable du pole " + getDepartmentLabel(user.department).toLowerCase() + "." : "Membre du staff du pole " + getDepartmentLabel(user.department).toLowerCase() + ".";
const description = user.cardDescription || localStorage.getItem(getCardDescriptionStorageKey(user.username)) || defaultDescription;
const savedPhoto = getPhotoUrlForSlot(user.username);
return "<article class='person-card hierarchy-person-card dynamic-person-card' data-person='" + user.username + "' onclick=\"showStaffCard('" + user.username + "')\"><img id='photo-" + user.username + "' src='" + savedPhoto + "' alt='" + user.displayName + "' class='person-photo hierarchy-photo' onerror=\"this.onerror=null;this.src='image.png'\"><strong>" + user.displayName + "</strong><span class='dept-badge'>" + roleLabel + "</span><p id='card-description-" + user.username + "'>" + description + "</p><div class='card-editor hidden' onclick='event.stopPropagation()'><textarea id='card-description-input-" + user.username + "' class='card-description-input' placeholder='Petite description de la carte'>" + description + "</textarea><button class='secondary-btn mini-card-btn' onclick=\"saveCardDescription('" + user.username + "')\">Enregistrer</button></div></article>";
}).join("");

panelContainer.innerHTML = scopedUsers.map((user)=> "<div id='staff-panel-" + user.username + "' class='staff-detail-panel hidden'>" + getStaffPanelMarkup(user) + "</div>").join("");
});
}

function canManageUser(targetUser){
if(!targetUser){ return false; }
if(isBossUser()){ return true; }
if(currentUser.role !== "responsable"){ return false; }
if(targetUser.role === "boss"){ return false; }
return canManageDepartment(targetUser.department);
}

function updatePointageFormState(){
const nameInput = document.getElementById("nom");
if(!hasAdminAccess()){
nameInput.value = currentUser.displayName;
nameInput.readOnly = true;
nameInput.placeholder = currentUser.displayName;
return;
}
nameInput.readOnly = false;
nameInput.placeholder = "Nom du membre du staff";
nameInput.value = "";
}

function renderHierarchyDetails(){
const container = document.getElementById("hierarchieDetails");
if(!container){ return; }
const users = getUsers().filter((user)=> user.role !== "boss");
container.innerHTML = users.map((user)=> "<div class='hierarchy-item'><span class='dept-badge'>" + getDepartmentLabel(user.department) + "</span><strong>" + user.displayName + "</strong><div class='staff-meta'>Role : " + getRoleLabel(user) + "<br>Email : " + getUserEmail(user) + "</div></div>").join("");
}

function renderPointages(){
const container = document.getElementById("pointagesList");
const detailContainer = document.getElementById("pointagePersonDetail");
if(!container){ return; }
const exportPanel = document.getElementById("pointageExportPanel");
if(exportPanel){
exportPanel.classList.toggle("hidden", !hasAdminAccess());
}

const nameFilter = document.getElementById("filterEmployee").value.trim().toLowerCase();
const departmentFilter = document.getElementById("filterDepartment").value;
const statusFilter = document.getElementById("filterStatus").value;
const dateFilter = document.getElementById("filterPointageDate").value;
const fromFilter = document.getElementById("filterPointageFrom").value;
const toFilter = document.getElementById("filterPointageTo").value;

const visiblePointages = getVisiblePointages().filter((item)=>{
const matchesName = !nameFilter || item.nom.toLowerCase().includes(nameFilter);
const matchesDepartment = !departmentFilter || item.department === departmentFilter;
const matchesStatus = !statusFilter || item.status === statusFilter;
const matchesDate = !dateFilter || toDateKey(item.savedAt) === dateFilter;
const itemDate = toDateKey(item.savedAt);
const matchesFrom = !fromFilter || itemDate >= fromFilter;
const matchesTo = !toFilter || itemDate <= toFilter;
return matchesName && matchesDepartment && matchesStatus && matchesDate && matchesFrom && matchesTo;
});

if(!visiblePointages.length){
container.innerHTML = "<div class='pointage-item'><strong>Aucun pointage</strong><div class='pointage-meta'>Aucun enregistrement disponible dans ton perimetre.</div></div>";
document.getElementById("pointageWeekTotal").innerText = "0h00";
document.getElementById("pointageMonthTotal").innerText = "0h00";
document.getElementById("pointagePeriodTotal").innerText = "0h00";
document.getElementById("pointageOvertimeTotal").innerText = "0h00";
if(detailContainer){
detailContainer.classList.add("hidden");
detailContainer.innerHTML = "";
}
return;
}

const groupedPointages = Object.values(visiblePointages.reduce((acc, item)=>{
const key = item.createdBy || item.nom;
if(!acc[key]){
acc[key] = {
key,
nom: item.nom,
department: item.department,
pointages: [],
totalMinutes: 0
};
}
acc[key].pointages.push(item);
acc[key].totalMinutes += getPointageMinutes(item);
return acc;
}, {})).sort((first, second)=> first.nom.localeCompare(second.nom, "fr"));

const hasSelectedUser = selectedPointageUser && groupedPointages.some((group)=> group.key === selectedPointageUser);
if(!hasSelectedUser){
selectedPointageUser = groupedPointages[0].key;
}

const activeGroup = groupedPointages.find((group)=> group.key === selectedPointageUser) || groupedPointages[0];
const totals = activeGroup ? getPointageTotalsForUser(activeGroup.key) : { weekMinutes: 0, monthMinutes: 0 };
const rangeTotals = activeGroup ? getPointageRangeTotals(activeGroup.key) : { totalMinutes: 0, overtimeMinutes: 0 };
document.getElementById("pointageWeekTotal").innerText = formatDuration(totals.weekMinutes);
document.getElementById("pointageMonthTotal").innerText = formatDuration(totals.monthMinutes);
document.getElementById("pointagePeriodTotal").innerText = formatDuration(rangeTotals.totalMinutes);
document.getElementById("pointageOvertimeTotal").innerText = formatDuration(rangeTotals.overtimeMinutes);

container.innerHTML = groupedPointages.map((group)=>{
const latestPointage = group.pointages[0];
const isActive = group.key === selectedPointageUser;
return "<div class='pointage-item pointage-summary-card" + (isActive ? " active-pointage" : "") + "' onclick=\"showPointagePerson('" + group.key + "')\"><div class='pointage-summary-top'><div><span class='dept-badge'>" + getDepartmentLabel(group.department) + "</span> <span class='status-badge " + latestPointage.status + "'>" + getStatusLabel(latestPointage.status) + "</span></div><span class='pointage-total-badge'>Total " + formatDuration(group.totalMinutes) + "</span></div><strong>" + group.nom + "</strong><div class='pointage-meta'>" + group.pointages.length + " pointage(s)<br>Dernier enregistrement : " + latestPointage.savedAt + "</div></div>";
}).join("");

const activeSummary = groupedPointages.find((group)=> group.key === selectedPointageUser) || null;
if(!activeSummary){
detailContainer.classList.add("hidden");
detailContainer.innerHTML = "";
return;
}

detailContainer.classList.remove("hidden");
const activeTotals = getPointageTotalsForUser(activeSummary.key);
const activeRangeTotals = getPointageRangeTotals(activeSummary.key);
detailContainer.innerHTML =
"<p class='eyebrow'>Detail pointages</p>" +
"<h2>" + activeSummary.nom + "</h2>" +
"<p>Total cumule : <strong>" + formatDuration(activeSummary.totalMinutes) + "</strong> sur " + activeSummary.pointages.length + " service(s). Semaine : <strong>" + formatDuration(activeTotals.weekMinutes) + "</strong>. Mois : <strong>" + formatDuration(activeTotals.monthMinutes) + "</strong>. Periode choisie : <strong>" + formatDuration(activeRangeTotals.totalMinutes) + "</strong>. Heures supp estimees : <strong>" + formatDuration(activeRangeTotals.overtimeMinutes) + "</strong>.</p>" +
"<div class='pointage-detail-list'>" +
activeSummary.pointages.map((item)=>{
const deleteBtn = (canManageAll() || item.createdBy === currentUser.username) ? "<button class='danger-btn' onclick=\"deletePointage('" + item.id + "')\">Supprimer</button>" : "";
const durationLabel = formatDuration(getPointageMinutes(item));
const planningEntry = findPlanningEntryForUserDate(item.createdBy, toDateKey(item.savedAt));
const lateMinutes = planningEntry ? getLateMinutesForEntry(planningEntry) : 0;
return "<div class='pointage-detail-item'><div class='pointage-detail-head'><div><span class='dept-badge'>" + getDepartmentLabel(item.department) + "</span> <span class='status-badge " + item.status + "'>" + getStatusLabel(item.status) + "</span></div><span class='pointage-total-badge'>Duree " + durationLabel + "</span></div><strong>" + item.nom + "</strong><div class='pointage-meta'>Arrivee : " + item.entree + "<br>Sortie : " + item.sortie + "<br>Enregistre le : " + item.savedAt + (lateMinutes > 0 ? "<br>Retard detecte : " + lateMinutes + " min" : "") + "</div><div class='staff-actions'>" + deleteBtn + "</div></div>";
}).join("") +
"</div>";
}

function exportPointages(){
if(!hasAdminAccess()){
showMessage("saveMsg", "Seuls les responsables peuvent exporter les pointages.", true);
return;
}
const nameFilter = document.getElementById("filterEmployee").value.trim().toLowerCase();
const departmentFilter = document.getElementById("filterDepartment").value;
const statusFilter = document.getElementById("filterStatus").value;
const dateFilter = document.getElementById("filterPointageDate").value;
const rows = getVisiblePointages().filter((item)=>{
const matchesName = !nameFilter || item.nom.toLowerCase().includes(nameFilter);
const matchesDepartment = !departmentFilter || item.department === departmentFilter;
const matchesStatus = !statusFilter || item.status === statusFilter;
const matchesDate = !dateFilter || toDateKey(item.savedAt) === dateFilter;
return matchesName && matchesDepartment && matchesStatus && matchesDate;
});
const selectedUser = selectedPointageUser ? getUsers().find((user)=> user.username === selectedPointageUser) : null;
const totals = selectedPointageUser ? getPointageTotalsForUser(selectedPointageUser) : { weekMinutes: 0, monthMinutes: 0 };
const filters = [
document.getElementById("filterEmployee").value.trim() ? "Employe : " + document.getElementById("filterEmployee").value.trim() : null,
departmentFilter ? "Pole : " + getDepartmentLabel(departmentFilter) : null,
statusFilter ? "Statut : " + getStatusLabel(statusFilter) : null,
dateFilter ? "Date : " + dateFilter : null
].filter(Boolean).join(" | ") || "Aucun filtre";
const rowsHtml = rows.length ? rows.map((item)=> "<tr><td>" + item.nom + "</td><td>" + getDepartmentLabel(item.department) + "</td><td>" + getStatusLabel(item.status) + "</td><td>" + item.entree + "</td><td>" + item.sortie + "</td><td>" + formatDuration(getPointageMinutes(item)) + "</td><td>" + item.savedAt + "</td></tr>").join("") : "<tr><td colspan='7'>Aucun pointage a exporter.</td></tr>";
const reportWindow = window.open("", "_blank", "width=1100,height=800");
if(!reportWindow){ return; }
reportWindow.document.write("<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Galaxy Pointages PDF</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111827;background:#ffffff;}h1{margin:0 0 8px;font-size:28px;}p{margin:0 0 10px;color:#4b5563;}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px;}th,td{border:1px solid #d1d5db;padding:10px 12px;text-align:left;vertical-align:top;}th{background:#111827;color:#ffffff;}tbody tr:nth-child(even){background:#f9fafb;}.meta{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;margin-top:20px;}.meta-card{padding:14px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb;}.meta-card strong{display:block;margin-bottom:6px;}@media print{body{padding:18px;}}</style></head><body><h1>Galaxy Night Club - Export pointages</h1><p>Genere le " + new Date().toLocaleString("fr-FR") + "</p><p>Filtres : " + filters + "</p><div class='meta'><div class='meta-card'><strong>Total semaine</strong><span>" + formatDuration(totals.weekMinutes) + "</span></div><div class='meta-card'><strong>Total mois</strong><span>" + formatDuration(totals.monthMinutes) + "</span></div><div class='meta-card'><strong>Nombre de lignes</strong><span>" + rows.length + "</span></div><div class='meta-card'><strong>Utilisateur selectionne</strong><span>" + (selectedUser ? selectedUser.displayName : "Tous") + "</span></div></div><table><thead><tr><th>Nom</th><th>Pole</th><th>Statut</th><th>Arrivee</th><th>Sortie</th><th>Duree</th><th>Date</th></tr></thead><tbody>" + rowsHtml + "</tbody></table><script>window.onload = function(){ window.print(); }<\/script></body></html>");
reportWindow.document.close();
}

function findUserByName(name){
return getUsers().find((user)=> user.displayName.toLowerCase() === name.toLowerCase());
}

function savePointage(){
if(!currentUser){ return; }
const nameInput = document.getElementById("nom");
const entree = document.getElementById("heure-entree").value;
const sortie = document.getElementById("heure-sortie").value;
const status = document.getElementById("pointageStatus").value;
const message = document.getElementById("saveMsg");
const nom = !hasAdminAccess() ? currentUser.displayName : nameInput.value.trim();

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

if(!hasAdminAccess() && targetUser.username !== currentUser.username){
message.innerText = "Tu ne peux pointer que ton propre compte.";
return;
}

if(currentUser.role === "responsable" && !canManageDepartment(targetUser.department) && targetUser.username !== currentUser.username){
message.innerText = "Tu ne peux pointer que les membres de tes poles.";
return;
}

const pointages = getPointages();
pointages.unshift({
id: makeId(),
nom: targetUser.displayName,
entree: status === "absent" ? "-" : entree,
sortie: sortie || "-",
savedAt: new Date().toLocaleString("fr-FR"),
createdBy: targetUser.username,
department: targetUser.department,
status: status
});
setPointages(pointages);

message.innerText = "Pointage enregistre pour " + targetUser.displayName + ".";
document.getElementById("heure-entree").value = "";
document.getElementById("heure-sortie").value = "";
document.getElementById("pointageStatus").value = "en-service";
updatePointageFormState();
renderPointages();
}

function deletePointage(id){
const pointage = getPointages().find((item)=> item.id === id);
if(!pointage || (!canManageAll() && pointage.createdBy !== currentUser.username)){ return; }
setArchivedPointages([{ ...pointage, id: makeId(), archivedAt: new Date().toISOString(), archivedBy: currentUser.displayName }, ...getArchivedPointages()].slice(0, 200));
setPointages(getPointages().filter((item)=> item.id !== id));
logAdminAction("pointage_delete", "pointage", "Pointage supprime", pointage.nom + " - " + pointage.savedAt);
renderPointages();
}

function getVisiblePlanningEntries(){
return getPlanningEntries().filter((entry)=> canManageAll() || canManageDepartment(entry.department) || entry.username === currentUser.username);
}

function getVisibleAnnouncements(){
const today = new Date();
today.setHours(0, 0, 0, 0);
return getAnnouncements().filter((entry)=>{
if(!entry.visibleUntil){ return true; }
const untilDate = new Date(entry.visibleUntil);
untilDate.setHours(23, 59, 59, 999);
return untilDate >= today;
});
}

function getPresenceDateValue(){
const field = document.getElementById("presenceDate");
return field && field.value ? field.value : getTodayDateInputValue();
}

function getPresenceScopeUsers(){
return getUsers()
 .filter((user)=> user.active !== false)
 .filter((user)=> canManageAll() || user.username === currentUser.username || canManageDepartment(user.department))
 .sort((first, second)=> first.displayName.localeCompare(second.displayName, "fr"));
}

function canManagePresenceForUser(user){
if(!currentUser || !user){ return false; }
if(canManageAll()){ return true; }
if(user.username === currentUser.username){ return true; }
return canManageDepartment(user.department);
}

function getPresenceEntriesForDate(dateValue = getPresenceDateValue()){
return getPresenceEntries().filter((entry)=> entry.date === dateValue);
}

function getPresenceEntryForUser(username, dateValue = getPresenceDateValue()){
return getPresenceEntriesForDate(dateValue).find((entry)=> entry.username === username) || null;
}

function shouldShowPresencePrompt(){
if(!currentUser){ return false; }
const today = getTodayDateInputValue();
if(presencePromptSessionDate === today){ return false; }
const entry = getPresenceEntryForUser(currentUser.username, today);
return !entry || entry.status === "pending";
}

function populatePresenceTargetOptions(){
const select = document.getElementById("presenceTargetUser");
if(!select || !currentUser){ return; }
const scopedUsers = getPresenceScopeUsers();
select.innerHTML = scopedUsers.map((user)=> "<option value=\"" + user.username + "\">" + user.displayName + "</option>").join("");
if(!hasAdminAccess()){
select.value = currentUser.username;
select.disabled = true;
return;
}
select.disabled = false;
if(!select.value || !scopedUsers.some((user)=> user.username === select.value)){
select.value = scopedUsers[0] ? scopedUsers[0].username : "";
}
}

function updatePresenceSelfStatus(dateValue = getPresenceDateValue()){
const target = document.getElementById("presenceSelfStatus");
if(!target || !currentUser){ return; }
const entry = getPresenceEntryForUser(currentUser.username, dateValue);
target.innerText = entry ? getPresenceStatusLabel(entry.status) + (entry.note ? " - " + entry.note : "") : "Aucune reponse enregistree pour le moment.";
}

function renderPresence(){
const list = document.getElementById("presenceList");
if(!list || !currentUser){ return; }
const dateValue = getPresenceDateValue();
const scopedUsers = getPresenceScopeUsers();
const visibleEntries = scopedUsers.map((user)=>{
const existingEntry = getPresenceEntryForUser(user.username, dateValue);
return existingEntry || {
id: "",
date: dateValue,
username: user.username,
displayName: user.displayName,
department: user.department,
status: "pending",
note: "",
updatedBy: "",
updatedAt: ""
};
});
document.getElementById("presencePresentCount").innerText = String(visibleEntries.filter((entry)=> entry.status === "present").length);
document.getElementById("presenceAbsentCount").innerText = String(visibleEntries.filter((entry)=> entry.status === "absent").length);
document.getElementById("presencePendingCount").innerText = String(visibleEntries.filter((entry)=> entry.status === "pending").length);
document.getElementById("presenceReminderText").innerText = canManageAll() ? "Tu peux suivre les reponses de tout le club pour la date selectionnee." : "Tu peux repondre pour toi et gerer les membres de tes poles.";
populatePresenceTargetOptions();
updatePresenceSelfStatus(dateValue);
list.innerHTML = visibleEntries.map((entry)=>{
const canEdit = canManagePresenceForUser(entry);
const noteLine = entry.note ? "<br>Note : " + entry.note : "";
const updatedLine = entry.updatedAt ? "<br>Mis a jour le : " + entry.updatedAt + (entry.updatedBy ? " par " + entry.updatedBy : "") : "";
return "<div class='staff-item presence-item " + entry.status + "'><div class='presence-badge-row'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><span class='presence-status-badge " + entry.status + "'>" + getPresenceStatusLabel(entry.status) + "</span></div><strong>" + entry.displayName + "</strong><div class='staff-meta'>Date : " + dateValue + noteLine + updatedLine + "</div><div class='staff-actions'>" + (canEdit ? "<button class='secondary-btn' type='button' onclick=\"fillPresenceForm('" + entry.username + "')\">Modifier</button>" : "") + "</div></div>";
}).join("") || "<div class='staff-item'><strong>Aucun staff</strong><div class='staff-meta'>Aucun membre visible pour cette presence.</div></div>";
}

function fillPresenceForm(username){
const select = document.getElementById("presenceTargetUser");
const status = document.getElementById("presenceStatus");
const note = document.getElementById("presenceNote");
if(!select || !status || !note){ return; }
select.value = username;
const entry = getPresenceEntryForUser(username, getPresenceDateValue());
status.value = entry ? entry.status : "present";
note.value = entry ? (entry.note || "") : "";
}

function persistPresenceEntry(targetUser, dateValue, status, note = ""){
const entry = {
id: getPresenceEntryForUser(targetUser.username, dateValue)?.id || makeId(),
date: dateValue,
username: targetUser.username,
displayName: targetUser.displayName,
department: targetUser.department,
status: status,
note: note,
updatedBy: currentUser.displayName,
updatedAt: new Date().toLocaleString("fr-FR")
};
setPresenceEntries([entry, ...getPresenceEntries().filter((item)=> !(item.username === targetUser.username && item.date === dateValue))]);
if(targetUser.username === currentUser.username && dateValue === getTodayDateInputValue()){
presencePromptSessionDate = dateValue;
}
return entry;
}

function submitPresence(){
if(!currentUser){ return; }
const dateValue = getPresenceDateValue();
const username = document.getElementById("presenceTargetUser").value;
const status = document.getElementById("presenceStatus").value;
const note = document.getElementById("presenceNote").value.trim();
const message = document.getElementById("presenceMsg");
const targetUser = getUsers().find((user)=> user.username === username);
if(!targetUser){
message.innerText = "Choisis un employe valide.";
return;
}
if(!canManagePresenceForUser(targetUser)){
message.innerText = "Tu ne peux pas modifier cette presence.";
return;
}
persistPresenceEntry(targetUser, dateValue, status, note);
message.innerText = "Presence enregistree pour " + targetUser.displayName + ".";
document.getElementById("presenceNote").value = "";
logAdminAction("presence_update", "presence", "Presence mise a jour", targetUser.displayName + " - " + getPresenceStatusLabel(status));
renderPresence();
renderDashboardSummary();
}

function submitPresencePrompt(status){
if(!currentUser){ return; }
const message = document.getElementById("presencePromptMsg");
if(!["present", "absent", "pending"].includes(status)){
message.innerText = "Choix invalide.";
return;
}
persistPresenceEntry(currentUser, getTodayDateInputValue(), status, "");
hidePresencePromptModal();
renderPresence();
renderDashboardSummary();
}

function getAnnouncementReceiptId(announcementId, username){
return announcementId + "__" + username;
}

function getAnnouncementReadsFor(announcementId){
return getAnnouncementReads().filter((entry)=> entry.announcementId === announcementId);
}

function hasUserReadAnnouncement(entry, user = currentUser){
if(!entry){ return false; }
if(!entry.requireAck){ return true; }
if(!user){ return false; }
return getAnnouncementReadsFor(entry.id).some((receipt)=> receipt.username === user.username);
}

function getAnnouncementAudienceCount(){
return getUsers().filter((user)=> user.active !== false).length || 1;
}

function acknowledgeAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !entry.requireAck || !currentUser || hasUserReadAnnouncement(entry)){ return; }
const receipt = {
id: getAnnouncementReceiptId(entry.id, currentUser.username),
announcementId: entry.id,
username: currentUser.username,
displayName: currentUser.displayName,
uid: currentUser.firebaseUid || "",
readAt: new Date().toISOString()
};
setAnnouncementReads(sortByDateField([receipt, ...getAnnouncementReads().filter((item)=> item.id !== receipt.id)], "readAt"));
renderAnnouncements();
renderDashboardSummary();
}

function refreshPlanningStaffOptions(){
const dataList = document.getElementById("planningStaffList");
if(!dataList){ return; }
dataList.innerHTML = getScopeUsers().map((user)=> "<option value=\"" + user.displayName + "\"></option>").join("");
}

function setPlanningView(mode){
planningViewMode = mode === "month" ? "month" : "week";
document.getElementById("planningWeekBtn").classList.toggle("active-view-btn", planningViewMode === "week");
document.getElementById("planningMonthBtn").classList.toggle("active-view-btn", planningViewMode === "month");
renderPlanning();
}

function getPlanningBaseDate(){
const dateFilter = document.getElementById("planningFilterDate").value;
return dateFilter ? new Date(dateFilter + "T00:00:00") : new Date();
}

function getPlanningWindowEntries(entries){
const baseDate = getPlanningBaseDate();
const start = new Date(baseDate);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
if(planningViewMode === "month"){
start.setDate(1);
end.setMonth(start.getMonth() + 1, 0);
end.setHours(23, 59, 59, 999);
} else {
const weekStart = getStartOfWeek(start);
start.setTime(weekStart.getTime());
end.setTime(weekStart.getTime());
end.setDate(end.getDate() + 6);
end.setHours(23, 59, 59, 999);
}
return entries.filter((entry)=>{
const entryDate = new Date(entry.date + "T00:00:00");
return entryDate >= start && entryDate <= end;
});
}

function findPlanningEntryForUserDate(username, dateKey){
return getPlanningEntries().filter((entry)=> entry.username === username && entry.date === dateKey).sort((first, second)=> first.start.localeCompare(second.start))[0] || null;
}

function getServicePointagesForUserDate(username, dateKey){
return getPointages().filter((entry)=> entry.createdBy === username && toDateKey(entry.savedAt) === dateKey).sort((first, second)=> String(first.savedAt).localeCompare(String(second.savedAt)));
}

function getLateMinutesForEntry(entry){
const firstPointage = getServicePointagesForUserDate(entry.username, entry.date).find((item)=> item.status !== "absent");
if(!firstPointage || !firstPointage.entree || firstPointage.entree === "-"){ return 0; }
const [plannedHours, plannedMinutes] = entry.start.split(":").map(Number);
const [actualHours, actualMinutes] = firstPointage.entree.split(":").map(Number);
return Math.max(0, (actualHours * 60 + actualMinutes) - (plannedHours * 60 + plannedMinutes + 5));
}

function getPlanningStateLabel(entry){
const pointages = getServicePointagesForUserDate(entry.username, entry.date);
if(pointages.some((item)=> item.status === "absent")){ return "Absent"; }
const lateMinutes = getLateMinutesForEntry(entry);
if(lateMinutes > 0){ return "Retard " + lateMinutes + " min"; }
if(pointages.length){ return "Pointe"; }
return new Date(entry.date + "T" + entry.start + ":00") < new Date() ? "A surveiller" : "A venir";
}

function getPointageRangeTotals(username){
const fromValue = document.getElementById("filterPointageFrom").value;
const toValue = document.getElementById("filterPointageTo").value;
const filtered = getVisiblePointages().filter((item)=> !username || item.createdBy === username).filter((item)=>{
const itemDate = toDateKey(item.savedAt);
if(fromValue && itemDate < fromValue){ return false; }
if(toValue && itemDate > toValue){ return false; }
return true;
});
const totalMinutes = filtered.reduce((sum, item)=> sum + getPointageMinutes(item), 0);
let expectedMinutes = 0;
if(fromValue || toValue){
const start = new Date((fromValue || toValue) + "T00:00:00");
const end = new Date((toValue || fromValue) + "T00:00:00");
const diffDays = Math.max(1, Math.floor((end - start) / 86400000) + 1);
expectedMinutes = diffDays * 7 * 60;
}
return { totalMinutes, overtimeMinutes: Math.max(0, totalMinutes - expectedMinutes) };
}

function renderPlanning(){
const container = document.getElementById("planningList");
const summaryContainer = document.getElementById("planningCalendarSummary");
if(!container){ return; }
const dateFilter = document.getElementById("planningFilterDate").value;
const departmentFilter = document.getElementById("planningFilterDepartment").value;
const entries = getVisiblePlanningEntries().filter((entry)=> (!dateFilter || entry.date === dateFilter) && (!departmentFilter || entry.department === departmentFilter));
const windowEntries = getPlanningWindowEntries(entries);
const entriesToRender = windowEntries.length ? windowEntries : entries;
refreshPlanningStaffOptions();
if(summaryContainer){
const groupedDates = entriesToRender.reduce((accumulator, entry)=>{
accumulator[entry.date] = accumulator[entry.date] || [];
accumulator[entry.date].push(entry);
return accumulator;
}, {});
summaryContainer.innerHTML = Object.keys(groupedDates).sort().map((dateKey)=> "<div class='planning-summary-chip " + getDepartmentThemeClass(groupedDates[dateKey][0].department) + "'><strong>" + dateKey + "</strong><span>" + groupedDates[dateKey].length + " service(s)</span></div>").join("") || "<div class='planning-summary-chip'><strong>Aucune plage</strong><span>Pas de service sur cette periode.</span></div>";
}
if(!entriesToRender.length){
container.innerHTML = "<div class='staff-item'><strong>Aucun service</strong><div class='staff-meta'>Aucun planning visible pour le moment.</div></div>";
document.getElementById("nextPlanningInfo").innerText = "Aucun service programme pour le moment.";
return;
}
const nextEntry = [...entriesToRender].sort((first, second)=> (first.date + first.start).localeCompare(second.date + second.start))[0];
document.getElementById("nextPlanningInfo").innerText = nextEntry.displayName + " - " + nextEntry.date + " de " + nextEntry.start + " a " + nextEntry.end + ".";
container.innerHTML = entriesToRender.map((entry)=>{
const canEdit = canEditPlanning() && canManageDepartment(entry.department);
return "<div class='staff-item planning-item " + getDepartmentThemeClass(entry.department) + "'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><strong>" + entry.displayName + "</strong><div class='staff-meta'>Date : " + entry.date + "<br>Service : " + entry.start + " - " + entry.end + "<br>Etat : " + getPlanningStateLabel(entry) + (entry.note ? "<br>Note : " + entry.note : "") + "</div><div class='staff-actions'>" + (canEdit ? "<button class='secondary-btn' onclick=\"editPlanningEntry('" + entry.id + "')\">Modifier</button><button class='secondary-btn' onclick=\"duplicatePlanningEntry('" + entry.id + "')\">Dupliquer</button><button class='danger-btn' onclick=\"deletePlanningEntry('" + entry.id + "')\">Supprimer</button>" : "") + "</div></div>";
}).join("");
}

function resetPlanningForm(clearMessage){
editingPlanningId = null;
document.getElementById("planningEmployee").value = "";
document.getElementById("planningDepartment").value = getManagedDepartments()[0] || "bar";
document.getElementById("planningDate").value = "";
document.getElementById("planningStart").value = "";
document.getElementById("planningEnd").value = "";
document.getElementById("planningNote").value = "";
refreshPlanningStaffOptions();
document.getElementById("planningSubmitBtn").innerText = "Ajouter au planning";
document.getElementById("planningCancelBtn").classList.add("hidden");
if(clearMessage){ document.getElementById("planningMsg").innerText = ""; }
}

function submitPlanningEntry(){
if(!canEditPlanning()){ return; }
const displayName = document.getElementById("planningEmployee").value.trim();
const department = document.getElementById("planningDepartment").value;
const date = document.getElementById("planningDate").value;
const start = document.getElementById("planningStart").value;
const end = document.getElementById("planningEnd").value;
const note = document.getElementById("planningNote").value.trim();
const message = document.getElementById("planningMsg");
if(!displayName || !date || !start || !end){
message.innerText = "Merci de remplir les champs du planning.";
return;
}
if(!canManageDepartment(department)){
message.innerText = "Tu ne peux pas gerer ce pole.";
return;
}
const matchingUser = getUsers().find((user)=> user.displayName.toLowerCase() === displayName.toLowerCase());
const entry = { id: editingPlanningId || makeId(), username: matchingUser ? matchingUser.username : getEmailLocalPart(displayName), displayName, department, date, start, end, note, updatedBy: currentUser.displayName, createdAt: new Date().toISOString() };
setPlanningEntries(sortByDateField([entry, ...getPlanningEntries().filter((item)=> item.id !== entry.id)], "date"));
logAdminAction(editingPlanningId ? "planning_update" : "planning_create", "planning", editingPlanningId ? "Planning modifie" : "Planning ajoute", displayName + " - " + date);
message.innerText = editingPlanningId ? "Planning modifie." : "Planning ajoute.";
resetPlanningForm(true);
renderPlanning();
renderDashboardSummary();
}

function editPlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){ return; }
editingPlanningId = id;
document.getElementById("planningEmployee").value = entry.displayName;
document.getElementById("planningDepartment").value = entry.department;
document.getElementById("planningDate").value = entry.date;
document.getElementById("planningStart").value = entry.start;
document.getElementById("planningEnd").value = entry.end;
document.getElementById("planningNote").value = entry.note || "";
document.getElementById("planningSubmitBtn").innerText = "Modifier le planning";
document.getElementById("planningCancelBtn").classList.remove("hidden");
document.getElementById("planningMsg").innerText = "Modification du planning de " + entry.displayName + ".";
}

function cancelPlanningEdit(){
resetPlanningForm(true);
renderPlanning();
}

function duplicatePlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){ return; }
document.getElementById("planningEmployee").value = entry.displayName;
document.getElementById("planningDepartment").value = entry.department;
document.getElementById("planningDate").value = entry.date;
document.getElementById("planningStart").value = entry.start;
document.getElementById("planningEnd").value = entry.end;
document.getElementById("planningNote").value = entry.note || "";
editingPlanningId = null;
document.getElementById("planningSubmitBtn").innerText = "Ajouter au planning";
document.getElementById("planningCancelBtn").classList.add("hidden");
document.getElementById("planningMsg").innerText = "Planning duplique, ajuste si besoin puis enregistre.";
}

function deletePlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){ return; }
setPlanningEntries(getPlanningEntries().filter((item)=> item.id !== id));
logAdminAction("planning_delete", "planning", "Planning supprime", entry.displayName + " - " + entry.date);
renderPlanning();
renderDashboardSummary();
}

function renderNotifications(){
const container = document.getElementById("notificationsList");
if(!container || !currentUser){ return; }
const visibleNotifications = getVisibleNotifications();
renderAppBadges();
document.getElementById("notificationsUnreadText").innerText = getUnreadNotificationsCount() + " notification(s) non lue(s).";
if(!visibleNotifications.length){
container.innerHTML = "<div class='staff-item notification-item'><strong>Aucune notification</strong><div class='staff-meta'>Aucune alerte visible pour le moment.</div></div>";
return;
}
container.innerHTML = visibleNotifications.map((entry)=>{
const unread = !isNotificationRead(entry);
const readBadge = "<span class='announcement-pill " + (unread ? "unread" : "read") + "'>" + (unread ? "Non lue" : "Lue") + "</span>";
const actionButton = unread ? "<button class='secondary-btn' type='button' onclick=\"markNotificationRead('" + entry.id + "')\">Marquer lu</button>" : "";
const deleteButton = "<button class='danger-btn' type='button' onclick=\"deleteNotification('" + entry.id + "')\">Supprimer</button>";
const openButton = entry.linkPage ? "<button class='primary-btn' type='button' onclick=\"openNotificationPage('" + entry.linkPage + "','" + entry.id + "')\">Ouvrir</button>" : "";
return "<div class='staff-item notification-item " + (unread ? "unread-item" : "") + "'><div class='announcement-meta-row'>" + readBadge + "</div><strong>" + entry.title + "</strong><div class='staff-meta'>" + entry.body + "<br>Par : " + entry.createdBy + "<br>Le : " + formatNotificationDate(entry.createdAt) + "</div><div class='staff-actions'>" + actionButton + openButton + deleteButton + "</div></div>";
}).join("");
}

function renderInternalRequests(){
const container = document.getElementById("requestsList");
if(!container || !currentUser){ return; }
const visibleRequests = getVisibleInternalRequests();
if(!visibleRequests.length){
container.innerHTML = "<div class='staff-item'><strong>Aucune demande</strong><div class='staff-meta'>Aucune demande visible pour le moment.</div></div>";
return;
}
container.innerHTML = visibleRequests.map((entry)=>{
const canReview = canManageRequestsForDepartment(entry.department);
const reviewActions = canReview ? "<div class='request-review-box'><label for='request-review-reason-" + entry.id + "'>Motif</label><textarea id='request-review-reason-" + entry.id + "' class='mini-editor' placeholder='Motif de la reponse, surtout en cas de refus.'>" + (entry.reviewReason || "") + "</textarea><div class='staff-actions'><button class='secondary-btn' type='button' onclick=\"changeRequestStatus('" + entry.id + "','approved')\">Accepter</button><button class='secondary-btn' type='button' onclick=\"changeRequestStatus('" + entry.id + "','pending')\">En attente</button><button class='danger-btn' type='button' onclick=\"changeRequestStatus('" + entry.id + "','refused')\">Refuser</button></div></div>" : "";
const targetLine = entry.targetRole ? "<br>" + (entry.type === "role" ? "Poste demande : " : "Categorie : ") + entry.targetRole : "";
const reasonLine = entry.reviewReason ? "<br>Motif : " + entry.reviewReason : "";
return "<div class='staff-item'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><div class='request-item-header'><strong>" + (entry.type === "role" ? "Demande de poste" : "Signalement interne") + "</strong><span class='announcement-pill ack request-status-badge'>" + entry.status + "</span></div><div class='staff-meta'>Par : " + entry.displayName + targetLine + "<br>Details : " + entry.details + "<br>Cree le : " + entry.createdAt + (entry.reviewedBy ? "<br>Traite par : " + entry.reviewedBy : "") + reasonLine + "</div>" + reviewActions + "</div>";
}).join("");
}

async function submitInternalRequest(){
if(!currentUser){ return; }
const type = document.getElementById("requestType").value;
const department = document.getElementById("requestDepartment").value;
const targetRole = document.getElementById("requestRoleTarget").value.trim();
const details = document.getElementById("requestDetails").value.trim();
if(!details){
showMessage("requestMsg", "Explique ta demande ou ton signalement.", true);
return;
}
const entry = {
id: makeId(),
type,
department,
targetRole,
details,
status: "En attente",
createdBy: currentUser.username,
displayName: currentUser.displayName,
createdAt: new Date().toLocaleString("fr-FR")
};
await saveInternalRequests([entry, ...getInternalRequests()]);
await createNotification({
type: "request",
title: "Nouvelle demande interne",
body: entry.displayName + " a envoye " + (entry.type === "role" ? "une demande de poste" : "un signalement interne") + " pour le pole " + getDepartmentLabel(entry.department) + ".",
department: entry.department,
audience: "admins",
linkPage: "demandes"
});
logAdminAction("request_create", "request", "Nouvelle demande interne", currentUser.displayName + " - " + getDepartmentLabel(department));
document.getElementById("requestDetails").value = "";
document.getElementById("requestRoleTarget").value = "";
showMessage("requestMsg", "Demande envoyee.");
renderInternalRequests();
renderNotifications();
renderDashboardSummary();
}

async function changeRequestStatus(id, status){
const requests = getInternalRequests();
const target = requests.find((entry)=> entry.id === id);
if(!target || !canManageRequestsForDepartment(target.department)){ return; }
const reasonField = document.getElementById("request-review-reason-" + id);
const reviewReason = reasonField ? reasonField.value.trim() : "";
if(status === "refused" && !reviewReason){
showMessage("requestMsg", "Ajoute un motif avant de refuser la demande.", true);
return;
}
target.status = status === "approved" ? "Approuvee" : status === "refused" ? "Refusee" : "En attente";
target.reviewedBy = currentUser.displayName;
target.reviewedAt = new Date().toLocaleString("fr-FR");
target.reviewReason = status === "pending" ? "" : reviewReason;
await saveInternalRequests(requests);
await createNotification({
type: "request_status",
title: "Mise a jour de ta demande",
body: "Ta demande interne a ete mise a jour par " + currentUser.displayName + " : " + target.status + (target.reviewReason ? " | Motif : " + target.reviewReason : "") + ".",
department: target.department,
audience: "user",
recipientUsername: target.createdBy,
linkPage: "demandes"
});
logAdminAction("request_status", "request", "Statut demande modifie", target.displayName + " - " + target.status);
renderInternalRequests();
renderNotifications();
renderDashboardSummary();
}

function renderTrainingRequests(){
const container = document.getElementById("trainingRequestsList");
if(!container || !currentUser){ return; }
const visibleRequests = getVisibleTrainingRequests();
renderAppBadges();
if(!visibleRequests.length){
container.innerHTML = "<div class='staff-item training-item'><strong>Aucune demande</strong><div class='staff-meta'>Aucune demande de formation visible pour le moment.</div></div>";
return;
}
container.innerHTML = visibleRequests.map((entry)=>{
const canReview = canManageTrainingForDepartment(entry.department);
const reviewActions = canReview ? "<div class='staff-actions'><button class='secondary-btn' type='button' onclick=\"changeTrainingStatus('" + entry.id + "','scheduled')\">A planifier</button><button class='secondary-btn' type='button' onclick=\"changeTrainingStatus('" + entry.id + "','approved')\">Valider</button><button class='danger-btn' type='button' onclick=\"changeTrainingStatus('" + entry.id + "','refused')\">Refuser</button></div>" : "";
return "<div class='staff-item training-item'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><strong>" + getFormationLabel(entry.trainingType) + "</strong><div class='staff-meta'>Par : " + entry.displayName + "<br>Statut : " + entry.status + "<br>Details : " + entry.details + "<br>Cree le : " + entry.createdAt + (entry.reviewedBy ? "<br>Traite par : " + entry.reviewedBy : "") + "</div>" + reviewActions + "</div>";
}).join("");
}

async function submitTrainingRequest(){
if(!currentUser){ return; }
const trainingType = document.getElementById("trainingType").value;
const department = document.getElementById("trainingDepartment").value;
const details = document.getElementById("trainingDetails").value.trim();
if(!details){
showMessage("trainingMsg", "Explique la formation demandee.", true);
return;
}
const entry = {
id: makeId(),
trainingType,
department,
details,
status: "En attente",
createdBy: currentUser.username,
displayName: currentUser.displayName,
createdAt: new Date().toLocaleString("fr-FR")
};
await saveTrainingRequests([entry, ...getTrainingRequests()]);
await createNotification({
type: "training",
title: "Nouvelle demande de formation",
body: entry.displayName + " a demande la formation " + getFormationLabel(trainingType) + ".",
department: entry.department,
audience: "admins",
linkPage: "formations"
});
logAdminAction("training_create", "training", "Nouvelle demande de formation", entry.displayName + " - " + getFormationLabel(trainingType));
document.getElementById("trainingDetails").value = "";
showMessage("trainingMsg", "Demande de formation envoyee.");
renderTrainingRequests();
renderNotifications();
}

async function changeTrainingStatus(id, status){
const requests = getTrainingRequests();
const target = requests.find((entry)=> entry.id === id);
if(!target || !canManageTrainingForDepartment(target.department)){ return; }
target.status = status === "approved" ? "Validee" : status === "refused" ? "Refusee" : "A planifier";
target.reviewedBy = currentUser.displayName;
target.reviewedAt = new Date().toLocaleString("fr-FR");
await saveTrainingRequests(requests);
await createNotification({
type: "training_status",
title: "Mise a jour de ta formation",
body: "Ta demande de formation " + getFormationLabel(target.trainingType) + " a ete mise a jour par " + currentUser.displayName + " : " + target.status + ".",
department: target.department,
audience: "user",
recipientUsername: target.createdBy,
linkPage: "formations"
});
logAdminAction("training_status", "training", "Statut formation modifie", target.displayName + " - " + target.status);
renderTrainingRequests();
renderNotifications();
}

function renderEmergencyContacts(){
const contacts = getEmergencyContacts();
const readOnly = !hasAdminAccess();
document.getElementById("contactDirection").value = contacts.direction || "";
document.getElementById("contactSecurity").value = contacts.security || "";
document.getElementById("contactUrgence").value = contacts.urgence || "";
document.getElementById("contactSuppliers").value = contacts.suppliers || "";
document.getElementById("contactUseful").value = contacts.useful || "";
["contactDirection", "contactSecurity", "contactUrgence", "contactSuppliers", "contactUseful"].forEach((id)=>{
document.getElementById(id).readOnly = readOnly;
});
document.querySelectorAll("#contacts .save-section-btn").forEach((button)=>{
button.classList.toggle("hidden", !hasAdminAccess());
});
}

async function saveContactSection(sectionKey){
if(!hasAdminAccess()){ return; }
const contacts = getEmergencyContacts();
const fieldMap = {
direction: "contactDirection",
security: "contactSecurity",
urgence: "contactUrgence",
suppliers: "contactSuppliers",
useful: "contactUseful"
};
contacts[sectionKey] = document.getElementById(fieldMap[sectionKey]).value.trim();
await saveEmergencyContacts(contacts);
showMessage("contactsMsg", "Contacts mis a jour.");
logAdminAction("contacts_update", "contacts", "Contacts urgence modifies", sectionKey);
renderEmergencyContacts();
}

function resetAnnouncementForm(clearMessage){
editingAnnouncementId = null;
document.getElementById("announcementTitle").value = "";
document.getElementById("announcementPriority").value = "normal";
document.getElementById("announcementUntil").value = "";
document.getElementById("announcementRequireAck").checked = false;
document.getElementById("announcementBody").value = "";
document.getElementById("announcementSubmitBtn").innerText = "Publier l'annonce";
document.getElementById("announcementCancelBtn").classList.add("hidden");
if(clearMessage){ document.getElementById("announcementMsg").innerText = ""; }
}

function renderAnnouncements(){
const container = document.getElementById("announcementsList");
if(!container){ return; }
const announcements = getVisibleAnnouncements();
if(!announcements.length){
container.innerHTML = "<div class='staff-item'><strong>Aucune annonce</strong><div class='staff-meta'>Aucune note interne active pour le moment.</div></div>";
return;
}
container.innerHTML = announcements.map((entry)=>{
const receipts = getAnnouncementReadsFor(entry.id);
const readCount = receipts.length;
const audienceCount = getAnnouncementAudienceCount();
const readNames = receipts.map((receipt)=> receipt.displayName).join(", ");
const requiresAck = entry.requireAck === true;
const isRead = hasUserReadAnnouncement(entry);
const ackButton = requiresAck && !isRead ? "<button class='primary-btn' onclick=\"acknowledgeAnnouncement('" + entry.id + "')\">Marquer comme lu</button>" : "";
const editButtons = canEditAnnouncements() ? "<button class='secondary-btn' onclick=\"editAnnouncement('" + entry.id + "')\">Modifier</button><button class='danger-btn' onclick=\"deleteAnnouncement('" + entry.id + "')\">Supprimer</button>" : "";
const readState = requiresAck ? "<span class='announcement-pill " + (isRead ? "read" : "unread") + "'>" + (isRead ? "Lu" : "A lire") + "</span>" : "";
const ackState = requiresAck ? "<span class='announcement-pill ack'>Accuses : " + readCount + "/" + audienceCount + "</span>" : "";
const readList = requiresAck && canEditAnnouncements() ? "<div class='announcement-read-list'>Lus par : " + (readNames || "personne pour le moment") + ".</div>" : "";
return "<div class='staff-item announcement-item priority-" + entry.priority + "'><span class='dept-badge'>" + entry.priority + "</span><strong>" + entry.title + "</strong><div class='staff-meta'>" + entry.body + "<br>Visible jusqu'au : " + (entry.visibleUntil || "sans limite") + "<br>Publie par : " + entry.createdBy + "</div><div class='announcement-meta-row'>" + readState + ackState + "</div>" + readList + "<div class='announcement-card-actions'>" + ackButton + editButtons + "</div></div>";
}).join("");
}

function submitAnnouncement(){
if(!canEditAnnouncements()){ return; }
const title = document.getElementById("announcementTitle").value.trim();
const priority = document.getElementById("announcementPriority").value;
const visibleUntil = document.getElementById("announcementUntil").value;
const requireAck = document.getElementById("announcementRequireAck").checked;
const body = document.getElementById("announcementBody").value.trim();
const message = document.getElementById("announcementMsg");
const previousEntry = editingAnnouncementId ? getAnnouncements().find((item)=> item.id === editingAnnouncementId) : null;
if(!title || !body){
message.innerText = "Merci de remplir le titre et le message.";
return;
}
const entry = { id: editingAnnouncementId || makeId(), title, priority, visibleUntil, requireAck, body, createdBy: currentUser.displayName, createdAt: new Date().toISOString() };
setAnnouncements(sortByDateField([entry, ...getAnnouncements().filter((item)=> item.id !== entry.id)]));
if(previousEntry){
setAnnouncementReads(getAnnouncementReads().filter((item)=> item.announcementId !== entry.id));
}
createNotification({
type: "announcement",
title: editingAnnouncementId ? "Annonce mise a jour" : entry.title,
body: entry.body,
department: "all",
audience: "all",
linkPage: "annonces"
});
logAdminAction(editingAnnouncementId ? "announcement_update" : "announcement_create", "announcement", editingAnnouncementId ? "Annonce modifiee" : "Annonce creee", title);
message.innerText = editingAnnouncementId ? "Annonce modifiee." : "Annonce publiee.";
resetAnnouncementForm(true);
renderAnnouncements();
renderNotifications();
renderDashboardSummary();
}

function editAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !canEditAnnouncements()){ return; }
editingAnnouncementId = id;
document.getElementById("announcementTitle").value = entry.title;
document.getElementById("announcementPriority").value = entry.priority;
document.getElementById("announcementUntil").value = entry.visibleUntil || "";
document.getElementById("announcementRequireAck").checked = entry.requireAck === true;
document.getElementById("announcementBody").value = entry.body;
document.getElementById("announcementSubmitBtn").innerText = "Modifier l'annonce";
document.getElementById("announcementCancelBtn").classList.remove("hidden");
document.getElementById("announcementMsg").innerText = "Modification de l'annonce " + entry.title + ".";
}

function cancelAnnouncementEdit(){
resetAnnouncementForm(true);
renderAnnouncements();
}

function deleteAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !canEditAnnouncements()){ return; }
setAnnouncements(getAnnouncements().filter((item)=> item.id !== id));
setAnnouncementReads(getAnnouncementReads().filter((item)=> item.announcementId !== id));
logAdminAction("announcement_delete", "announcement", "Annonce supprimee", entry.title);
renderAnnouncements();
renderDashboardSummary();
}

function renderLogs(){
const container = document.getElementById("logsList");
if(!container){ return; }
if(!canViewLogs()){
container.innerHTML = "<div class='staff-item'><strong>Acces reserve</strong><div class='staff-meta'>Seule la direction peut consulter les logs admin.</div></div>";
return;
}
const logs = getAdminLogs();
container.innerHTML = logs.length ? logs.map((entry)=>{
const viewed = entry.viewed === true;
const viewedBadge = "<span class='announcement-pill " + (viewed ? "read" : "unread") + "'>" + (viewed ? "Vu" : "Non vu") + "</span>";
const toggleButton = "<button class='secondary-btn' type='button' onclick=\"toggleLogViewed('" + entry.id + "')\">" + (viewed ? "Marquer non vu" : "Marquer vu") + "</button>";
return "<div class='staff-item'><div class='announcement-meta-row'><span class='dept-badge'>" + entry.action + "</span>" + viewedBadge + "</div><strong>" + entry.title + "</strong><div class='staff-meta'>" + entry.details + "<br>Par : " + entry.createdBy + "<br>Le : " + entry.createdAt + "</div><div class='staff-actions'>" + toggleButton + "</div></div>";
}).join("") : "<div class='staff-item'><strong>Aucun log</strong><div class='staff-meta'>Aucune action importante enregistree.</div></div>";
}

function toggleLogViewed(id){
if(!canViewLogs()){ return; }
const logs = getAdminLogs();
const targetLog = logs.find((entry)=> entry.id === id);
if(!targetLog){ return; }
targetLog.viewed = !(targetLog.viewed === true);
setAdminLogs([...logs]);
showMessage("logsMsg", targetLog.viewed ? "Log marque comme vu." : "Log remis en non vu.");
renderLogs();
}

function markAllLogsViewed(){
if(!canViewLogs()){ return; }
const logs = getAdminLogs();
const pendingLogs = logs.filter((entry)=> entry.viewed !== true);
if(!pendingLogs.length){
showMessage("logsMsg", "Tous les logs sont deja vus.");
return;
}
setAdminLogs(logs.map((entry)=> ({ ...entry, viewed: true })));
showMessage("logsMsg", "Tous les logs ont ete marques comme vus.");
renderLogs();
}

function deleteViewedLogs(){
if(!canViewLogs()){ return; }
const logs = getAdminLogs();
const viewedLogs = logs.filter((entry)=> entry.viewed === true);
if(!viewedLogs.length){
showMessage("logsMsg", "Aucun log vu a supprimer.");
return;
}
setAdminLogs(logs.filter((entry)=> entry.viewed !== true));
showMessage("logsMsg", viewedLogs.length + " log(s) vu(s) supprime(s).");
renderLogs();
}

function renderArchives(){
const staffContainer = document.getElementById("archivedStaffList");
const pointageContainer = document.getElementById("archivedPointagesList");
const noteContainer = document.getElementById("archivedNotesList");
if(!staffContainer || !pointageContainer || !noteContainer){ return; }
if(!canViewArchives()){
staffContainer.innerHTML = "<div class='archive-item'>Acces reserve a la direction.</div>";
pointageContainer.innerHTML = "<div class='archive-item'>Acces reserve a la direction.</div>";
noteContainer.innerHTML = "<div class='archive-item'>Acces reserve a la direction.</div>";
return;
}
staffContainer.innerHTML = getArchivedStaff().slice(0, 20).map((entry)=> "<div class='archive-item'><strong>" + entry.displayName + "</strong><span>" + getDepartmentLabel(entry.department) + " - " + entry.archivedAt + "</span></div>").join("") || "<div class='archive-item'>Aucun ancien employe.</div>";
pointageContainer.innerHTML = getArchivedPointages().slice(0, 20).map((entry)=> "<div class='archive-item'><strong>" + entry.nom + "</strong><span>" + entry.savedAt + " - " + getDepartmentLabel(entry.department) + "</span></div>").join("") || "<div class='archive-item'>Aucun pointage archive.</div>";
noteContainer.innerHTML = getArchivedNotes().slice(0, 20).map((entry)=> "<div class='archive-item'><strong>" + entry.sectionId + "</strong><span>" + entry.updatedAt + "</span></div>").join("") || "<div class='archive-item'>Aucune note archivee.</div>";
}

function renderDashboardSummary(){
const pointages = getVisiblePointages();
const todayKey = toDateKey(new Date().toISOString());
const todayPointages = pointages.filter((item)=> toDateKey(item.savedAt) === todayKey);
const todayPresence = getPresenceEntriesForDate(todayKey).filter((entry)=> canManageAll() || entry.username === currentUser.username || canManageDepartment(entry.department));
const activeEntries = new Map();
todayPointages.forEach((entry)=> activeEntries.set(entry.createdBy, entry));
const connectedStaff = Array.from(activeEntries.values()).filter((entry)=> entry.status === "en-service").length;
const absences = todayPointages.filter((entry)=> entry.status === "absent").length;
const presencePending = getPresenceScopeUsers().filter((user)=> !getPresenceEntryForUser(user.username, todayKey) || getPresenceEntryForUser(user.username, todayKey).status === "pending").length;
const planningToday = getVisiblePlanningEntries().filter((entry)=> entry.date === todayKey);
const latestPointage = [...pointages].sort((first, second)=> String(second.savedAt).localeCompare(String(first.savedAt)))[0];
const announcement = getVisibleAnnouncements()[0];
const unreadNotifications = getUnreadNotificationsCount();
const announcementReadCount = announcement ? getAnnouncementReadsFor(announcement.id).length : 0;
const announcementAudienceCount = getAnnouncementAudienceCount();
const announcementIsRead = announcement ? hasUserReadAnnouncement(announcement) : true;
const announcementAckSummary = announcement && announcement.requireAck ? "<div class='announcement-meta-row'><span class='announcement-pill ack'>Accuses : " + announcementReadCount + "/" + announcementAudienceCount + "</span><span class='announcement-pill " + (announcementIsRead ? "read" : "unread") + "'>" + (announcementIsRead ? "Lu" : "A lire") + "</span></div>" : "";
const announcementAckButton = announcement && announcement.requireAck && !announcementIsRead ? "<div class='announcement-card-actions'><button class='primary-btn' type='button' onclick=\"acknowledgeAnnouncement('" + announcement.id + "')\">Marquer comme lu</button></div>" : "";
const lateEntries = planningToday.filter((entry)=> getLateMinutesForEntry(entry) > 0);
const upcomingEntries = planningToday.filter((entry)=>{
const targetDate = new Date(entry.date + "T" + entry.start + ":00");
const diff = targetDate.getTime() - Date.now();
return diff >= 0 && diff <= 2 * 60 * 60 * 1000;
});
const underStaffedByDepartment = Object.entries(planningToday.reduce((accumulator, entry)=>{
accumulator[entry.department] = accumulator[entry.department] || { planned: new Set(), active: new Set() };
accumulator[entry.department].planned.add(entry.username);
getServicePointagesForUserDate(entry.username, entry.date).filter((item)=> item.status === "en-service").forEach(()=> accumulator[entry.department].active.add(entry.username));
return accumulator;
}, {})).filter(([, value])=> value.planned.size > value.active.size).map(([department, value])=> getDepartmentLabel(department) + " : " + (value.planned.size - value.active.size) + " manque(s)");
document.getElementById("connectedStaffCount").innerText = String(connectedStaff);
document.getElementById("todayPointageCount").innerText = String(todayPointages.length);
document.getElementById("todayAbsenceCount").innerText = String(absences);
document.getElementById("todayPlanningCount").innerText = String(planningToday.length);
document.getElementById("dashboardLastPointage").innerHTML = latestPointage ? "<strong>" + latestPointage.nom + "</strong><p class='section-text'>" + getStatusLabel(latestPointage.status) + " - " + latestPointage.savedAt + "</p>" : "<p class='section-text'>Aucun pointage recent.</p>";
document.getElementById("dashboardAnnouncementPreview").innerHTML = announcement ? "<strong>" + announcement.title + "</strong><p class='section-text'>" + announcement.body + "</p>" + announcementAckSummary + announcementAckButton : "<p class='section-text'>Aucune annonce active.</p>";
document.getElementById("dashboardOpsList").innerHTML = [
absences ? absences + " absence(s) aujourd'hui." : "Aucune absence signalee aujourd'hui.",
lateEntries.length ? lateEntries.map((entry)=> entry.displayName + " en retard (" + getLateMinutesForEntry(entry) + " min)").join("<br>") : "Aucun retard detecte.",
underStaffedByDepartment.length ? underStaffedByDepartment.join("<br>") : "Aucun pole en sous-effectif.",
presencePending ? presencePending + " reponse(s) de presence en attente." : "Toutes les presences sont renseignees."
].map((entry)=> "<div class='dashboard-alert-item'>" + entry + "</div>").join("");
document.getElementById("dashboardUpcomingList").innerHTML = upcomingEntries.length ? upcomingEntries.map((entry)=> "<div class='dashboard-alert-item'><strong>" + entry.displayName + "</strong><br>" + getDepartmentLabel(entry.department) + " - " + entry.start + "</div>").join("") : "<div class='dashboard-alert-item'>Aucune prise de service dans les 2 prochaines heures.</div>";
const alerts = [];
if(absences){ alerts.push(absences + " absence(s) aujourd'hui."); }
if(lateEntries.length){ alerts.push(lateEntries.length + " retard(s) detecte(s)."); }
if(planningToday.length && connectedStaff < planningToday.length){ alerts.push((planningToday.length - connectedStaff) + " staff attendu(s) pas encore en service."); }
if(todayPresence.length && presencePending){ alerts.push(presencePending + " presence(s) en attente."); }
if(announcement && announcement.priority === "urgent"){ alerts.push("Annonce urgente active sur le club."); }
if(unreadNotifications){ alerts.push(unreadNotifications + " notification(s) non lue(s)."); }
if(!alerts.length){ alerts.push("Aucune alerte critique pour le moment."); }
document.getElementById("dashboardAlertsList").innerHTML = alerts.map((entry)=> "<div class='dashboard-alert-item'>" + entry + "</div>").join("");
const urgentBanner = document.getElementById("urgentBanner");
if(urgentBanner){
if(announcement && announcement.priority === "urgent"){
urgentBanner.classList.remove("hidden");
urgentBanner.innerHTML = "<strong>Urgent :</strong> " + announcement.title + " - " + announcement.body + (announcement.requireAck ? " | " + announcementReadCount + "/" + announcementAudienceCount + " lus" : "") + (announcement.requireAck && !announcementIsRead ? " <button class='secondary-btn' type='button' onclick=\"acknowledgeAnnouncement('" + announcement.id + "')\">Lu</button>" : "");
} else {
urgentBanner.classList.add("hidden");
urgentBanner.innerHTML = "";
}
}
}

function showPointagePerson(username){
selectedPointageUser = username;
renderPointages();
}

function resetStaffForm(clearMessage){
editingUsername = null;
document.getElementById("newDisplayName").value = "";
document.getElementById("newEmail").value = "";
document.getElementById("newDiscordId").value = "";
document.getElementById("newPassword").value = "";
document.getElementById("newDateJoined").value = getTodayDateInputValue();
document.getElementById("newActive").checked = true;
document.getElementById("newMustChangePassword").checked = false;
document.getElementById("newEmail").readOnly = false;
document.getElementById("newRole").value = "staff";
document.getElementById("newDepartment").value = canManageAll() ? "bar" : currentUser ? currentUser.department : "bar";
document.getElementById("staffSubmitBtn").innerText = "Ajouter le compte";
document.getElementById("staffCancelBtn").classList.add("hidden");
if(clearMessage){
document.getElementById("staffMsg").innerText = "";
}
updateCredentialsPreview("");
}

function renderStaffList(){
const container = document.getElementById("staffList");
if(!container){ return; }
const visibleUsers = getScopeUsers().filter((user)=> user.role !== "boss");
if(!visibleUsers.length){
container.innerHTML = "<div class='staff-item'><strong>Aucun employe</strong><div class='staff-meta'>Aucun compte visible dans ton perimetre.</div></div>";
return;
}

container.innerHTML = visibleUsers.map((user)=>{
const editButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"editStaff('" + user.username + "')\">Modifier</button>" : "";
const toggleButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"toggleStaffActive('" + user.username + "')\">" + (user.active === false ? "Reactiver" : "Desactiver") + "</button>" : "";
const copyButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"copyStaffCredentials('" + user.username + "')\">Identifiants</button>" : "";
const deleteButton = canManageUser(user) && isBossUser() ? "<button class='danger-btn' onclick=\"deleteStaff('" + user.username + "')\">Supprimer</button>" : "";
return "<div class='staff-item'><span class='dept-badge'>" + getDepartmentLabel(user.department) + "</span><strong>" + user.displayName + "</strong><div class='staff-meta'>Email : " + getUserEmail(user) + "<br>Discord ID : " + (user.discordId || "-") + "<br>Role : " + getRoleLabel(user) + "<br>Statut : " + getAccountStatusLabel(user) + "<br>Date d'entree : " + (user.dateJoined || "-") + (user.mustChangePassword ? "<br>Mot de passe : changement force a la prochaine connexion" : "") + "</div><div class='staff-actions'>" + editButton + toggleButton + copyButton + deleteButton + "</div></div>";
}).join("");
}

function addStaff(){
if(!canManageStaff()){ return; }
const displayName = document.getElementById("newDisplayName").value.trim();
const email = document.getElementById("newEmail").value.trim().toLowerCase();
const discordId = (document.getElementById("newDiscordId").value || "").trim();
const username = getEmailLocalPart(email);
const password = document.getElementById("newPassword").value.trim();
const role = canManageAll() ? document.getElementById("newRole").value : "staff";
const department = document.getElementById("newDepartment").value;
const dateJoined = document.getElementById("newDateJoined").value || getTodayDateInputValue();
const active = document.getElementById("newActive").checked;
const mustChangePassword = document.getElementById("newMustChangePassword").checked;
const message = document.getElementById("staffMsg");

if(!displayName || !email || !password){
message.innerText = "Merci de remplir tous les champs du nouveau compte.";
return;
}
if(!canManageDepartment(department)){
message.innerText = "Tu ne peux pas creer un compte sur ce pole.";
return;
}

const users = getUsers();
if(users.some((user)=> user.username === username || (user.email && user.email.toLowerCase() === email))){
message.innerText = "Cet email existe deja.";
return;
}
if(discordId && users.some((user)=> user.discordId && user.discordId === discordId)){
message.innerText = "Ce Discord ID est deja utilise.";
return;
}

users.push({ username, email, discordId, password, role, department, displayName, dateJoined, active, mustChangePassword });
setUsers(users);
updateCredentialsPreview(buildCredentialsMessage({ username, email, discordId, password, role, department, displayName, dateJoined, active, mustChangePassword }, password));
logAdminAction("staff_create", "staff", "Compte staff cree", displayName + " - " + getDepartmentLabel(department));
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
document.getElementById("newDiscordId").value = targetUser.discordId || "";
document.getElementById("newPassword").value = targetUser.password;
document.getElementById("newPassword").placeholder = "Mot de passe du compte";
document.getElementById("newRole").value = canManageAll() ? targetUser.role : "staff";
document.getElementById("newDepartment").value = targetUser.department;
document.getElementById("newDateJoined").value = targetUser.dateJoined || "";
document.getElementById("newActive").checked = targetUser.active !== false;
document.getElementById("newMustChangePassword").checked = targetUser.mustChangePassword === true;
document.getElementById("newEmail").readOnly = false;
document.getElementById("staffSubmitBtn").innerText = "Modifier le compte";
document.getElementById("staffCancelBtn").classList.remove("hidden");
document.getElementById("staffMsg").innerText = "Mode modification actif pour " + targetUser.displayName + ".";
}

function updateStaff(){
const users = getUsers();
const targetUser = users.find((user)=> user.username === editingUsername);
if(!canManageUser(targetUser)){ return; }

const displayName = document.getElementById("newDisplayName").value.trim();
const email = document.getElementById("newEmail").value.trim().toLowerCase();
const discordId = (document.getElementById("newDiscordId").value || "").trim();
const password = document.getElementById("newPassword").value.trim();
const role = canManageAll() ? document.getElementById("newRole").value : "staff";
const department = document.getElementById("newDepartment").value;
const dateJoined = document.getElementById("newDateJoined").value || targetUser.dateJoined || getTodayDateInputValue();
const active = document.getElementById("newActive").checked;
const mustChangePassword = document.getElementById("newMustChangePassword").checked;
const message = document.getElementById("staffMsg");

if(!displayName || !email || !password){
message.innerText = "Merci de remplir les champs obligatoires.";
return;
}
if(!canManageDepartment(department)){
message.innerText = "Tu ne peux pas modifier un compte sur ce pole.";
return;
}
const nextUsername = getEmailLocalPart(email);
if(users.some((user)=> user.username !== editingUsername && (user.username === nextUsername || (user.email && user.email.toLowerCase() === email)))){
message.innerText = "Cette adresse mail existe deja.";
return;
}
if(discordId && users.some((user)=> user.username !== editingUsername && user.discordId && user.discordId === discordId)){
message.innerText = "Ce Discord ID est deja utilise.";
return;
}
const previousUsername = targetUser.username;

targetUser.displayName = displayName;
targetUser.email = email;
targetUser.username = nextUsername;
targetUser.discordId = discordId;
targetUser.password = password;
targetUser.role = role;
targetUser.department = department;
targetUser.dateJoined = dateJoined;
targetUser.active = active;
targetUser.mustChangePassword = mustChangePassword;
setUsers(users);
updateCredentialsPreview(buildCredentialsMessage(targetUser));

setPointages(getPointages().map((item)=> item.createdBy === previousUsername ? { ...item, nom: displayName, department: department, createdBy: nextUsername } : item));

if(currentUser.username === previousUsername){
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
}

logAdminAction("staff_update", "staff", "Compte staff modifie", displayName + " - " + getDepartmentLabel(department));
message.innerText = "Compte modifie pour " + displayName + ".";
resetStaffForm(true);
renderApp();
show("staff");
}

function submitStaffForm(){
if(editingUsername){
updateStaff();
return;
}
addStaff();
}

function cancelEditStaff(){
resetStaffForm(true);
renderStaffList();
}

function deleteStaff(username){
const users = getUsers();
const targetUser = users.find((user)=> user.username === username);
if(!canManageUser(targetUser) || !isBossUser()){ return; }
setArchivedStaff([{ ...targetUser, id: makeId(), archivedAt: new Date().toISOString(), archivedBy: currentUser.displayName }, ...getArchivedStaff()].slice(0, 200));
setUsers(users.filter((user)=> user.username !== username));
setPointages(getPointages().filter((item)=> item.createdBy !== username));
logAdminAction("staff_delete", "staff", "Compte staff supprime", targetUser.displayName + " - " + getDepartmentLabel(targetUser.department));
document.getElementById("staffMsg").innerText = "Compte supprime.";
resetStaffForm(false);
renderApp();
show("staff");
}

function toggleStaffActive(username){
const users = getUsers();
const targetUser = users.find((user)=> user.username === username);
if(!canManageUser(targetUser)){ return; }
targetUser.active = targetUser.active === false ? true : false;
setUsers(users);
logAdminAction(targetUser.active ? "staff_activate" : "staff_deactivate", "staff", targetUser.active ? "Compte reactive" : "Compte desactive", targetUser.displayName + " - " + getDepartmentLabel(targetUser.department));
document.getElementById("staffMsg").innerText = targetUser.active ? "Compte reactive." : "Compte desactive sans suppression.";
renderApp();
show("staff");
}

function show(page){
currentPageId = page;
document.body.classList.remove("mobile-menu-open");
document.querySelectorAll(".page").forEach((section)=>{ section.style.display = "none"; });
document.querySelectorAll(".nav-btn").forEach((button)=>{ button.classList.toggle("active", button.dataset.page === page); });
document.getElementById(page).style.display = "block";
if(page === "notifications"){ renderNotifications(); }
if(page === "pointages"){ renderPointages(); }
if(page === "presence"){ renderPresence(); }
if(page === "staff" && canManageStaff()){ renderStaffList(); }
if(page === "planning"){ renderPlanning(); }
if(page === "demandes"){ renderInternalRequests(); }
if(page === "formations"){ renderTrainingRequests(); }
if(page === "contacts"){ renderEmergencyContacts(); }
if(page === "annonces"){ renderAnnouncements(); }
if(page === "logs"){ renderLogs(); }
if(page === "archives"){ renderArchives(); }
}

function toggleDashboardGroup(group){
const target = document.getElementById("dashboard-group-" + group);
if(!target){
return;
}

const shouldOpen = target.classList.contains("hidden");
document.querySelectorAll(".dashboard-group-body").forEach((body)=>{
body.classList.add("hidden");
});
document.querySelectorAll(".staff-detail-panel").forEach((panel)=>{
panel.classList.add("hidden");
});
document.querySelectorAll(".hierarchy-person-card").forEach((card)=>{
card.classList.remove("active-person-card");
});

if(shouldOpen){
target.classList.remove("hidden");
}
}

function showStaffCard(person){
document.querySelectorAll(".staff-detail-panel").forEach((panel)=>{
panel.classList.add("hidden");
});
document.querySelectorAll(".hierarchy-person-card").forEach((card)=>{
card.classList.toggle("active-person-card", card.dataset.person === person);
});
const target = document.getElementById("staff-panel-" + person);
if(target){
target.classList.remove("hidden");
}
}

function toggleDocSection(section){
const target = document.getElementById("doc-section-" + section);
if(!target){
return;
}

const shouldOpen = target.classList.contains("hidden");
document.querySelectorAll(".doc-section-body").forEach((body)=>{
body.classList.add("hidden");
});

if(shouldOpen){
target.classList.remove("hidden");
}
}

function updateRequestTargetOptions(){
const typeField = document.getElementById("requestType");
const departmentLabel = document.getElementById("requestDepartmentLabel");
const targetLabel = document.getElementById("requestRoleTargetLabel");
const targetSelect = document.getElementById("requestRoleTarget");
if(!typeField || !departmentLabel || !targetLabel || !targetSelect){
return;
}

if(typeField.value === "signalement"){
departmentLabel.innerText = "Poste occupe";
targetLabel.innerText = "Categorie du signalement";
targetSelect.innerHTML = [
"Comportement",
"Probleme staff",
"Probleme client",
"Autre"
].map((value)=> "<option value=\"" + value + "\">" + value + "</option>").join("");
return;
}

departmentLabel.innerText = "Poste occupe";
targetLabel.innerText = "Poste demande";
targetSelect.innerHTML = [
"Bar",
"Securite",
"DJ",
"Danseur / danseuse"
].map((value)=> "<option value=\"" + value + "\">" + value + "</option>").join("");
}

function renderApp(){
const isBoss = isBossUser();
const isResponsable = currentUser.role === "responsable";
const isManager = currentUser.role === "manager";
const nextPage = currentPageId;
document.getElementById("loginScreen").classList.add("hidden");
document.getElementById("appShell").classList.remove("hidden");
document.getElementById("welcomeText").innerText = "Salut " + currentUser.displayName;
document.getElementById("dashboardText").innerText = isBoss ? "Consulte la hierarchie interne et ouvre chaque carte pour modifier les informations utiles." : isResponsable ? "Consulte les cartes du staff, les demandes et les notifications de ton perimetre." : isManager ? "Consulte le staff, les annonces et tes suivis de formation." : "Consulte les cartes du staff et les informations importantes du club.";
document.getElementById("pointageHint").innerText = "Mode local actif. Cette version enregistre sur cet appareil.";
document.getElementById("pointagesNav").classList.remove("hidden");
document.getElementById("mobileMenuBtn").classList.remove("hidden");
document.getElementById("planningFormPanel").classList.toggle("hidden", !canEditPlanning());
document.getElementById("announcementEditorPanel").classList.toggle("hidden", !canEditAnnouncements());
document.getElementById("firebaseSecurityPanel").classList.toggle("hidden", !hasAdminAccess());
document.getElementById("staffNav").classList.toggle("hidden", !canManageStaff());
document.getElementById("logsNav").classList.toggle("hidden", !canViewLogs());
document.getElementById("archivesNav").classList.toggle("hidden", !canViewArchives());
document.getElementById("dashboardStaffShortcut").classList.toggle("hidden", !canManageStaff());
document.getElementById("dashboardLogsShortcut").classList.toggle("hidden", !canViewLogs());
document.getElementById("pointagesTitle").innerText = canManageAll() ? "Tous les pointages" : "Mes pointages";
document.getElementById("pointagesText").innerText = canManageAll() ? "Tu vois ici tous les pointages du club." : "Tu vois ici uniquement tes propres pointages.";
document.getElementById("presencePageText").innerText = canManageAll() ? "Tu peux suivre et modifier les reponses de presence de tout le club." : "Tu peux confirmer ta presence et suivre les membres de tes poles.";
document.getElementById("staffPageText").innerText = canManageAll() ? "Tu peux creer, modifier ou supprimer n'importe quel compte hors patron." : "Tu peux creer et gerer uniquement les comptes lies a ton acces.";
document.getElementById("staffScopePanel").innerText = canManageAll() ? "Tu peux attribuer un role et un secteur a chaque compte." : "Tu peux gerer uniquement les poles : " + getManagedDepartments().map((entry)=> getDepartmentLabel(entry)).join(", ") + ".";
document.getElementById("ownerPasswordPanel").classList.toggle("hidden", currentUser.username !== "adrian");
const ownerEmailInput = document.getElementById("ownerNewEmail");
if(ownerEmailInput){
ownerEmailInput.value = currentUser.username === "adrian" ? getUserEmail(currentUser) : "";
}
if(!canManageAll()){ document.getElementById("newRole").value = "staff"; }
document.getElementById("newRole").disabled = !canManageAll();
document.getElementById("newDepartment").value = canManageAll() ? "bar" : (getManagedDepartments()[0] || currentUser.department);
document.getElementById("newDepartment").disabled = !canManageAll() && getManagedDepartments().length <= 1;
document.getElementById("planningDepartment").value = canManageAll() ? "bar" : (getManagedDepartments()[0] || currentUser.department);
document.getElementById("planningDepartment").disabled = !canManageAll() && getManagedDepartments().length <= 1;
document.getElementById("newDateJoined").value = document.getElementById("newDateJoined").value || getTodayDateInputValue();
document.getElementById("filterDepartment").disabled = false;
document.getElementById("filterDepartmentWrap").classList.toggle("hidden", false);
document.querySelectorAll(".docs-editor").forEach((field)=>{
field.readOnly = !canEditDocumentsSection(field.id);
});
document.querySelectorAll(".docs-save-btn").forEach((button)=>{
const targetSectionId = button.getAttribute("onclick").match(/'([^']+)'/);
button.classList.toggle("hidden", !targetSectionId || !canEditDocumentsSection(targetSectionId[1]));
});
renderDashboardHierarchy();
refreshStaffPanels();
document.querySelectorAll(".card-editor").forEach((editor)=>{
const parentCard = editor.closest(".hierarchy-person-card");
const slot = parentCard ? parentCard.dataset.person : "";
editor.classList.toggle("hidden", !canEditStaffCard(slot));
});
document.querySelectorAll(".mini-editor").forEach((field)=>{
if(field.id.startsWith("docs_")){
field.readOnly = !canEditDocumentsSection(field.id);
return;
}
if(field.id.startsWith("contact")){
field.readOnly = !hasAdminAccess();
return;
}
if(field.id === "requestDetails" || field.id === "trainingDetails"){
field.readOnly = false;
return;
}
if(field.id === "planningNote"){
field.readOnly = !canEditPlanning();
return;
}
if(field.id === "announcementBody"){
field.readOnly = !canEditAnnouncements();
return;
}
const slot = field.id.split("_")[0];
field.readOnly = !canEditStaffCard(slot);
});
renderHierarchyDetails();
loadSavedPhotos();
loadSavedCardDescriptions();
updatePointageFormState();
renderPointages();
renderPresence();
renderPlanning();
renderInternalRequests();
renderTrainingRequests();
renderNotifications();
renderEmergencyContacts();
updateRequestTargetOptions();
renderAnnouncements();
renderLogs();
renderArchives();
renderDashboardSummary();
refreshPlanningStaffOptions();
document.getElementById("planningWeekBtn").classList.toggle("active-view-btn", planningViewMode === "week");
document.getElementById("planningMonthBtn").classList.toggle("active-view-btn", planningViewMode === "month");
if(canManageStaff()){ renderStaffList(); }
resetStaffForm(false);
document.getElementById("planningScopeText").innerText = canManageAll() ? "Tu peux gerer tous les plannings du club." : "Tu geres les plannings des poles : " + getManagedDepartments().map((entry)=> getDepartmentLabel(entry)).join(", ") + ".";
document.getElementById("requestsPageText").innerText = hasAdminAccess() ? "Tu peux envoyer des demandes et suivre celles de ton perimetre." : "Tu peux envoyer une demande de poste ou un signalement interne.";
document.getElementById("requestScopeText").innerText = hasAdminAccess() ? "Tu peux mettre un statut sur les demandes de ton perimetre." : "La direction et les responsables voient et traitent les demandes de leur perimetre.";
document.getElementById("formationsPageText").innerText = hasAdminAccess() ? "Tu peux suivre les demandes de formation de ton perimetre et les faire avancer." : "Tu peux demander une formation et suivre son avancement.";
document.getElementById("formationsScopeText").innerText = hasAdminAccess() ? "Tu peux valider, refuser ou planifier les formations de ton perimetre." : "La direction et les responsables te repondent ici sur ta demande.";
document.getElementById("notificationsPageText").innerText = hasAdminAccess() ? "Tu vois toutes les notifications du club : demandes, annonces et formations." : "Tu retrouves ici les annonces et les retours envoyes par la direction et les responsables.";
document.getElementById("notificationsScopeText").innerText = hasAdminAccess() ? "En direction, tu vois toutes les notifications internes du club." : "Le staff ne voit que les notifications utiles envoyees par la direction et les responsables.";
document.getElementById("announcementScopeText").innerText = canEditAnnouncements() ? "Tes annonces seront visibles sur le dashboard et pour tout le staff." : "Les annonces importantes remontees par la direction apparaissent ici.";
document.getElementById("announcementReadScope").innerText = canEditAnnouncements() ? "Tu peux activer un accuse de lecture pour suivre qui a lu l'annonce." : "Quand une annonce demande un accuse de lecture, tu peux la marquer comme lue ici.";
document.getElementById("firebaseSecurityText").innerText = "Copie ces regles dans Firebase Console pour verrouiller les modifications cote serveur quand tu utilises la version en ligne.";
renderAppBadges();
applyTheme(localStorage.getItem(storageKeys.theme) || "light");
if(nextPage === "staff" && !canManageStaff()){
currentPageId = "dashboard";
} else if(nextPage === "logs" && !canViewLogs()){
currentPageId = "dashboard";
} else if(nextPage === "archives" && !canViewArchives()){
currentPageId = "dashboard";
} else if(nextPage === "presence"){
currentPageId = "dashboard";
} else {
currentPageId = nextPage || "dashboard";
}
show(currentPageId);
document.querySelectorAll(".dashboard-group-body").forEach((group)=>{
group.classList.add("hidden");
});
document.querySelectorAll(".staff-detail-panel").forEach((panel)=>{
panel.classList.add("hidden");
});
document.querySelectorAll(".hierarchy-person-card").forEach((card)=>{
card.classList.remove("active-person-card");
});
if(currentUser.mustChangePassword){
hidePresencePromptModal();
showForcedPasswordModal();
} else {
hideForcedPasswordModal();
if(shouldShowPresencePrompt()){
showPresencePromptModal();
} else {
hidePresencePromptModal();
}
}
}

function updateOwnPassword(){
if(!currentUser || currentUser.username !== "adrian"){
return;
}

const passwordInput = document.getElementById("ownerNewPassword");
const message = document.getElementById("ownerPasswordMsg");
const nextPassword = passwordInput.value.trim();

if(!nextPassword){
message.innerText = "Entre un nouveau mot de passe.";
return;
}

const users = getUsers();
const targetUser = users.find((user)=> user.username === currentUser.username);
if(!targetUser){
message.innerText = "Compte introuvable.";
return;
}

targetUser.password = nextPassword;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
passwordInput.value = "";
message.innerText = "Mot de passe mis a jour.";
}

function updateOwnEmail(){
if(!currentUser || currentUser.username !== "adrian"){
return;
}

const emailInput = document.getElementById("ownerNewEmail");
const message = document.getElementById("ownerEmailMsg");
const nextEmail = emailInput.value.trim().toLowerCase();

if(!nextEmail){
message.innerText = "Entre une nouvelle adresse mail.";
return;
}

const users = getUsers();
const duplicateUser = users.find((user)=> user.username !== currentUser.username && getUserEmail(user).toLowerCase() === nextEmail);
if(duplicateUser){
message.innerText = "Cette adresse mail existe deja.";
return;
}

const targetUser = users.find((user)=> user.username === currentUser.username);
if(!targetUser){
message.innerText = "Compte introuvable.";
return;
}

targetUser.email = nextEmail;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
message.innerText = "Adresse mail mise a jour.";
}

seedUsers();
seedPointages();
setPlanningEntries(getPlanningEntries());
setPresenceEntries(getPresenceEntries());
setAnnouncements(getAnnouncements());
setAnnouncementReads(getAnnouncementReads());
setAdminLogs(getAdminLogs());
setArchivedStaff(getArchivedStaff());
setArchivedPointages(getArchivedPointages());
setArchivedNotes(getArchivedNotes());
restoreSession();
loadSavedPhotos();
loadSavedCardDescriptions();
loadSavedSections();
restoreTheme();

Object.assign(window, {
login,
logout,
show,
savePointage,
submitPresence,
submitPresencePrompt,
fillPresenceForm,
deletePointage,
showPointagePerson,
exportPointages,
changeTheme,
toggleMobileMenu,
acknowledgeAnnouncement,
openNotificationPage,
markNotificationRead,
markAllNotificationsRead,
deleteAllNotifications,
deleteNotification,
copyFirestoreRules,
copyStorageRules,
toggleLogViewed,
markAllLogsViewed,
deleteViewedLogs,
setPlanningView,
submitPlanningEntry,
editPlanningEntry,
duplicatePlanningEntry,
deletePlanningEntry,
cancelPlanningEdit,
submitAnnouncement,
editAnnouncement,
deleteAnnouncement,
cancelAnnouncementEdit,
submitInternalRequest,
changeRequestStatus,
submitTrainingRequest,
changeTrainingStatus,
saveContactSection,
submitStaffForm,
cancelEditStaff,
editStaff,
deleteStaff,
toggleStaffActive,
copyLatestCredentials,
copyStaffCredentials,
openPhotoPicker,
handlePhotoUpload,
saveSectionContent,
saveCardDescription,
updateOwnEmail,
updateOwnPassword,
submitForcedPasswordChange,
toggleDashboardGroup,
showStaffCard,
toggleDocSection,
updateRequestTargetOptions
});
