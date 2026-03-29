import { deleteApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
createUserWithEmailAndPassword,
getAuth,
onAuthStateChanged,
signInWithEmailAndPassword,
signOut
,
updatePassword,
updateEmail
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
addDoc,
collection,
deleteDoc,
doc,
getFirestore,
getDocs,
limit,
onSnapshot,
orderBy,
query,
serverTimestamp
,
setDoc,
where
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
getDownloadURL,
getStorage,
ref,
uploadBytes
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";

const defaultUsers = [
{ username: "adrian", email: "adrian@galaxynightclub.com", password: "galaxyboss", role: "boss", department: "all", displayName: "Adrian", active: true, mustChangePassword: false, dateJoined: "2026-03-22" },
{ username: "grace", email: "grace@galaxynightclub.com", password: "barboss", role: "manager", department: "bar", displayName: "Grace", active: true, mustChangePassword: false, dateJoined: "2026-03-22" },
{ username: "logan", email: "logan@galaxynightclub.com", password: "secureboss", role: "manager", department: "security", displayName: "Logan", active: true, mustChangePassword: false, dateJoined: "2026-03-22" }
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
sharedSections: "galaxySharedSections"
};

const departments = { bar: "Bar", security: "Securite", dj: "DJ", dance: "Danseur / danseuse", all: "Tous les poles" };
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

const cloudinaryConfig = {
cloudName: "dr4heoups",
uploadPreset: "galaxy_unsigned"
};

let currentUser = null;
let editingUsername = null;
let firebaseEnabled = false;
let db = null;
let auth = null;
let storage = null;
let firestoreAvailable = false;
let staffProfilesAvailable = false;
let staffProfilesCache = [];
let pointagesCache = [];
let planningCache = [];
let presenceCache = [];
let announcementsCache = [];
let announcementReadsCache = [];
let logsCache = [];
let archivedStaffCache = [];
let archivedPointagesCache = [];
let archivedNotesCache = [];
let sharedSectionsCache = {};
let unsubscribePointages = null;
let unsubscribeStaffProfiles = null;
let unsubscribePlanning = null;
let unsubscribePresence = null;
let unsubscribeAnnouncements = null;
let unsubscribeAnnouncementReads = null;
let unsubscribeLogs = null;
let unsubscribeArchivedStaff = null;
let unsubscribeArchivedPointages = null;
let unsubscribeArchivedNotes = null;
let unsubscribeSharedSections = null;
let firebaseStatusMessage = "";
let selectedPointageUser = null;
let editingPlanningId = null;
let editingAnnouncementId = null;
let currentPageId = "dashboard";
let planningViewMode = "week";
let latestCredentialsMessage = "";
let presencePromptSessionDate = "";
const isLocalFileMode = window.location.protocol === "file:";

function makeId(){
return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getTodayDateInputValue(){
return new Date().toISOString().slice(0, 10);
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

function getStoredUsers(){
return JSON.parse(localStorage.getItem(storageKeys.users) || "[]");
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

function isHostedFirebaseMode(){
return firebaseEnabled && auth && auth.currentUser && !isLocalFileMode;
}

function normalizeStaffProfile(entry){
return {
username: entry.username || getEmailLocalPart(entry.email || ""),
email: (entry.email || "").trim().toLowerCase(),
firebaseUid: entry.firebaseUid || "",
discordId: entry.discordId || "",
password: entry.password || "",
role: entry.role || "staff",
department: entry.department || "bar",
displayName: entry.displayName || entry.username || "Staff",
photoUrl: entry.photoUrl || "",
cardDescription: entry.cardDescription || "",
active: entry.active !== false,
mustChangePassword: entry.mustChangePassword === true,
dateJoined: entry.dateJoined || getTodayDateInputValue()
};
}

function toFirestoreStaffProfile(user){
return {
username: user.username,
email: getUserEmail(user).trim().toLowerCase(),
firebaseUid: user.firebaseUid || "",
discordId: user.discordId || "",
role: user.role,
department: user.department,
displayName: user.displayName,
photoUrl: user.photoUrl || "",
cardDescription: user.cardDescription || "",
active: user.active !== false,
mustChangePassword: user.mustChangePassword === true,
dateJoined: user.dateJoined || getTodayDateInputValue()
};
}

function mergeStaffProfiles(remoteUsers){
const localPasswordMap = new Map(getStoredUsers().map((user)=> [user.username, user.password || ""]));
return remoteUsers.map((user)=> ({
...user,
firebaseUid: user.firebaseUid || "",
discordId: user.discordId || "",
password: localPasswordMap.get(user.username) || user.password || "",
active: user.active !== false,
mustChangePassword: user.mustChangePassword === true,
dateJoined: user.dateJoined || getTodayDateInputValue()
}));
}

function getFirebaseStaffErrorMessage(error, fallbackMessage){
if(!error || !error.code){
return fallbackMessage;
}

const firebaseMessages = {
"auth/email-already-in-use": "Cet email existe deja dans Firebase.",
"auth/invalid-email": "L'adresse mail n'est pas valide.",
"auth/weak-password": "Le mot de passe est trop faible. Mets au moins 6 caracteres.",
"auth/operation-not-allowed": "Email / mot de passe n'est pas active dans Firebase Auth.",
"permission-denied": "Firebase refuse l'action. Verifie les regles ou les droits."
};

return firebaseMessages[error.code] || fallbackMessage;
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
storage = getStorage(app);
firebaseEnabled = true;
firebaseStatusMessage = "Firebase configure. Synchronisation en ligne active si Firestore accepte les acces.";
} catch (error){
firebaseEnabled = false;
firebaseStatusMessage = "Firebase n'a pas pu s'initialiser.";
console.error("Firebase init error:", error);
}
}

function mergeSystemUserWithExisting(defaultUser, existingUser){
return normalizeStaffProfile({
...defaultUser,
...(existingUser || {}),
username: (existingUser && existingUser.username) || defaultUser.username,
email: (existingUser && existingUser.email) || defaultUser.email,
password: existingUser && typeof existingUser.password === "string" ? existingUser.password : defaultUser.password,
role: (existingUser && existingUser.role) || defaultUser.role,
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

function seedUsers(){
const existingUsers = getStoredUsers();

if(!existingUsers.length){
localStorage.setItem(storageKeys.users, JSON.stringify(defaultUsers.map((user)=> normalizeStaffProfile(user))));
return;
}

const systemUsernames = defaultUsers.map((user)=> user.username);
const existingUserMap = new Map(existingUsers.map((user)=> [user.username, user]));
const mergedSystemUsers = defaultUsers.map((user)=> mergeSystemUserWithExisting(user, existingUserMap.get(user.username)));
const preservedCustomUsers = existingUsers
.filter((user)=> !systemUsernames.includes(user.username) && user.username !== "patron" && user.username !== "luna" && user.username !== "neo")
.map((user)=> normalizeStaffProfile(user));
const mergedUsers = [...mergedSystemUsers, ...preservedCustomUsers];

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

function getUsers(){ return staffProfilesAvailable ? staffProfilesCache : getStoredUsers(); }
function setUsers(users){
localStorage.setItem(storageKeys.users, JSON.stringify(users));
staffProfilesCache = users;
}

function getLocalCollection(key){
return JSON.parse(localStorage.getItem(key) || "[]");
}

function setLocalCollection(key, value){
localStorage.setItem(key, JSON.stringify(value));
}

function getPlanningEntries(){
return planningCache.length ? planningCache : getLocalCollection(storageKeys.planning);
}

function setPlanningEntries(entries){
planningCache = entries;
setLocalCollection(storageKeys.planning, entries);
}

function getPresenceEntries(){
return presenceCache.length ? presenceCache : getLocalCollection(storageKeys.presence);
}

function setPresenceEntries(entries){
presenceCache = sortByDateField(entries, "date");
setLocalCollection(storageKeys.presence, presenceCache);
}

function getAnnouncements(){
return announcementsCache.length ? announcementsCache : getLocalCollection(storageKeys.announcements);
}

function setAnnouncements(entries){
announcementsCache = entries;
setLocalCollection(storageKeys.announcements, entries);
}

function getAnnouncementReads(){
return announcementReadsCache.length ? announcementReadsCache : getLocalCollection(storageKeys.announcementReads);
}

function setAnnouncementReads(entries){
announcementReadsCache = sortByDateField(entries, "readAt");
setLocalCollection(storageKeys.announcementReads, announcementReadsCache);
}

function getAdminLogs(){
return logsCache.length ? logsCache : getLocalCollection(storageKeys.logs);
}

function setAdminLogs(entries){
logsCache = entries;
setLocalCollection(storageKeys.logs, entries);
}

function getArchivedStaff(){
return archivedStaffCache.length ? archivedStaffCache : getLocalCollection(storageKeys.archivedStaff);
}

function setArchivedStaff(entries){
archivedStaffCache = entries;
setLocalCollection(storageKeys.archivedStaff, entries);
}

function getArchivedPointages(){
return archivedPointagesCache.length ? archivedPointagesCache : getLocalCollection(storageKeys.archivedPointages);
}

function setArchivedPointages(entries){
archivedPointagesCache = entries;
setLocalCollection(storageKeys.archivedPointages, entries);
}

function getArchivedNotes(){
return archivedNotesCache.length ? archivedNotesCache : getLocalCollection(storageKeys.archivedNotes);
}

function setArchivedNotes(entries){
archivedNotesCache = entries;
setLocalCollection(storageKeys.archivedNotes, entries);
}

function showMessage(elementId, text, isError = false){
const target = document.getElementById(elementId);
if(!target){
return;
}
target.innerText = text;
target.classList.toggle("error", Boolean(isError));
target.classList.toggle("success", !isError && Boolean(text));
}

function getSharedSectionValue(sectionId){
if(sharedSectionsCache[sectionId] !== undefined){
return sharedSectionsCache[sectionId];
}

const localSections = JSON.parse(localStorage.getItem(storageKeys.sharedSections) || "{}");
return localSections[sectionId];
}

function setSharedSectionValue(sectionId, value){
sharedSectionsCache = {
...sharedSectionsCache,
[sectionId]: value
};
localStorage.setItem(storageKeys.sharedSections, JSON.stringify(sharedSectionsCache));
}

function getPointages(){
if(firestoreAvailable){
return pointagesCache;
}
return JSON.parse(localStorage.getItem(storageKeys.pointages) || "[]");
}

function canUseFirestoreWrites(){
return firebaseEnabled && db && auth && auth.currentUser;
}

function buildAccessProfile(user, firebaseUid){
return {
uid: firebaseUid || "",
username: user.username,
email: getUserEmail(user).trim().toLowerCase(),
role: user.role,
department: user.department,
managedDepartments: getManagedDepartments(user),
displayName: user.displayName,
active: user.active !== false,
updatedAt: new Date().toISOString()
};
}

async function syncAccessProfileToFirestore(user, firebaseUid){
if(!canUseFirestoreWrites()){
return;
}

const uid = firebaseUid || (auth && auth.currentUser ? auth.currentUser.uid : "");
if(!uid){
return;
}

await setDoc(doc(db, "accessProfiles", uid), buildAccessProfile(user, uid));
}

async function deleteAccessProfileFromFirestore(firebaseUid){
if(!canUseFirestoreWrites() || !firebaseUid){
return;
}

await deleteDoc(doc(db, "accessProfiles", firebaseUid));
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
"      return hasAccessProfile() && (accessData().role == 'boss' || accessData().role == 'manager');",
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
"      allow update, delete: if boss();",
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
"      return hasAccessProfile() && (accessData().role == 'boss' || accessData().role == 'manager');",
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

async function createFirebaseStaffAccount(email, password){
const secondaryApp = initializeApp(firebaseConfig, "staff-create-" + Date.now().toString(36));
const secondaryAuth = getAuth(secondaryApp);

try{
const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
await signOut(secondaryAuth);
return credential.user.uid;
} finally {
await deleteApp(secondaryApp);
}
}

async function saveStaffProfileToFirestore(user, previousUsername){
if(!canUseFirestoreWrites()){
return;
}

const safeProfile = toFirestoreStaffProfile(user);
await setDoc(doc(db, "staffProfiles", safeProfile.username), safeProfile);

if(previousUsername && previousUsername !== safeProfile.username){
await deleteDoc(doc(db, "staffProfiles", previousUsername));
}
}

async function deleteStaffProfileFromFirestore(username){
if(!canUseFirestoreWrites()){
return;
}

await deleteDoc(doc(db, "staffProfiles", username));
}

async function fetchFirestoreProfileByEmail(email){
if(!canUseFirestoreWrites()){
return null;
}

const loweredEmail = (email || "").trim().toLowerCase();
const snapshot = await getDocs(query(collection(db, "staffProfiles"), where("email", "==", loweredEmail), limit(1)));

if(snapshot.empty){
return null;
}

return normalizeStaffProfile(snapshot.docs[0].data());
}

async function ensureStaffProfilesSeeded(){
if(!canUseFirestoreWrites()){
return;
}

const existingProfiles = await getDocs(query(collection(db, "staffProfiles"), limit(1)));
if(!existingProfiles.empty){
return;
}

const baseUsers = getStoredUsers().map((user)=> normalizeStaffProfile(user));
for(const user of baseUsers){
await setDoc(doc(db, "staffProfiles", user.username), toFirestoreStaffProfile(user));
}
}

function subscribeStaffProfiles(){
if(!canUseFirestoreWrites() || unsubscribeStaffProfiles){
return;
}

unsubscribeStaffProfiles = onSnapshot(collection(db, "staffProfiles"), (snapshot)=>{
if(snapshot.empty){
staffProfilesAvailable = false;
staffProfilesCache = getStoredUsers();
return;
}

staffProfilesAvailable = true;
staffProfilesCache = mergeStaffProfiles(snapshot.docs.map((entry)=> normalizeStaffProfile(entry.data()))).sort((first, second)=> first.displayName.localeCompare(second.displayName, "fr"));
localStorage.setItem(storageKeys.users, JSON.stringify(staffProfilesCache));

if(currentUser){
const refreshedCurrentUser = staffProfilesCache.find((user)=> user.username === currentUser.username || getUserEmail(user) === getUserEmail(currentUser));
if(refreshedCurrentUser){
currentUser = {
...refreshedCurrentUser,
password: currentUser.password || refreshedCurrentUser.password || ""
};
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
}
renderApp();
}
}, (error)=>{
staffProfilesAvailable = false;
staffProfilesCache = getStoredUsers();
console.error("Staff profile subscribe error:", error);
});
}

function sortByDateField(entries, fieldName = "createdAt"){
return [...entries].sort((first, second)=>{
const firstValue = first[fieldName] || first.date || "";
const secondValue = second[fieldName] || second.date || "";
return String(secondValue).localeCompare(String(firstValue));
});
}

function subscribeSharedCollection(collectionName, setter, unsubscribeKeyName){
if(!canUseFirestoreWrites() || window[unsubscribeKeyName]){
return;
}

window[unsubscribeKeyName] = onSnapshot(collection(db, collectionName), (snapshot)=>{
const entries = snapshot.docs.map((entry)=> ({
id: entry.id,
...entry.data()
}));
setter(sortByDateField(entries));
if(currentUser){
renderApp();
}
}, (error)=>{
console.error(collectionName + " subscribe error:", error);
});
}

function subscribePlanning(){
if(!canUseFirestoreWrites() || unsubscribePlanning){
return;
}

unsubscribePlanning = onSnapshot(collection(db, "planningEntries"), (snapshot)=>{
planningCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })), "date");
setLocalCollection(storageKeys.planning, planningCache);
if(currentUser){
renderPlanning();
renderDashboardSummary();
}
}, (error)=>{
console.error("Planning subscribe error:", error);
});
}

function subscribePresence(){
if(!canUseFirestoreWrites() || unsubscribePresence){
return;
}

unsubscribePresence = onSnapshot(collection(db, "presenceEntries"), (snapshot)=>{
presenceCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })), "date");
setLocalCollection(storageKeys.presence, presenceCache);
if(currentUser){
renderPresence();
renderDashboardSummary();
}
}, (error)=>{
console.error("Presence subscribe error:", error);
});
}

