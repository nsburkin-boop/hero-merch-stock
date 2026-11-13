import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-hero-merch',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') }
});
const db = uid => env.authenticatedContext(uid).firestore();
const anonymous = env.unauthenticatedContext().firestore();
const admin = db('owner');
const editor = db('editor');
const reader = db('reader');
const variant = { sku: 'HL-1', name: 'Товар', color: 'Чёрный', size: 'M', photo: '', purchase: 1500, retail: 2900, office: 4, warehouse: 9 };
const item = firestore => doc(firestore, 'variants', variant.sku);
function record(transaction, firestore, actor, action, before, fields) {
  const ref = doc(collection(firestore, 'history'));
  const after = { ...fields, lastEvent: ref.id };
  transaction.set(item(firestore), after);
  transaction.set(ref, { sku: variant.sku, action, actor, before, after, note: '', at: serverTimestamp() });
}
async function change(firestore, actor, action, before, fields) {
  const batch = writeBatch(firestore);
  record(batch, firestore, actor, action, before, fields);
  await batch.commit();
}
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'members', 'owner'), { role: 'admin' });
  });
  await assertSucceeds(setDoc(doc(admin, 'members', 'editor'), { role: 'editor' }));
  await assertSucceeds(setDoc(doc(admin, 'members', 'reader'), { role: 'reader' }));
  await assertFails(setDoc(doc(editor, 'members', 'editor'), { role: 'admin' }));
  await assertFails(setDoc(doc(admin, 'members', 'owner'), { role: 'reader' }));
  await assertFails(getDoc(item(anonymous)));
  await assertFails(getDoc(item(db('unlisted'))));
  await assertFails(change(reader, 'reader', 'create', null, variant));
  await assertFails(setDoc(item(editor), { ...variant, lastEvent: '01234567890123456789' }));
  await assertSucceeds(change(editor, 'editor', 'create', null, variant));
  const before = (await assertSucceeds(getDoc(item(reader)))).data();
  await assertFails(change(editor, 'editor', 'transfer', before, { ...before, office: 2, warehouse: 10 }));
  await assertFails(change(editor, 'editor', 'adjust', before, { ...before, office: -1 }));
  await assertFails(change(editor, 'reader', 'edit', before, { ...before, color: 'Белый' }));
  await assertFails(updateDoc(doc(editor, 'history', before.lastEvent), { note: 'Подмена' }));
  function move(amount) {
    return runTransaction(editor, async transaction => {
      const current = (await transaction.get(item(editor))).data();
      if (current.office < amount) throw new Error('insufficient stock');
      record(transaction, editor, 'editor', 'transfer', current, { ...current, office: current.office - amount, warehouse: current.warehouse + amount });
    });
  }
  const concurrent = await Promise.allSettled([move(3), move(3)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  const after = (await getDoc(item(reader))).data();
  assert.deepEqual([after.office, after.warehouse], [1, 12]);
  await assertSucceeds(change(editor, 'editor', 'edit', after, { ...after, color: 'Белый' }));
  const edited = (await getDoc(item(reader))).data();
  await assertSucceeds(change(editor, 'editor', 'adjust', edited, { ...edited, office: 3 }));
  assert.equal((await getDocs(collection(reader, 'history'))).size, 4);
  console.log('Firestore rules and concurrent transfers verified.');
} finally {
  await env.cleanup();
}
