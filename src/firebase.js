import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, query, orderBy, limit, runTransaction, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { nextVariant, skuId } from './inventory.js';

const env = import.meta.env;
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
export const configured = Object.values(config).every(Boolean);
export const cloud = env.VITE_CLOUDINARY_CLOUD_NAME || '';
const app = configured ? initializeApp(config) : null;
const auth = app && getAuth(app);
const db = app && getFirestore(app);

export const observeUser = callback => onAuthStateChanged(auth, callback);
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const observeRole = (uid, callback, error) => onSnapshot(doc(db, 'members', uid), snapshot => callback(snapshot.data()?.role || ''), error);
export const observeRows = (name, callback, error, historyLimit = 200) => {
  const base = collection(db, name);
  const target = name === 'history' ? query(base, orderBy('at', 'desc'), limit(historyLimit)) : base;
  return onSnapshot(target, snapshot => callback(snapshot.docs.map(row => ({ ...row.data(), id: row.id }))), error);
};
export const setRole = (uid, role) => setDoc(doc(db, 'members', uid), { role });
export const removeRole = uid => deleteDoc(doc(db, 'members', uid));

export async function writeVariant(action, sku, fields, note) {
  const id = skuId(sku);
  const ref = doc(db, 'variants', id);
  const event = doc(collection(db, 'history'));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const before = snapshot.exists() ? snapshot.data() : null;
    const after = { ...nextVariant(action, before, fields), lastEvent: event.id };
    transaction.set(ref, after);
    transaction.set(event, { sku: id, action, before, after, note, actor: auth.currentUser.uid, at: serverTimestamp() });
  });
}