function subscribeAnnouncements(){
if(!canUseFirestoreWrites() || unsubscribeAnnouncements){
return;
}

unsubscribeAnnouncements = onSnapshot(collection(db, "announcements"), (snapshot)=>{
announcementsCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })));
setLocalCollection(storageKeys.announcements, announcementsCache);
if(currentUser){
renderAnnouncements();
renderDashboardSummary();
}
}, (error)=>{
console.error("Announcement subscribe error:", error);
});
}

function subscribeAnnouncementReads(){
if(!canUseFirestoreWrites() || unsubscribeAnnouncementReads){
return;
}

unsubscribeAnnouncementReads = onSnapshot(collection(db, "announcementReads"), (snapshot)=>{
announcementReadsCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })), "readAt");
setLocalCollection(storageKeys.announcementReads, announcementReadsCache);
if(currentUser){
renderAnnouncements();
renderDashboardSummary();
}
}, (error)=>{
console.error("Announcement reads subscribe error:", error);
});
}

function subscribeLogs(){
if(!canUseFirestoreWrites() || unsubscribeLogs){
return;
}

unsubscribeLogs = onSnapshot(collection(db, "adminLogs"), (snapshot)=>{
logsCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })));
setLocalCollection(storageKeys.logs, logsCache);
if(currentUser){
renderLogs();
}
}, (error)=>{
console.error("Logs subscribe error:", error);
});
}

function subscribeArchives(){
if(!canUseFirestoreWrites()){
return;
}

if(!unsubscribeArchivedStaff){
unsubscribeArchivedStaff = onSnapshot(collection(db, "archivedStaff"), (snapshot)=>{
archivedStaffCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })));
setLocalCollection(storageKeys.archivedStaff, archivedStaffCache);
if(currentUser){
renderArchives();
}
});
}

if(!unsubscribeArchivedPointages){
unsubscribeArchivedPointages = onSnapshot(collection(db, "archivedPointages"), (snapshot)=>{
archivedPointagesCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })));
setLocalCollection(storageKeys.archivedPointages, archivedPointagesCache);
if(currentUser){
renderArchives();
}
});
}

if(!unsubscribeArchivedNotes){
unsubscribeArchivedNotes = onSnapshot(collection(db, "archivedNotes"), (snapshot)=>{
archivedNotesCache = sortByDateField(snapshot.docs.map((entry)=> ({ id: entry.id, ...entry.data() })));
setLocalCollection(storageKeys.archivedNotes, archivedNotesCache);
if(currentUser){
renderArchives();
}
});
}
}

function subscribeSharedSections(){
if(!canUseFirestoreWrites() || unsubscribeSharedSections){
return;
}

unsubscribeSharedSections = onSnapshot(collection(db, "sharedSections"), (snapshot)=>{
sharedSectionsCache = snapshot.docs.reduce((accumulator, entry)=>{
accumulator[entry.id] = entry.data().value || "";
return accumulator;
}, {});
localStorage.setItem(storageKeys.sharedSections, JSON.stringify(sharedSectionsCache));
Object.entries(sharedSectionsCache).forEach(([sectionId, value])=>{
const field = document.getElementById(sectionId);
if(field){
field.value = value;
}
});
if(currentUser){
renderDashboardHierarchy();
renderApp();
}
}, (error)=>{
console.error("Shared sections subscribe error:", error);
});
}

function subscribeSharedData(){
subscribePlanning();
subscribePresence();
subscribeAnnouncements();
subscribeAnnouncementReads();
subscribeLogs();
subscribeArchives();
subscribeSharedSections();
}

function setLocalPointages(pointages){
localStorage.setItem(storageKeys.pointages, JSON.stringify(pointages));
pointagesCache = pointages;
}

function getEmailLocalPart(email){
return (email || "").trim().toLowerCase().split("@")[0];
}

function getUserEmail(user){
return user.email || (user.username + "@galaxynightclub.com");
}

function getDepartmentLabel(department){ return departments[department] || department; }
function getStatusLabel(status){ return statuses[status] || status; }
function getPresenceStatusLabel(status){
const labels = {
present: "Present",
absent: "Absent",
pending: "En attente"
};
return labels[status] || status;
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

function toComparableDate(value){
if(!value){
return null;
}

const parsedDate = new Date(value);
if(!Number.isNaN(parsedDate.getTime())){
return parsedDate;
}

const match = String(value).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})?/);
if(match){
const [, day, month, year, hours, minutes] = match;
return new Date(Number(year), Number(month) - 1, Number(day), Number(hours || 0), Number(minutes || 0));
}

return null;
}

function toDateKey(value){
const dateValue = toComparableDate(value);
if(!dateValue){
return "";
}

const year = dateValue.getFullYear();
const month = String(dateValue.getMonth() + 1).padStart(2, "0");
const day = String(dateValue.getDate()).padStart(2, "0");
return year + "-" + month + "-" + day;
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
if(!entryDate){
return accumulator;
}

if(entryDate >= weekStart){
accumulator.weekMinutes += duration;
}
if(entryDate >= monthStart){
accumulator.monthMinutes += duration;
}
return accumulator;
}, { weekMinutes: 0, monthMinutes: 0 });
}

function hasAdminAccess(){
if(!currentUser){
return false;
}

const username = (currentUser.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(currentUser.email || "");
return currentUser.role === "boss" || currentUser.role === "manager" || adminUsernames.includes(username) || adminUsernames.includes(emailLocalPart);
}

function isBossUser(user = currentUser){
if(!user){
return false;
}

const username = (user.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(user.email || "");
return user.role === "boss" || username === "adrian" || emailLocalPart === "adrian";
}

function getManagedDepartments(user = currentUser){
if(!user){
return [];
}

if(isBossUser(user)){
return ["all"];
}

const username = (user.username || "").toLowerCase();
const emailLocalPart = getEmailLocalPart(user.email || "");

if(username === "grace" || emailLocalPart === "grace"){
return ["bar", "dance"];
}

if(username === "logan" || emailLocalPart === "logan"){
return ["security"];
}

if(user.role === "manager" && user.department){
return [user.department];
}

return [];
}

function canManageAll(){
return getManagedDepartments().includes("all");
}

function canManageDepartment(department){
const managedDepartments = getManagedDepartments();
return managedDepartments.includes("all") || managedDepartments.includes(department);
}

function canManageStaff(){
return hasAdminAccess();
}

function canViewLogs(){
return isBossUser();
}

function canViewArchives(){
return isBossUser();
}

function canEditAnnouncements(){
return hasAdminAccess();
}

function canEditPlanning(){
return hasAdminAccess();
}

function canEditDocumentsSection(sectionId){
if(isBossUser()){
return true;
}

if(!currentUser || currentUser.role !== "manager"){
return false;
}

if(sectionId.includes("docs_bar")){
return canManageDepartment("bar");
}
if(sectionId.includes("docs_security")){
return canManageDepartment("security");
}
if(sectionId.includes("docs_dj")){
return canManageDepartment("dj");
}
if(sectionId.includes("docs_dance")){
return canManageDepartment("dance");
}

return false;
}

function canEditStaffCard(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!targetUser){
return false;
}

if(isBossUser()){
return true;
}

return canManageDepartment(targetUser.department);
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

function updatePhotoElements(slot){
const photoUrl = getPhotoUrlForSlot(slot);
document.querySelectorAll("#photo-" + slot).forEach((image)=>{
image.src = photoUrl;
image.onerror = () => {
image.onerror = null;
image.src = "image.png";
};
});
}

function showPhotoUploadMessage(slot, text, isError = false){
showMessage("photo-upload-msg-" + slot, text, isError);
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
if(error.code){
return error.code;
}
return fallbackMessage;
}

async function logAdminAction(action, targetType, title, details){
const entry = {
id: makeId(),
action,
targetType,
title,
details,
createdBy: currentUser ? currentUser.displayName : "Systeme",
createdByUsername: currentUser ? currentUser.username : "system",
 createdAt: new Date().toISOString(),
 viewed: false
};

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "adminLogs", entry.id), entry);
} catch (error){
console.error("Admin log error:", error);
}
}

const nextLogs = [entry, ...getAdminLogs()].slice(0, 150);
setAdminLogs(nextLogs);
}

async function archiveNoteEntry(sectionId, previousValue){
if(!previousValue){
return;
}

const entry = {
id: makeId(),
sectionId,
value: previousValue,
updatedBy: currentUser ? currentUser.displayName : "Systeme",
updatedAt: new Date().toISOString()
};

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "archivedNotes", entry.id), entry);
} catch (error){
console.error("Archive note error:", error);
}
}

setArchivedNotes([entry, ...getArchivedNotes()].slice(0, 200));
}

async function handlePhotoUpload(slot, event){
const input = event && event.files ? event : (event && event.target ? event.target : document.getElementById("cloudinaryPhotoInput"));
const file = input && input.files ? input.files[0] : null;
if(input){
input.value = "";
}
if(!slot || !canEditStaffCard(slot)){
showPhotoUploadMessage(slot, "Tu ne peux pas modifier cette photo.", true);
return;
}
if(!hasCloudinaryConfig()){
showPhotoUploadMessage(slot, "Renseigne cloudName et uploadPreset Cloudinary dans script.js.", true);
return;
}
if(!file){
return;
}
if(!String(file.type || "").startsWith("image/")){
showPhotoUploadMessage(slot, "Choisis une image valide.", true);
return;
}
const targetUser = getUsers().find((user)=> user.username === slot);
if(!targetUser){
showPhotoUploadMessage(slot, "Employe introuvable.", true);
return;
}

showPhotoUploadMessage(slot, "Envoi Cloudinary en cours...");

const formData = new FormData();
formData.append("file", file);
formData.append("upload_preset", cloudinaryConfig.uploadPreset);

try{
const response = await fetch(getCloudinaryUploadUrl(), {
method: "POST",
body: formData
});
const result = await response.json();
if(!response.ok || !result.secure_url){
throw new Error(result && result.error && result.error.message ? result.error.message : "Upload Cloudinary impossible.");
}

targetUser.photoUrl = result.secure_url;
setUsers(getUsers().map((user)=> user.username === slot ? targetUser : user));

if(currentUser && currentUser.username === slot){
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
}

if(canUseFirestoreWrites()){
try{
await saveStaffProfileToFirestore(targetUser);
} catch (error){
console.error("Photo profile sync error:", error);
updatePhotoElements(slot);
renderDashboardHierarchy();
showPhotoUploadMessage(slot, "Photo envoyee sur Cloudinary, mais Firebase a refuse la sauvegarde du profil.", true);
return;
}
}

updatePhotoElements(slot);
renderDashboardHierarchy();
showPhotoUploadMessage(slot, "Photo mise a jour.");
await logAdminAction("staff_photo_update", "staff", "Photo staff mise a jour", targetUser.displayName);
} catch (error){
console.error("Cloudinary upload error:", error);
showPhotoUploadMessage(slot, getFriendlyPhotoErrorMessage(error, "Cloudinary a refuse l'envoi de la photo."), true);
}
}

function loadSavedPhotos(){
getPhotoSlots().forEach((slot)=>{
updatePhotoElements(slot);
});
}

function loadSavedCardDescriptions(){
getPhotoSlots().forEach((slot)=>{
const targetUser = getUsers().find((user)=> user.username === slot);
const savedDescription = targetUser && targetUser.cardDescription ? targetUser.cardDescription : localStorage.getItem(getCardDescriptionStorageKey(slot));
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

function getSavedSectionValue(sectionId, fallbackValue){
const sharedValue = getSharedSectionValue(sectionId);
if(sharedValue !== undefined){
return sharedValue;
}
const savedValue = localStorage.getItem(getSectionStorageKey(sectionId));
return savedValue !== null ? savedValue : fallbackValue;
}

async function saveCardDescription(slot){
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
if(canUseFirestoreWrites()){
try{
await saveStaffProfileToFirestore(targetUser);
} catch (error){
console.error("Card description sync error:", error);
}
}
}
await logAdminAction("card_update", "dashboard_card", "Description mise a jour", "Description modifiee pour " + slot + ".");
}

async function saveSectionContent(sectionId){
const field = document.getElementById(sectionId);
if(!field){
return;
}

if(sectionId.startsWith("docs_") && !canEditDocumentsSection(sectionId)){
return;
}

if(!sectionId.startsWith("docs_") && sectionId.includes("_") && !canEditStaffCard(sectionId.split("_")[0])){
return;
}

const previousValue = getSavedSectionValue(sectionId, "");
localStorage.setItem(getSectionStorageKey(sectionId), field.value);
setSharedSectionValue(sectionId, field.value);

if(previousValue !== field.value){
await archiveNoteEntry(sectionId, previousValue);
await logAdminAction("section_update", sectionId.startsWith("docs_") ? "document" : "dashboard_card", "Contenu mis a jour", sectionId + " modifie par " + (currentUser ? currentUser.displayName : "systeme") + ".");
}

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "sharedSections", sectionId), {
value: field.value,
updatedBy: currentUser ? currentUser.displayName : "Systeme",
updatedAt: new Date().toISOString()
});
} catch (error){
console.error("Shared section save error:", error);
}
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
const savedValue = getSavedSectionValue(sectionId, null);
if(field && savedValue !== null){
field.value = savedValue;
}
});
}

function canManageUser(targetUser){
if(!targetUser){ return false; }
if(isBossUser()){
return true;
}

if(currentUser.role !== "manager"){
return false;
}

if(targetUser.role === "boss"){
return false;
}

return canManageDepartment(targetUser.department);
}

function isUserVisibleToCurrentUser(user){
if(canManageAll()){ return true; }
if(!currentUser){
return false;
}
if(user.username === currentUser.username){
return true;
}
if(isBossUser(user)){
return true;
}
return canManageDepartment(user.department);
}

function isPointageVisibleToCurrentUser(pointage){
if(canManageAll()){ return true; }
if(!currentUser){
return false;
}
if(pointage.createdBy === currentUser.username){
return true;
}
return canManageDepartment(pointage.department);
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

function tryLocalLogin(email, password){
const profile = getUserProfileFromEmail(email);
if(!profile){
return false;
}

const passwordMatches = profile.password === password;
if(!passwordMatches && !isLocalFileMode){
return false;
}

currentUser = profile;
localStorage.setItem(storageKeys.session, JSON.stringify(profile));
renderApp();
return true;
}

async function login(event){
if(event){
event.preventDefault();
}
const email = document.getElementById("username").value.trim().toLowerCase();
const password = document.getElementById("password").value.trim();
const loginMsg = document.getElementById("loginMsg");

if(!firebaseEnabled || !auth){
if(tryLocalLogin(email, password)){
loginMsg.className = "status-msg success";
loginMsg.innerText = isLocalFileMode ? "Connexion locale reussie en mode fichier." : "Connexion locale reussie.";
return;
}
loginMsg.className = "status-msg error";
loginMsg.innerText = "Connexion impossible. Verifie l'email et le mot de passe.";
return;
}

try{
const credential = await signInWithEmailAndPassword(auth, email, password);
await ensureStaffProfilesSeeded();
subscribeStaffProfiles();
let profile = getUserProfileFromEmail(credential.user.email);

if(!profile){
try{
profile = await fetchFirestoreProfileByEmail(credential.user.email);
if(profile){
const mergedUsers = [...getStoredUsers().filter((user)=> user.username !== profile.username), profile];
setUsers(mergedUsers);
}
} catch (profileError){
console.error("Firebase profile fetch error:", profileError);
}
}

if(!profile){
await signOut(auth);
loginMsg.className = "status-msg error";
loginMsg.innerText = "Compte Firebase ok, mais profil staff introuvable.";
return;
}

if(profile.active === false){
await signOut(auth);
loginMsg.className = "status-msg error";
loginMsg.innerText = "Ce compte est actuellement desactive.";
return;
}

currentUser = profile;
currentUser.firebaseUid = credential.user.uid;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
await syncAccessProfileToFirestore(currentUser, credential.user.uid);
loginMsg.className = "status-msg success";
loginMsg.innerText = "Connexion reussie.";
subscribePointages();
subscribeSharedData();
renderApp();
if(currentUser.mustChangePassword){
showForcedPasswordModal();
} else {
hideForcedPasswordModal();
}
} catch (error){
console.error("Firebase Auth login error:", error);
if(auth && auth.currentUser){
try{
await signOut(auth);
} catch (logoutError){
console.error("Firebase cleanup logout error:", logoutError);
}
}
if(tryLocalLogin(email, password)){
if(currentUser && currentUser.active === false){
currentUser = null;
localStorage.removeItem(storageKeys.session);
loginMsg.className = "status-msg error";
loginMsg.innerText = "Ce compte est actuellement desactive.";
return;
}
loginMsg.className = "status-msg success";
loginMsg.innerText = isLocalFileMode ? "Connexion locale reussie en mode fichier." : "Connexion locale reussie.";
if(currentUser && currentUser.mustChangePassword){
showForcedPasswordModal();
} else {
hideForcedPasswordModal();
}
return;
}
loginMsg.className = "status-msg error";
loginMsg.innerText = "Connexion Firebase impossible. Verifie email, mot de passe ou Auth.";
}
}

async function logout(){
currentUser = null;
editingUsername = null;
presencePromptSessionDate = "";
localStorage.removeItem(storageKeys.session);
document.body.classList.remove("mobile-menu-open");
if(firebaseEnabled && auth && auth.currentUser){
try{
await signOut(auth);
} catch (error){
console.error("Firebase Auth logout error:", error);
}
}
if(unsubscribeStaffProfiles){
unsubscribeStaffProfiles();
unsubscribeStaffProfiles = null;
}
if(unsubscribePlanning){
unsubscribePlanning();
unsubscribePlanning = null;
}
if(unsubscribePresence){
unsubscribePresence();
unsubscribePresence = null;
}
if(unsubscribeAnnouncements){
unsubscribeAnnouncements();
unsubscribeAnnouncements = null;
}
if(unsubscribeAnnouncementReads){
unsubscribeAnnouncementReads();
unsubscribeAnnouncementReads = null;
}
if(unsubscribeLogs){
unsubscribeLogs();
unsubscribeLogs = null;
}
if(unsubscribeArchivedStaff){
unsubscribeArchivedStaff();
unsubscribeArchivedStaff = null;
}
if(unsubscribeArchivedPointages){
unsubscribeArchivedPointages();
unsubscribeArchivedPointages = null;
}
if(unsubscribeArchivedNotes){
unsubscribeArchivedNotes();
unsubscribeArchivedNotes = null;
}
if(unsubscribeSharedSections){
unsubscribeSharedSections();
unsubscribeSharedSections = null;
}
hidePresencePromptModal();
hideForcedPasswordModal();
staffProfilesAvailable = false;
staffProfilesCache = getStoredUsers();
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
document.getElementById("loginMsg").innerText = "";
document.getElementById("password").value = "";
}

function showForcedPasswordModal(){
const modal = document.getElementById("forcePasswordModal");
if(modal){
modal.classList.remove("hidden");
}
}

function hideForcedPasswordModal(){
const modal = document.getElementById("forcePasswordModal");
if(modal){
modal.classList.add("hidden");
}
document.getElementById("forcedPasswordInput").value = "";
document.getElementById("forcedPasswordConfirm").value = "";
document.getElementById("forcedPasswordMsg").innerText = "";
}

function showPresencePromptModal(){
const modal = document.getElementById("presencePromptModal");
if(modal){
modal.classList.remove("hidden");
}
}

function hidePresencePromptModal(){
const modal = document.getElementById("presencePromptModal");
if(modal){
modal.classList.add("hidden");
}
const message = document.getElementById("presencePromptMsg");
if(message){
message.innerText = "";
}
}

function toggleMobileMenu(){
document.body.classList.toggle("mobile-menu-open");
}

async function submitForcedPasswordChange(){
if(!currentUser){
return;
}
const passwordInput = document.getElementById("forcedPasswordInput");
const confirmInput = document.getElementById("forcedPasswordConfirm");
const message = document.getElementById("forcedPasswordMsg");
const nextPassword = passwordInput.value.trim();
const confirmPassword = confirmInput.value.trim();
if(!nextPassword || nextPassword.length < 6){
message.innerText = "Mets au moins 6 caracteres.";
return;
}
if(nextPassword !== confirmPassword){
message.innerText = "Les mots de passe ne correspondent pas.";
return;
}
if(firebaseEnabled && auth && auth.currentUser){
try{
await updatePassword(auth.currentUser, nextPassword);
} catch (error){
console.error("Forced password update error:", error);
message.innerText = "Firebase refuse le changement. Reconnecte-toi puis reessaie.";
return;
}
}
const users = getUsers();
const targetUser = users.find((user)=> user.username === currentUser.username);
if(targetUser){
targetUser.password = nextPassword;
targetUser.mustChangePassword = false;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
if(isHostedFirebaseMode()){
try{
await saveStaffProfileToFirestore(targetUser);
} catch (error){
console.error("Forced password profile sync error:", error);
}
}
}
hideForcedPasswordModal();
await logAdminAction("password_forced_change", "staff", "Mot de passe change", currentUser.displayName + " a valide son nouveau mot de passe.");
renderApp();
}

function restoreSession(){
if(firebaseEnabled && auth){
onAuthStateChanged(auth, async (user)=>{
try{
if(!user){
currentUser = null;
localStorage.removeItem(storageKeys.session);
if(unsubscribeStaffProfiles){
unsubscribeStaffProfiles();
unsubscribeStaffProfiles = null;
}
staffProfilesAvailable = false;
staffProfilesCache = getStoredUsers();
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
return;
}

await ensureStaffProfilesSeeded();
subscribeStaffProfiles();
let profile = getUserProfileFromEmail(user.email);
if(!profile){
try{
profile = await fetchFirestoreProfileByEmail(user.email);
if(profile){
const mergedUsers = [...getStoredUsers().filter((entry)=> entry.username !== profile.username), profile];
setUsers(mergedUsers);
}
} catch (profileError){
console.error("Firebase restore profile error:", profileError);
}
}
if(!profile){
currentUser = null;
localStorage.removeItem(storageKeys.session);
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
return;
}

if(profile.active === false){
currentUser = null;
localStorage.removeItem(storageKeys.session);
if(auth && auth.currentUser){
await signOut(auth);
}
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
document.getElementById("loginMsg").innerText = "Ce compte est actuellement desactive.";
return;
}

currentUser = profile;
currentUser.firebaseUid = user.uid;
localStorage.setItem(storageKeys.session, JSON.stringify(currentUser));
await syncAccessProfileToFirestore(currentUser, user.uid);
subscribePointages();
subscribeSharedData();
renderApp();
if(currentUser.mustChangePassword){
showForcedPasswordModal();
} else {
hideForcedPasswordModal();
}
} catch (error){
console.error("Restore session error:", error);
currentUser = null;
localStorage.removeItem(storageKeys.session);
document.getElementById("appShell").classList.add("hidden");
document.getElementById("loginScreen").classList.remove("hidden");
}
});
return;
}

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

function getScopeUsers(){ return getUsers().filter((user)=> isUserVisibleToCurrentUser(user)); }
function getVisiblePointages(){ return getPointages().filter((pointage)=> isPointageVisibleToCurrentUser(pointage)); }

function getRoleLabel(user){
if(user.role === "boss"){ return "Patron"; }
if(user.role === "manager"){ return "Responsable"; }
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
if(!text){
return false;
}
try{
await navigator.clipboard.writeText(text);
return true;
} catch (error){
console.error("Clipboard error:", error);
return false;
}
}

async function copyLatestCredentials(){
const message = document.getElementById("staffMsg");
const copied = await copyTextToClipboard(latestCredentialsMessage);
if(message){
message.innerText = copied ? "Message de connexion copie." : "Impossible de copier automatiquement.";
}
}

async function copyStaffCredentials(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!targetUser || !canManageUser(targetUser)){
return;
}
updateCredentialsPreview(buildCredentialsMessage(targetUser));
const copied = await copyTextToClipboard(latestCredentialsMessage);
document.getElementById("staffMsg").innerText = copied ? "Message de connexion copie pour " + targetUser.displayName + "." : "Impossible de copier automatiquement.";
}

async function copyFirestoreRules(){
const copied = await copyTextToClipboard(getFirestoreRulesSnippet());
showMessage("firebaseSecurityMsg", copied ? "Regles Firestore copiees." : "Impossible de copier les regles Firestore.", !copied);
}

async function copyStorageRules(){
const copied = await copyTextToClipboard(getStorageRulesSnippet());
showMessage("firebaseSecurityMsg", copied ? "Regles Storage copiees." : "Impossible de copier les regles Storage.", !copied);
}

function getStaffPanelMarkup(user){
const roleLabel = getRoleLabel(user);
const canEditPhoto = canEditStaffCard(user.username);
const sections = [
{ icon: "Photo", label: "Photo", type: "photo" },
{ icon: "Informations", label: "Informations", id: user.username + "_infosContent", value: getSavedSectionValue(user.username + "_infosContent", "Informations internes pour " + user.displayName + ".") },
{ icon: "Numeros", label: "Numeros", id: user.username + "_numerosContent", value: getSavedSectionValue(user.username + "_numerosContent", "Numeros utiles pour " + user.displayName + ".") },
{ icon: "Grade", label: "Grade", id: user.username + "_gradeContent", value: getSavedSectionValue(user.username + "_gradeContent", roleLabel) },
{ icon: "Date d'entree", label: "Date d'entree", id: user.username + "_dateentreeContent", value: getSavedSectionValue(user.username + "_dateentreeContent", user.dateJoined || getTodayDateInputValue()) },
{ icon: "Disponibilites", label: "Disponibilites", id: user.username + "_disponibilitesContent", value: getSavedSectionValue(user.username + "_disponibilitesContent", "Disponibilites a renseigner.") },
{ icon: "Sanctions", label: "Sanctions", id: user.username + "_sanctionsContent", value: getSavedSectionValue(user.username + "_sanctionsContent", "Aucune sanction enregistree.") }
];
return "<div class='dashboard-mini-grid'>" + sections.map((section)=>{
if(section.type === "photo"){
const photoSource = user.photoUrl ? "Photo partagee Cloudinary active." : "Ajoute une photo partagee pour cette fiche.";
const uploadButton = canEditPhoto ? "<button class='secondary-btn save-section-btn' type='button' onclick=\"openPhotoPicker('" + user.username + "')\">Choisir une photo</button>" : "";
const cloudinaryHint = hasCloudinaryConfig() ? "Les responsables peuvent envoyer une image partagee." : "Tu peux aussi remplir la config Cloudinary dans script.js pour partager les photos sans republier le site.";
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

["adrian", "grace", "logan"].forEach((username)=>{
const coreUser = users.find((user)=> user.username === username);
const panel = document.getElementById("staff-panel-" + username);
const descriptionField = document.getElementById("card-description-" + username);
if(coreUser && panel){
panel.innerHTML = getStaffPanelMarkup(coreUser);
}
if(coreUser && descriptionField){
descriptionField.innerText = coreUser.cardDescription || localStorage.getItem(getCardDescriptionStorageKey(username)) || getStaffCardDefaultDescription(coreUser);
}
});

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
const defaultDescription = getStaffCardDefaultDescription(user, roleLabel);
const description = user.cardDescription || localStorage.getItem(getCardDescriptionStorageKey(user.username)) || defaultDescription;
const savedPhoto = getPhotoUrlForSlot(user.username);
return "<article class='person-card hierarchy-person-card dynamic-person-card " + getDepartmentThemeClass(user.department) + "' data-person='" + user.username + "' onclick=\"showStaffCard('" + user.username + "')\"><img id='photo-" + user.username + "' src='" + savedPhoto + "' alt='" + user.displayName + "' class='person-photo hierarchy-photo' onerror=\"this.onerror=null;this.src='image.png'\"><strong>" + user.displayName + "</strong><span class='dept-badge'>" + roleLabel + " · " + getAccountStatusLabel(user) + "</span><p id='card-description-" + user.username + "'>" + description + "</p><div class='card-editor hidden' onclick='event.stopPropagation()'><textarea id='card-description-input-" + user.username + "' class='card-description-input' placeholder='Petite description de la carte'>" + description + "</textarea><button class='secondary-btn mini-card-btn' onclick=\"saveCardDescription('" + user.username + "')\">Enregistrer</button></div></article>";
}).join("");

panelContainer.innerHTML = scopedUsers.map((user)=> "<div id='staff-panel-" + user.username + "' class='staff-detail-panel hidden'>" + getStaffPanelMarkup(user) + "</div>").join("");
});
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
const isBoss = isBossUser();
const isManager = currentUser.role === "manager";
const nextPage = currentPageId;
document.getElementById("loginScreen").classList.add("hidden");
document.getElementById("appShell").classList.remove("hidden");
document.getElementById("welcomeText").innerText = "Salut " + currentUser.displayName;
document.getElementById("dashboardText").innerText = isBoss ? "Consulte la hierarchie interne et ouvre chaque carte pour modifier les informations utiles." : isManager ? "Consulte les cartes du staff et gere les informations de chaque responsable." : "Consulte les cartes du staff et les informations importantes du club.";
document.getElementById("pointageHint").innerText = canUseFirestoreWrites() ? (firebaseStatusMessage || "Connexion Firebase active. Les pointages essaient de se synchroniser en ligne.") : (firebaseStatusMessage || "Mode local actif. La pointeuse enregistre sur cet appareil.");
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
document.getElementById("staffScopePanel").innerText = isHostedFirebaseMode()
? (canManageAll()
? "Les nouveaux comptes crees ici ajoutent aussi un vrai login Firebase. Les comptes existants se gerent ensuite dans Firebase Auth."
: "Tu geres les comptes de tes poles : " + getManagedDepartments().map((entry)=> getDepartmentLabel(entry)).join(", ") + ". La creation ajoute aussi un vrai login Firebase.")
: (canManageAll()
? "Tu peux attribuer un role et un secteur a chaque compte."
: "Tu geres uniquement les poles : " + getManagedDepartments().map((entry)=> getDepartmentLabel(entry)).join(", ") + ".");
document.getElementById("ownerPasswordPanel").classList.toggle("hidden", currentUser.username !== "adrian");
const ownerEmailInput = document.getElementById("ownerNewEmail");
if(ownerEmailInput){
ownerEmailInput.value = currentUser.username === "adrian" ? getUserEmail(currentUser) : "";
}
if(!canManageAll()){ document.getElementById("newRole").value = "staff"; }
document.getElementById("newRole").disabled = !canManageAll();
const defaultManagedDepartment = canManageAll() ? "bar" : (getManagedDepartments()[0] || currentUser.department || "bar");
document.getElementById("newDepartment").value = defaultManagedDepartment;
document.getElementById("newDepartment").disabled = !canManageAll() && getManagedDepartments().length <= 1;
document.getElementById("planningDepartment").value = defaultManagedDepartment;
document.getElementById("planningDepartment").disabled = !canManageAll() && getManagedDepartments().length <= 1;
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
document.getElementById("announcementScopeText").innerText = canEditAnnouncements() ? "Tes annonces seront visibles sur le dashboard et pour tout le staff." : "Les annonces importantes remontees par la direction apparaissent ici.";
document.getElementById("announcementReadScope").innerText = canEditAnnouncements() ? "Tu peux activer un accuse de lecture pour suivre qui a lu l'annonce." : "Quand une annonce demande un accuse de lecture, tu peux la marquer comme lue ici.";
document.getElementById("firebaseSecurityText").innerText = firebaseEnabled ? "Copie ces regles dans Firebase Console pour verrouiller les modifications cote serveur et garder un vrai acces responsables seulement." : "Active Firebase en ligne puis colle ces regles dans Firebase Console pour verrouiller les modifications cote serveur.";
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

async function updateOwnPassword(){
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

if(firebaseEnabled && auth && auth.currentUser){
try{
await updatePassword(auth.currentUser, nextPassword);
} catch (error){
console.error("Firebase update password error:", error);
message.innerText = "Firebase refuse le changement. Reconnecte-toi puis reessaie.";
return;
}
}

targetUser.password = nextPassword;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
passwordInput.value = "";
message.innerText = "Mot de passe mis a jour.";
}

async function updateOwnEmail(){
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

if(firebaseEnabled && auth && auth.currentUser){
try{
await updateEmail(auth.currentUser, nextEmail);
} catch (error){
console.error("Firebase update email error:", error);
message.innerText = "Firebase refuse le changement. Reconnecte-toi puis reessaie.";
return;
}
}

targetUser.email = nextEmail;
setUsers(users);
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
if(isHostedFirebaseMode()){
try{
await saveStaffProfileToFirestore(targetUser);
await syncAccessProfileToFirestore(targetUser, targetUser.firebaseUid);
} catch (error){
console.error("Own email sync error:", error);
}
}
message.innerText = "Adresse mail mise a jour.";
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
currentPageId = page;
document.body.classList.remove("mobile-menu-open");
document.querySelectorAll(".page").forEach((section)=>{ section.style.display = "none"; });
document.querySelectorAll(".nav-btn").forEach((button)=>{ button.classList.toggle("active", button.dataset.page === page); });
document.getElementById(page).style.display = "block";
if(page === "pointages"){ renderPointages(); }
if(page === "presence"){ renderPresence(); }
if(page === "staff" && canManageStaff()){ renderStaffList(); }
if(page === "hierarchie"){ renderHierarchyDetails(); }
if(page === "planning"){ renderPlanning(); }
if(page === "annonces"){ renderAnnouncements(); }
if(page === "logs"){ renderLogs(); }
if(page === "archives"){ renderArchives(); }
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

if(currentUser.role === "manager" && !canManageDepartment(targetUser.department) && targetUser.username !== currentUser.username){
message.innerText = "Tu ne peux pointer que les membres de tes poles.";
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
const dateFilter = document.getElementById("filterPointageDate").value;
const fromFilter = document.getElementById("filterPointageFrom").value;
const toFilter = document.getElementById("filterPointageTo").value;
return getVisiblePointages().filter((item)=>{
const matchesName = !nameFilter || item.nom.toLowerCase().includes(nameFilter);
const matchesDepartment = !departmentFilter || item.department === departmentFilter;
const matchesStatus = !statusFilter || item.status === statusFilter;
const matchesDate = !dateFilter || toDateKey(item.savedAt) === dateFilter;
const itemDate = toDateKey(item.savedAt);
const matchesFrom = !fromFilter || itemDate >= fromFilter;
const matchesTo = !toFilter || itemDate <= toFilter;
return matchesName && matchesDepartment && matchesStatus && matchesDate && matchesFrom && matchesTo;
});
}

function canDeletePointage(pointage){
if(canManageAll()){ return true; }
return pointage.createdBy === currentUser.username;
}

function renderPointagePersonDetail(summary){
const container = document.getElementById("pointagePersonDetail");
if(!container){
return;
}

if(!summary){
container.classList.add("hidden");
container.innerHTML = "";
return;
}

container.classList.remove("hidden");
const totals = getPointageTotalsForUser(summary.key);
const rangeTotals = getPointageRangeTotals(summary.key);
container.innerHTML =
"<p class='eyebrow'>Detail pointages</p>" +
"<h2>" + summary.nom + "</h2>" +
"<p>Total cumule : <strong>" + formatDuration(summary.totalMinutes) + "</strong> sur " + summary.pointages.length + " service(s). Semaine : <strong>" + formatDuration(totals.weekMinutes) + "</strong>. Mois : <strong>" + formatDuration(totals.monthMinutes) + "</strong>. Periode choisie : <strong>" + formatDuration(rangeTotals.totalMinutes) + "</strong>. Heures supp estimees : <strong>" + formatDuration(rangeTotals.overtimeMinutes) + "</strong>.</p>" +
"<div class='pointage-detail-list'>" +
summary.pointages.map((item)=>{
const deleteBtn = canDeletePointage(item) ? "<button class='danger-btn' onclick=\"deletePointage('" + item.id + "')\">Supprimer</button>" : "";
const durationLabel = formatDuration(getPointageMinutes(item));
const planningEntry = findPlanningEntryForUserDate(item.createdBy, toDateKey(item.savedAt));
const lateMinutes = planningEntry ? getLateMinutesForEntry(planningEntry) : 0;
const lateLine = lateMinutes > 0 ? "<br>Retard detecte : " + lateMinutes + " min" : "";
return "<div class='pointage-detail-item'><div class='pointage-detail-head'><div><span class='dept-badge'>" + getDepartmentLabel(item.department) + "</span> <span class='status-badge " + item.status + "'>" + getStatusLabel(item.status) + "</span></div><span class='pointage-total-badge'>Duree " + durationLabel + "</span></div><strong>" + item.nom + "</strong><div class='pointage-meta'>Arrivee : " + item.entree + "<br>Sortie : " + item.sortie + "<br>Enregistre le : " + item.savedAt + lateLine + "</div><div class='staff-actions'>" + deleteBtn + "</div></div>";
}).join("") +
"</div>";
}

function renderPointages(){
const container = document.getElementById("pointagesList");
const detailContainer = document.getElementById("pointagePersonDetail");
const exportPanel = document.getElementById("pointageExportPanel");
if(exportPanel){
exportPanel.classList.toggle("hidden", !hasAdminAccess());
}
const visiblePointages = getFilteredPointages();
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

const activeSummary = groupedPointages.find((group)=> group.key === selectedPointageUser) || groupedPointages[0];
const totals = activeSummary ? getPointageTotalsForUser(activeSummary.key) : { weekMinutes: 0, monthMinutes: 0 };
const rangeTotals = activeSummary ? getPointageRangeTotals(activeSummary.key) : { totalMinutes: 0, overtimeMinutes: 0 };
document.getElementById("pointageWeekTotal").innerText = formatDuration(totals.weekMinutes);
document.getElementById("pointageMonthTotal").innerText = formatDuration(totals.monthMinutes);
document.getElementById("pointagePeriodTotal").innerText = formatDuration(rangeTotals.totalMinutes);
document.getElementById("pointageOvertimeTotal").innerText = formatDuration(rangeTotals.overtimeMinutes);

container.innerHTML = groupedPointages.map((group)=>{
const latestPointage = group.pointages[0];
const isActive = group.key === selectedPointageUser;
return "<div class='pointage-item pointage-summary-card" + (isActive ? " active-pointage" : "") + "' onclick=\"showPointagePerson('" + group.key + "')\"><div class='pointage-summary-top'><div><span class='dept-badge'>" + getDepartmentLabel(group.department) + "</span> <span class='status-badge " + latestPointage.status + "'>" + getStatusLabel(latestPointage.status) + "</span></div><span class='pointage-total-badge'>Total " + formatDuration(group.totalMinutes) + "</span></div><strong>" + group.nom + "</strong><div class='pointage-meta'>" + group.pointages.length + " pointage(s)<br>Dernier enregistrement : " + latestPointage.savedAt + "</div></div>";
}).join("");

renderPointagePersonDetail(activeSummary || null);
}

function exportPointages(){
if(!hasAdminAccess()){
showMessage("saveMsg", "Seuls les responsables peuvent exporter les pointages.", true);
return;
}
const visiblePointages = getFilteredPointages();
const selectedUser = selectedPointageUser ? getUsers().find((user)=> user.username === selectedPointageUser) : null;
const totals = selectedPointageUser ? getPointageTotalsForUser(selectedPointageUser) : { weekMinutes: 0, monthMinutes: 0 };
const filters = [
document.getElementById("filterEmployee").value.trim() ? "Employe : " + document.getElementById("filterEmployee").value.trim() : null,
document.getElementById("filterDepartment").value ? "Pole : " + getDepartmentLabel(document.getElementById("filterDepartment").value) : null,
document.getElementById("filterStatus").value ? "Statut : " + getStatusLabel(document.getElementById("filterStatus").value) : null,
document.getElementById("filterPointageDate").value ? "Date : " + document.getElementById("filterPointageDate").value : null
].filter(Boolean).join(" | ") || "Aucun filtre";
const rowsHtml = visiblePointages.length ? visiblePointages.map((item)=> "<tr><td>" + item.nom + "</td><td>" + getDepartmentLabel(item.department) + "</td><td>" + getStatusLabel(item.status) + "</td><td>" + item.entree + "</td><td>" + item.sortie + "</td><td>" + formatDuration(getPointageMinutes(item)) + "</td><td>" + item.savedAt + "</td></tr>").join("") : "<tr><td colspan='7'>Aucun pointage a exporter.</td></tr>";
const reportWindow = window.open("", "_blank", "width=1100,height=800");
if(!reportWindow){
return;
}
reportWindow.document.write("<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Galaxy Pointages PDF</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111827;background:#ffffff;}h1{margin:0 0 8px;font-size:28px;}p{margin:0 0 10px;color:#4b5563;}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px;}th,td{border:1px solid #d1d5db;padding:10px 12px;text-align:left;vertical-align:top;}th{background:#111827;color:#ffffff;}tbody tr:nth-child(even){background:#f9fafb;}.meta{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;margin-top:20px;}.meta-card{padding:14px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb;}.meta-card strong{display:block;margin-bottom:6px;}@media print{body{padding:18px;}}</style></head><body><h1>Galaxy Night Club - Export pointages</h1><p>Genere le " + new Date().toLocaleString("fr-FR") + "</p><p>Filtres : " + filters + "</p><div class='meta'><div class='meta-card'><strong>Total semaine</strong><span>" + formatDuration(totals.weekMinutes) + "</span></div><div class='meta-card'><strong>Total mois</strong><span>" + formatDuration(totals.monthMinutes) + "</span></div><div class='meta-card'><strong>Nombre de lignes</strong><span>" + visiblePointages.length + "</span></div><div class='meta-card'><strong>Utilisateur selectionne</strong><span>" + (selectedUser ? selectedUser.displayName : "Tous") + "</span></div></div><table><thead><tr><th>Nom</th><th>Pole</th><th>Statut</th><th>Arrivee</th><th>Sortie</th><th>Duree</th><th>Date</th></tr></thead><tbody>" + rowsHtml + "</tbody></table><script>window.onload = function(){ window.print(); }<\/script></body></html>");
reportWindow.document.close();
}

function getVisiblePlanningEntries(){
return getPlanningEntries().filter((entry)=> canManageAll() || canManageDepartment(entry.department) || entry.username === currentUser.username);
}

function getVisibleAnnouncements(){
const today = new Date();
today.setHours(0, 0, 0, 0);
return getAnnouncements().filter((entry)=>{
if(!entry.visibleUntil){
return true;
}
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
if(!currentUser || !user){
return false;
}
if(canManageAll()){
return true;
}
if(user.username === currentUser.username){
return true;
}
return canManageDepartment(user.department);
}

function getPresenceEntriesForDate(dateValue = getPresenceDateValue()){
return getPresenceEntries().filter((entry)=> entry.date === dateValue);
}

function getPresenceEntryForUser(username, dateValue = getPresenceDateValue()){
return getPresenceEntriesForDate(dateValue).find((entry)=> entry.username === username) || null;
}

function shouldShowPresencePrompt(){
if(!currentUser){
return false;
}
const today = getTodayDateInputValue();
if(presencePromptSessionDate === today){
return false;
}
const entry = getPresenceEntryForUser(currentUser.username, today);
return !entry || entry.status === "pending";
}

function populatePresenceTargetOptions(){
const select = document.getElementById("presenceTargetUser");
if(!select || !currentUser){
return;
}
const scopedUsers = getPresenceScopeUsers();
select.innerHTML = scopedUsers.map((user)=> "<option value=\"" + user.username + "\">" + user.displayName + "</option>").join("");
if(currentUser.role === "staff"){
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
if(!target || !currentUser){
return;
}
const entry = getPresenceEntryForUser(currentUser.username, dateValue);
target.innerText = entry
? getPresenceStatusLabel(entry.status) + (entry.note ? " - " + entry.note : "")
: "Aucune reponse enregistree pour le moment.";
}

function renderPresence(){
const list = document.getElementById("presenceList");
if(!list || !currentUser){
return;
}

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

const presentCount = visibleEntries.filter((entry)=> entry.status === "present").length;
const absentCount = visibleEntries.filter((entry)=> entry.status === "absent").length;
const pendingCount = visibleEntries.filter((entry)=> entry.status === "pending").length;

document.getElementById("presencePresentCount").innerText = String(presentCount);
document.getElementById("presenceAbsentCount").innerText = String(absentCount);
document.getElementById("presencePendingCount").innerText = String(pendingCount);
document.getElementById("presenceReminderText").innerText = canManageAll()
? "Tu peux suivre les reponses de tout le club pour la date selectionnee."
: "Tu peux repondre pour toi et gerer les membres de tes poles.";

populatePresenceTargetOptions();
updatePresenceSelfStatus(dateValue);

list.innerHTML = visibleEntries.map((entry)=>{
const canEdit = canManagePresenceForUser(entry);
const statusLabel = getPresenceStatusLabel(entry.status);
const noteLine = entry.note ? "<br>Note : " + entry.note : "";
const updatedLine = entry.updatedAt ? "<br>Mis a jour le : " + entry.updatedAt + (entry.updatedBy ? " par " + entry.updatedBy : "") : "";
return "<div class='staff-item presence-item " + entry.status + "'><div class='presence-badge-row'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><span class='presence-status-badge " + entry.status + "'>" + statusLabel + "</span></div><strong>" + entry.displayName + "</strong><div class='staff-meta'>Date : " + dateValue + noteLine + updatedLine + "</div><div class='staff-actions'>" + (canEdit ? "<button class='secondary-btn' type='button' onclick=\"fillPresenceForm('" + entry.username + "')\">Modifier</button>" : "") + "</div></div>";
}).join("") || "<div class='staff-item'><strong>Aucun staff</strong><div class='staff-meta'>Aucun membre visible pour cette presence.</div></div>";
}

function fillPresenceForm(username){
const select = document.getElementById("presenceTargetUser");
const status = document.getElementById("presenceStatus");
const note = document.getElementById("presenceNote");
if(!select || !status || !note){
return;
}
select.value = username;
const entry = getPresenceEntryForUser(username, getPresenceDateValue());
status.value = entry ? entry.status : "present";
note.value = entry ? (entry.note || "") : "";
}

async function savePresenceCollection(entries){
setPresenceEntries(entries);
if(currentUser){
renderPresence();
renderDashboardSummary();
}
}

async function persistPresenceEntry(targetUser, dateValue, status, note = ""){
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

const nextEntries = [entry, ...getPresenceEntries().filter((item)=> !(item.username === targetUser.username && item.date === dateValue))];

if(canUseFirestoreWrites()){
await setDoc(doc(db, "presenceEntries", entry.id), entry);
}

await savePresenceCollection(nextEntries);

if(targetUser.username === currentUser.username && dateValue === getTodayDateInputValue()){
presencePromptSessionDate = dateValue;
}

return entry;
}

async function submitPresence(){
if(!currentUser){
return;
}
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

if(canUseFirestoreWrites()){
try{
await persistPresenceEntry(targetUser, dateValue, status, note);
} catch (error){
console.error("Presence save error:", error);
message.innerText = "Firebase refuse l'enregistrement de la presence.";
return;
}
} else {
await persistPresenceEntry(targetUser, dateValue, status, note);
}
message.innerText = "Presence enregistree pour " + targetUser.displayName + ".";
document.getElementById("presenceNote").value = "";
await logAdminAction("presence_update", "presence", "Presence mise a jour", targetUser.displayName + " - " + getPresenceStatusLabel(status));
renderPresence();
}

async function submitPresencePrompt(status){
if(!currentUser){
return;
}
const message = document.getElementById("presencePromptMsg");
if(!["present", "absent", "pending"].includes(status)){
message.innerText = "Choix invalide.";
return;
}

try{
await persistPresenceEntry(currentUser, getTodayDateInputValue(), status, "");
hidePresencePromptModal();
renderPresence();
renderDashboardSummary();
} catch (error){
console.error("Presence prompt save error:", error);
message.innerText = "Impossible d'enregistrer ta reponse pour le moment.";
}
}

function getAnnouncementReceiptId(announcementId, username){
return announcementId + "__" + username;
}

function getAnnouncementReadsFor(announcementId){
return getAnnouncementReads().filter((entry)=> entry.announcementId === announcementId);
}

function hasUserReadAnnouncement(entry, user = currentUser){
if(!entry){
return false;
}
if(!entry.requireAck){
return true;
}
if(!user){
return false;
}
return getAnnouncementReadsFor(entry.id).some((receipt)=> receipt.username === user.username);
}

function getAnnouncementAudienceCount(){
return getUsers().filter((user)=> user.active !== false).length || 1;
}

async function saveAnnouncementReadReceipt(entry){
if(!currentUser || !entry){
return;
}

const receipt = {
id: getAnnouncementReceiptId(entry.id, currentUser.username),
announcementId: entry.id,
username: currentUser.username,
displayName: currentUser.displayName,
uid: auth && auth.currentUser ? auth.currentUser.uid : "",
readAt: new Date().toISOString()
};

const nextReads = sortByDateField([
receipt,
...getAnnouncementReads().filter((item)=> item.id !== receipt.id)
], "readAt");
setAnnouncementReads(nextReads);

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "announcementReads", receipt.id), receipt);
} catch (error){
console.error("Announcement read receipt error:", error);
}
}
}

async function acknowledgeAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !entry.requireAck || !currentUser || hasUserReadAnnouncement(entry)){
return;
}

await saveAnnouncementReadReceipt(entry);
renderAnnouncements();
renderDashboardSummary();
}

async function deleteAnnouncementReads(announcementId){
setAnnouncementReads(getAnnouncementReads().filter((entry)=> entry.announcementId !== announcementId));
if(!canUseFirestoreWrites()){
return;
}

try{
const snapshot = await getDocs(query(collection(db, "announcementReads"), where("announcementId", "==", announcementId)));
for(const entry of snapshot.docs){
await deleteDoc(doc(db, "announcementReads", entry.id));
}
} catch (error){
console.error("Announcement reads delete error:", error);
}
}

function refreshPlanningStaffOptions(){
const dataList = document.getElementById("planningStaffList");
if(!dataList){
return;
}
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
return getPlanningEntries()
.filter((entry)=> entry.username === username && entry.date === dateKey)
.sort((first, second)=> first.start.localeCompare(second.start))[0] || null;
}

function getServicePointagesForUserDate(username, dateKey){
return getPointages()
.filter((entry)=> entry.createdBy === username && toDateKey(entry.savedAt) === dateKey)
.sort((first, second)=> String(first.savedAt).localeCompare(String(second.savedAt)));
}

function getLateMinutesForEntry(entry){
const firstPointage = getServicePointagesForUserDate(entry.username, entry.date).find((item)=> item.status !== "absent");
if(!firstPointage || !firstPointage.entree || firstPointage.entree === "-"){
return 0;
}
const [plannedHours, plannedMinutes] = entry.start.split(":").map(Number);
const [actualHours, actualMinutes] = firstPointage.entree.split(":").map(Number);
const plannedTotal = plannedHours * 60 + plannedMinutes + 5;
const actualTotal = actualHours * 60 + actualMinutes;
return Math.max(0, actualTotal - plannedTotal);
}

function getPlanningStateLabel(entry){
const pointages = getServicePointagesForUserDate(entry.username, entry.date);
if(pointages.some((item)=> item.status === "absent")){
return "Absent";
}
const lateMinutes = getLateMinutesForEntry(entry);
if(lateMinutes > 0){
return "Retard " + lateMinutes + " min";
}
if(pointages.length){
return "Pointe";
}
const entryDateTime = new Date(entry.date + "T" + entry.start + ":00");
if(entryDateTime < new Date()){
return "A surveiller";
}
return "A venir";
}

function getPointageRangeTotals(username){
const fromValue = document.getElementById("filterPointageFrom").value;
const toValue = document.getElementById("filterPointageTo").value;
const filtered = getVisiblePointages().filter((item)=> !username || item.createdBy === username).filter((item)=>{
const itemDate = toDateKey(item.savedAt);
if(fromValue && itemDate < fromValue){
return false;
}
if(toValue && itemDate > toValue){
return false;
}
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
return {
totalMinutes,
overtimeMinutes: Math.max(0, totalMinutes - expectedMinutes)
};
}

function renderPlanning(){
const container = document.getElementById("planningList");
const summaryContainer = document.getElementById("planningCalendarSummary");
if(!container){
return;
}

const dateFilter = document.getElementById("planningFilterDate").value;
const departmentFilter = document.getElementById("planningFilterDepartment").value;
const visibleEntries = getVisiblePlanningEntries().filter((entry)=>{
const matchesDate = !dateFilter || entry.date === dateFilter;
const matchesDepartment = !departmentFilter || entry.department === departmentFilter;
return matchesDate && matchesDepartment;
});
const windowEntries = getPlanningWindowEntries(visibleEntries);
const entriesToRender = windowEntries.length ? windowEntries : visibleEntries;
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
const editButton = canEdit ? "<button class='secondary-btn' onclick=\"editPlanningEntry('" + entry.id + "')\">Modifier</button>" : "";
const deleteButton = canEdit ? "<button class='danger-btn' onclick=\"deletePlanningEntry('" + entry.id + "')\">Supprimer</button>" : "";
const duplicateButton = canEdit ? "<button class='secondary-btn' onclick=\"duplicatePlanningEntry('" + entry.id + "')\">Dupliquer</button>" : "";
const statusLabel = getPlanningStateLabel(entry);
return "<div class='staff-item planning-item " + getDepartmentThemeClass(entry.department) + "'><span class='dept-badge'>" + getDepartmentLabel(entry.department) + "</span><strong>" + entry.displayName + "</strong><div class='staff-meta'>Date : " + entry.date + "<br>Service : " + entry.start + " - " + entry.end + "<br>Etat : " + statusLabel + (entry.note ? "<br>Note : " + entry.note : "") + "</div><div class='staff-actions'>" + editButton + duplicateButton + deleteButton + "</div></div>";
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
if(clearMessage){
document.getElementById("planningMsg").innerText = "";
}
}

async function savePlanningCollection(entries){
setPlanningEntries(entries);
if(currentUser){
renderPlanning();
renderDashboardSummary();
}
}

async function submitPlanningEntry(){
if(!canEditPlanning()){
return;
}

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
const entry = {
id: editingPlanningId || makeId(),
username: matchingUser ? matchingUser.username : getEmailLocalPart(displayName),
displayName,
department,
date,
start,
end,
note,
updatedBy: currentUser.displayName,
createdAt: new Date().toISOString()
};

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "planningEntries", entry.id), entry);
} catch (error){
console.error("Planning save error:", error);
message.innerText = "Impossible d'enregistrer le planning sur Firebase.";
return;
}
}

const existingEntries = getPlanningEntries().filter((item)=> item.id !== entry.id);
await savePlanningCollection(sortByDateField([entry, ...existingEntries], "date"));
await logAdminAction(editingPlanningId ? "planning_update" : "planning_create", "planning", editingPlanningId ? "Planning modifie" : "Planning ajoute", displayName + " - " + date + " " + start + "/" + end);
message.innerText = editingPlanningId ? "Planning modifie." : "Planning ajoute.";
resetPlanningForm(true);
}

function editPlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){
return;
}

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

function duplicatePlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){
return;
}
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

function cancelPlanningEdit(){
resetPlanningForm(true);
renderPlanning();
}

async function deletePlanningEntry(id){
const entry = getPlanningEntries().find((item)=> item.id === id);
if(!entry || !canManageDepartment(entry.department)){
return;
}

if(canUseFirestoreWrites()){
try{
await deleteDoc(doc(db, "planningEntries", id));
} catch (error){
console.error("Planning delete error:", error);
}
}

await savePlanningCollection(getPlanningEntries().filter((item)=> item.id !== id));
await logAdminAction("planning_delete", "planning", "Planning supprime", entry.displayName + " - " + entry.date);
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
if(clearMessage){
document.getElementById("announcementMsg").innerText = "";
}
}

function renderAnnouncements(){
const container = document.getElementById("announcementsList");
if(!container){
return;
}

const announcements = getVisibleAnnouncements();
if(!announcements.length){
container.innerHTML = "<div class='staff-item'><strong>Aucune annonce</strong><div class='staff-meta'>Aucune note interne active pour le moment.</div></div>";
return;
}

container.innerHTML = announcements.map((entry)=>{
const canEdit = canEditAnnouncements();
const editButton = canEdit ? "<button class='secondary-btn' onclick=\"editAnnouncement('" + entry.id + "')\">Modifier</button>" : "";
const deleteButton = canEdit ? "<button class='danger-btn' onclick=\"deleteAnnouncement('" + entry.id + "')\">Supprimer</button>" : "";
const receipts = getAnnouncementReadsFor(entry.id);
const readCount = receipts.length;
const audienceCount = getAnnouncementAudienceCount();
const readNames = receipts.map((receipt)=> receipt.displayName).join(", ");
const requiresAck = entry.requireAck === true;
const isRead = hasUserReadAnnouncement(entry);
const ackButton = requiresAck && !isRead ? "<button class='primary-btn' onclick=\"acknowledgeAnnouncement('" + entry.id + "')\">Marquer comme lu</button>" : "";
const readState = requiresAck ? "<span class='announcement-pill " + (isRead ? "read" : "unread") + "'>" + (isRead ? "Lu" : "A lire") + "</span>" : "";
const ackState = requiresAck ? "<span class='announcement-pill ack'>Accuses : " + readCount + "/" + audienceCount + "</span>" : "";
const readList = requiresAck && canEdit ? "<div class='announcement-read-list'>Lus par : " + (readNames || "personne pour le moment") + ".</div>" : "";
return "<div class='staff-item announcement-item priority-" + entry.priority + "'><span class='dept-badge'>" + entry.priority + "</span><strong>" + entry.title + "</strong><div class='staff-meta'>" + entry.body + "<br>Visible jusqu'au : " + (entry.visibleUntil || "sans limite") + "<br>Publie par : " + entry.createdBy + "</div><div class='announcement-meta-row'>" + readState + ackState + "</div>" + readList + "<div class='announcement-card-actions'>" + ackButton + editButton + deleteButton + "</div></div>";
}).join("");
}

async function submitAnnouncement(){
if(!canEditAnnouncements()){
return;
}

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

const entry = {
id: editingAnnouncementId || makeId(),
title,
priority,
visibleUntil,
body,
requireAck,
createdBy: currentUser.displayName,
createdAt: new Date().toISOString()
};

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "announcements", entry.id), entry);
} catch (error){
console.error("Announcement save error:", error);
message.innerText = "Impossible d'enregistrer l'annonce sur Firebase.";
return;
}
}

setAnnouncements(sortByDateField([entry, ...getAnnouncements().filter((item)=> item.id !== entry.id)]));
if(previousEntry){
await deleteAnnouncementReads(entry.id);
}
await logAdminAction(editingAnnouncementId ? "announcement_update" : "announcement_create", "announcement", editingAnnouncementId ? "Annonce modifiee" : "Annonce creee", title);
message.innerText = editingAnnouncementId ? "Annonce modifiee." : "Annonce publiee.";
resetAnnouncementForm(true);
renderAnnouncements();
renderDashboardSummary();
}

function editAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !canEditAnnouncements()){
return;
}

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

async function deleteAnnouncement(id){
const entry = getAnnouncements().find((item)=> item.id === id);
if(!entry || !canEditAnnouncements()){
return;
}

if(canUseFirestoreWrites()){
try{
await deleteDoc(doc(db, "announcements", id));
} catch (error){
console.error("Announcement delete error:", error);
}
}

setAnnouncements(getAnnouncements().filter((item)=> item.id !== id));
await deleteAnnouncementReads(id);
await logAdminAction("announcement_delete", "announcement", "Annonce supprimee", entry.title);
renderAnnouncements();
renderDashboardSummary();
}

function renderLogs(){
const container = document.getElementById("logsList");
if(!container){
return;
}

if(!canViewLogs()){
container.innerHTML = "<div class='staff-item'><strong>Acces reserve</strong><div class='staff-meta'>Seule la direction peut consulter les logs admin.</div></div>";
return;
}

const logs = getAdminLogs();
if(!logs.length){
container.innerHTML = "<div class='staff-item'><strong>Aucun log</strong><div class='staff-meta'>Aucune action importante enregistree pour le moment.</div></div>";
return;
}

container.innerHTML = logs.slice(0, 80).map((entry)=>{
const viewed = entry.viewed === true;
const viewedBadge = "<span class='announcement-pill " + (viewed ? "read" : "unread") + "'>" + (viewed ? "Vu" : "Non vu") + "</span>";
const toggleButton = "<button class='secondary-btn' type='button' onclick=\"toggleLogViewed('" + entry.id + "')\">" + (viewed ? "Marquer non vu" : "Marquer vu") + "</button>";
return "<div class='staff-item'><div class='announcement-meta-row'><span class='dept-badge'>" + entry.action + "</span>" + viewedBadge + "</div><strong>" + entry.title + "</strong><div class='staff-meta'>" + entry.details + "<br>Par : " + entry.createdBy + "<br>Le : " + entry.createdAt + "</div><div class='staff-actions'>" + toggleButton + "</div></div>";
}).join("");
}

async function toggleLogViewed(id){
if(!canViewLogs()){
return;
}
const logs = getAdminLogs();
const targetLog = logs.find((entry)=> entry.id === id);
if(!targetLog){
return;
}

targetLog.viewed = !(targetLog.viewed === true);
setAdminLogs([...logs]);

if(canUseFirestoreWrites()){
try{
await setDoc(doc(db, "adminLogs", targetLog.id), targetLog);
} catch (error){
console.error("Log viewed toggle error:", error);
showMessage("logsMsg", "Impossible de synchroniser ce log pour le moment.", true);
return;
}
}

showMessage("logsMsg", targetLog.viewed ? "Log marque comme vu." : "Log remis en non vu.");
renderLogs();
}

async function markAllLogsViewed(){
if(!canViewLogs()){
return;
}
const logs = getAdminLogs();
const pendingLogs = logs.filter((entry)=> entry.viewed !== true);
if(!pendingLogs.length){
showMessage("logsMsg", "Tous les logs sont deja vus.");
return;
}

const nextLogs = logs.map((entry)=> ({ ...entry, viewed: true }));
setAdminLogs(nextLogs);

if(canUseFirestoreWrites()){
try{
for(const entry of nextLogs){
await setDoc(doc(db, "adminLogs", entry.id), entry);
}
} catch (error){
console.error("Mark all logs viewed error:", error);
showMessage("logsMsg", "Impossible de synchroniser tous les logs pour le moment.", true);
return;
}
}

showMessage("logsMsg", "Tous les logs ont ete marques comme vus.");
renderLogs();
}

async function deleteViewedLogs(){
if(!canViewLogs()){
return;
}
const logs = getAdminLogs();
const viewedLogs = logs.filter((entry)=> entry.viewed === true);
if(!viewedLogs.length){
showMessage("logsMsg", "Aucun log vu a supprimer.");
return;
}

const remainingLogs = logs.filter((entry)=> entry.viewed !== true);

if(canUseFirestoreWrites()){
try{
for(const entry of viewedLogs){
await deleteDoc(doc(db, "adminLogs", entry.id));
}
} catch (error){
console.error("Delete viewed logs error:", error);
showMessage("logsMsg", "Impossible de supprimer les logs vus pour le moment.", true);
return;
}
}

setAdminLogs(remainingLogs);
showMessage("logsMsg", viewedLogs.length + " log(s) vu(s) supprime(s).");
renderLogs();
}

function renderArchives(){
const staffContainer = document.getElementById("archivedStaffList");
const pointageContainer = document.getElementById("archivedPointagesList");
const noteContainer = document.getElementById("archivedNotesList");
if(!staffContainer || !pointageContainer || !noteContainer){
return;
}

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
const activePointages = new Map();
todayPointages.forEach((entry)=>{
activePointages.set(entry.createdBy, entry);
});

const connectedStaff = Array.from(activePointages.values()).filter((entry)=> entry.status === "en-service").length;
const absences = todayPointages.filter((entry)=> entry.status === "absent").length;
const presencePending = getPresenceScopeUsers().filter((user)=> !getPresenceEntryForUser(user.username, todayKey) || getPresenceEntryForUser(user.username, todayKey).status === "pending").length;
const planningToday = getVisiblePlanningEntries().filter((entry)=> entry.date === todayKey);
const latestPointage = [...pointages].sort((first, second)=> String(second.savedAt).localeCompare(String(first.savedAt)))[0];
const announcement = getVisibleAnnouncements()[0];
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
if(absences){
alerts.push(absences + " absence(s) aujourd'hui.");
}
if(lateEntries.length){
alerts.push(lateEntries.length + " retard(s) detecte(s).");
}
if(planningToday.length && connectedStaff < planningToday.length){
alerts.push((planningToday.length - connectedStaff) + " staff attendu(s) pas encore en service.");
}
if(todayPresence.length && presencePending){
alerts.push(presencePending + " presence(s) en attente.");
}
if(announcement && announcement.priority === "urgent"){
alerts.push("Annonce urgente active sur le club.");
}
if(!alerts.length){
alerts.push("Aucune alerte critique pour le moment.");
}
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

async function deletePointage(id){
const pointage = getPointages().find((item)=> item.id === id);
if(!pointage || !canDeletePointage(pointage)){ return; }

const archivedEntry = {
...pointage,
id: makeId(),
archivedAt: new Date().toISOString(),
archivedBy: currentUser.displayName
};

try{
if(canUseFirestoreWrites()){
await setDoc(doc(db, "archivedPointages", archivedEntry.id), archivedEntry);
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

setArchivedPointages([archivedEntry, ...getArchivedPointages()].slice(0, 200));
await logAdminAction("pointage_delete", "pointage", "Pointage supprime", pointage.nom + " - " + pointage.savedAt);

renderApp();
show("pointages");
}

function showPointagePerson(username){
selectedPointageUser = username;
renderPointages();
}

function submitStaffForm(){
if(editingUsername){ updateStaff(); return; }
addStaff();
}

async function addStaff(){
if(!canManageStaff()){ return; }
const displayNameInput = document.getElementById("newDisplayName");
const emailInput = document.getElementById("newEmail");
const discordIdInput = document.getElementById("newDiscordId");
const passwordInput = document.getElementById("newPassword");
const roleInput = document.getElementById("newRole");
const departmentInput = document.getElementById("newDepartment");
const dateJoinedInput = document.getElementById("newDateJoined");
const activeInput = document.getElementById("newActive");
const mustChangePasswordInput = document.getElementById("newMustChangePassword");
const message = document.getElementById("staffMsg");
const displayName = displayNameInput.value.trim();
const email = emailInput.value.trim().toLowerCase();
const discordId = (discordIdInput.value || "").trim();
const username = getEmailLocalPart(email);
const password = passwordInput.value.trim();
const role = canManageAll() ? roleInput.value : "staff";
const department = departmentInput.value;
const dateJoined = dateJoinedInput.value || getTodayDateInputValue();
const active = activeInput.checked;
const mustChangePassword = mustChangePasswordInput.checked;
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
const newUser = { username: username, email: email, firebaseUid: "", discordId: discordId, password: password, role: role, department: department, displayName: displayName, dateJoined: dateJoined, active: active, mustChangePassword: mustChangePassword };

if(isHostedFirebaseMode()){
message.innerText = "Creation du compte Firebase en cours...";
try{
newUser.firebaseUid = await createFirebaseStaffAccount(email, password);
await saveStaffProfileToFirestore(newUser);
await syncAccessProfileToFirestore(newUser, newUser.firebaseUid);
} catch (error){
console.error("Firebase staff create error:", error);
message.innerText = getFirebaseStaffErrorMessage(error, "Impossible de creer le compte Firebase.");
return;
}
}

users.push(newUser);
setUsers(users);
updateCredentialsPreview(buildCredentialsMessage(newUser, password));
await logAdminAction("staff_create", "staff", "Compte staff cree", displayName + " - " + getDepartmentLabel(department));
message.innerText = isHostedFirebaseMode() ? "Compte Firebase et profil staff crees pour " + displayName + "." : "Compte cree pour " + displayName + ".";
resetStaffForm(true);
renderApp();
show("staff");
}

function editStaff(username){
const targetUser = getUsers().find((user)=> user.username === username);
if(!canManageUser(targetUser)){ return; }
const hostedFirebaseMode = isHostedFirebaseMode();
editingUsername = username;
document.getElementById("newDisplayName").value = targetUser.displayName;
document.getElementById("newEmail").value = getUserEmail(targetUser);
document.getElementById("newDiscordId").value = targetUser.discordId || "";
document.getElementById("newPassword").value = hostedFirebaseMode ? "" : targetUser.password;
document.getElementById("newPassword").placeholder = hostedFirebaseMode ? "Le mot de passe Firebase ne se change pas ici" : "Mot de passe du compte";
document.getElementById("newRole").value = canManageAll() ? targetUser.role : "staff";
document.getElementById("newDepartment").value = targetUser.department;
document.getElementById("newDateJoined").value = targetUser.dateJoined || "";
document.getElementById("newActive").checked = targetUser.active !== false;
document.getElementById("newMustChangePassword").checked = targetUser.mustChangePassword === true;
document.getElementById("newEmail").readOnly = hostedFirebaseMode;
document.getElementById("staffSubmitBtn").innerText = "Modifier le compte";
document.getElementById("staffCancelBtn").classList.remove("hidden");
document.getElementById("staffMsg").innerText = hostedFirebaseMode ? "Mode modification actif pour " + targetUser.displayName + ". Email et mot de passe Firebase se gerent a part." : "Mode modification actif pour " + targetUser.displayName + ".";
}

async function updateStaff(){
const users = getUsers();
const targetUser = users.find((user)=> user.username === editingUsername);
const message = document.getElementById("staffMsg");
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
if(!displayName || !email || (!password && !isHostedFirebaseMode())){
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
targetUser.password = password || targetUser.password || "";
targetUser.role = role;
targetUser.department = department;
targetUser.dateJoined = dateJoined;
targetUser.active = active;
targetUser.mustChangePassword = mustChangePassword;

if(isHostedFirebaseMode()){
try{
await saveStaffProfileToFirestore(targetUser, previousUsername);
await syncAccessProfileToFirestore(targetUser, targetUser.firebaseUid);
} catch (error){
console.error("Firebase staff update error:", error);
message.innerText = getFirebaseStaffErrorMessage(error, "Impossible de mettre a jour le profil staff dans Firebase.");
return;
}
}

setUsers(users);
updateCredentialsPreview(buildCredentialsMessage(targetUser));

if(!firebaseEnabled){
setLocalPointages(getPointages().map((item)=> item.createdBy === previousUsername ? { ...item, nom: displayName, department: department, createdBy: nextUsername } : item));
}

if(currentUser.username === previousUsername){
currentUser = targetUser;
localStorage.setItem(storageKeys.session, JSON.stringify(targetUser));
}
await logAdminAction("staff_update", "staff", "Compte staff modifie", displayName + " - " + getDepartmentLabel(department));
message.innerText = isHostedFirebaseMode() ? "Profil staff mis a jour pour " + displayName + "." : "Compte modifie pour " + displayName + ".";
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
document.getElementById("newDiscordId").value = "";
document.getElementById("newPassword").value = "";
document.getElementById("newDateJoined").value = getTodayDateInputValue();
document.getElementById("newActive").checked = true;
document.getElementById("newMustChangePassword").checked = false;
document.getElementById("newPassword").placeholder = "Mot de passe du compte";
document.getElementById("newEmail").readOnly = false;
document.getElementById("newRole").value = "staff";
document.getElementById("newDepartment").value = canManageAll() ? "bar" : currentUser ? currentUser.department : "bar";
document.getElementById("staffSubmitBtn").innerText = "Ajouter le compte";
document.getElementById("staffCancelBtn").classList.add("hidden");
if(clearMessage){ document.getElementById("staffMsg").innerText = ""; }
updateCredentialsPreview("");
}

async function deleteStaff(username){
const users = getUsers();
const targetUser = users.find((user)=> user.username === username);
if(!canManageUser(targetUser) || !isBossUser()){ return; }
const archivedStaffEntry = {
...targetUser,
id: makeId(),
archivedAt: new Date().toISOString(),
archivedBy: currentUser.displayName
};

if(isHostedFirebaseMode()){
try{
await setDoc(doc(db, "archivedStaff", archivedStaffEntry.id), archivedStaffEntry);
await deleteStaffProfileFromFirestore(username);
await deleteAccessProfileFromFirestore(targetUser.firebaseUid);
} catch (error){
console.error("Firebase staff delete error:", error);
document.getElementById("staffMsg").innerText = getFirebaseStaffErrorMessage(error, "Impossible de retirer ce profil staff de Firebase.");
return;
}
}

setUsers(users.filter((user)=> user.username !== username));

if(!firebaseEnabled){
setLocalPointages(getPointages().filter((item)=> item.createdBy !== username));
}

setArchivedStaff([archivedStaffEntry, ...getArchivedStaff()].slice(0, 200));
await logAdminAction("staff_delete", "staff", "Compte staff supprime", targetUser.displayName + " - " + getDepartmentLabel(targetUser.department));
document.getElementById("staffMsg").innerText = isHostedFirebaseMode() ? "Profil staff retire. Si besoin, supprime aussi l'utilisateur dans Firebase Auth." : "Compte supprime.";
resetStaffForm(false);
renderApp();
show("staff");
}

async function toggleStaffActive(username){
const users = getUsers();
const targetUser = users.find((user)=> user.username === username);
if(!canManageUser(targetUser)){
return;
}
targetUser.active = targetUser.active === false ? true : false;
setUsers(users);
if(isHostedFirebaseMode()){
try{
await saveStaffProfileToFirestore(targetUser);
await syncAccessProfileToFirestore(targetUser, targetUser.firebaseUid);
} catch (error){
console.error("Toggle active sync error:", error);
}
}
await logAdminAction(targetUser.active ? "staff_activate" : "staff_deactivate", "staff", targetUser.active ? "Compte reactive" : "Compte desactive", targetUser.displayName + " - " + getDepartmentLabel(targetUser.department));
document.getElementById("staffMsg").innerText = targetUser.active ? "Compte reactive." : "Compte desactive sans suppression.";
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
const toggleButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"toggleStaffActive('" + user.username + "')\">" + (user.active === false ? "Reactiver" : "Desactiver") + "</button>" : "";
const copyButton = canManageUser(user) ? "<button class='secondary-btn' onclick=\"copyStaffCredentials('" + user.username + "')\">Identifiants</button>" : "";
const deleteButton = canManageUser(user) && isBossUser() ? "<button class='danger-btn' onclick=\"deleteStaff('" + user.username + "')\">Supprimer</button>" : "";
return "<div class='staff-item'><span class='dept-badge'>" + getDepartmentLabel(user.department) + "</span><strong>" + user.displayName + "</strong><div class='staff-meta'>Email : " + getUserEmail(user) + "<br>Discord ID : " + (user.discordId || "-") + "<br>Role : " + getRoleLabel(user) + "<br>Statut : " + getAccountStatusLabel(user) + "<br>Date d'entree : " + (user.dateJoined || "-") + (user.mustChangePassword ? "<br>Mot de passe : changement force a la prochaine connexion" : "") + "</div><div class='staff-actions'>" + editButton + toggleButton + copyButton + deleteButton + "</div></div>";
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
loadSavedCardDescriptions();
loadSavedSections();
setPlanningEntries(getLocalCollection(storageKeys.planning));
setPresenceEntries(getLocalCollection(storageKeys.presence));
setAnnouncements(getLocalCollection(storageKeys.announcements));
setAnnouncementReads(getLocalCollection(storageKeys.announcementReads));
setAdminLogs(getLocalCollection(storageKeys.logs));
setArchivedStaff(getLocalCollection(storageKeys.archivedStaff));
setArchivedPointages(getLocalCollection(storageKeys.archivedPointages));
setArchivedNotes(getLocalCollection(storageKeys.archivedNotes));
sharedSectionsCache = JSON.parse(localStorage.getItem(storageKeys.sharedSections) || "{}");
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
toggleDocSection
});
