
// functions/index.js
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// --- Existing: place order and auto-deduct wallet ---
exports.placeOrderWithWallet = onCall({ region: 'asia-southeast1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn phải đăng nhập.');

  const { items, total, address, note } = req.data || {};
  if (!Array.isArray(items) || !Number.isFinite(total) || total <= 0) {
    throw new HttpsError('invalid-argument', 'Dữ liệu không hợp lệ.');
  }

  const userRef = db.collection('users').doc(uid);
  const ordersRef = db.collection('orders');
  let orderId = null;

  try{
    await db.runTransaction(async (tx) => {
      const us = await tx.get(userRef);
      const balance = (us.exists && us.data().balance) || 0;
      if (balance < total) throw new HttpsError('failed-precondition', 'Số dư không đủ.');

      tx.update(userRef, { balance: balance - total, updatedAt: FieldValue.serverTimestamp() });

      const orderDoc = ordersRef.doc();
      tx.set(orderDoc, {
        items, total, address: address || '', note: note || '',
        paymentMethod: 'WALLET', status: 'paid', paidAt: FieldValue.serverTimestamp(),
        userId: uid, user: { email: req.auth.token.email || null },
        createdAt: FieldValue.serverTimestamp(),
      });
      orderId = orderDoc.id;
    });
  }catch(err){
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'Lỗi không xác định');
  }

  return { ok: true, orderId };
});

// --- New: bank webhook with idempotent TOPUP-<uid> and ORDER-<id> handling ---
const hookSecret = defineSecret('BANKHOOK_SECRET');

exports.bankWebhook = onRequest({ region: 'asia-southeast1', secrets: [hookSecret] }, async (req, res) => {
  // 1) Verify secret (provider must send header x-hook-sign: <secret> or Bearer <secret>)
  const secret = hookSecret.value();
  const headerSig = req.get('x-hook-sign') || (req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (!secret || !headerSig || headerSig !== secret) {
    return res.status(401).json({ ok:false, error:'Unauthorized' });
  }

  // 2) Normalize payload list
  const body = req.body || {};
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [body];

  const results = [];
  for (const tx of list) {
    // Provider-agnostic mapping - edit these if your provider uses other field names
    const amount = Number(tx.amount || tx.totalAmount || tx.value || 0);
    const desc   = String(tx.description || tx.content || tx.note || '');
    const when   = tx.when || tx.time || tx.createdAt || Date.now();
    const account= String(tx.account || tx.beneficiaryAccount || tx.toAccount || '');
    const txId   = String(tx.txId || tx.id || tx.reference || `${account}-${when}-${amount}`);

    if (!amount || amount <= 0) { results.push({ txId, ignored:true, reason:'no-amount' }); continue; }

    // --- TOPUP flow: look for TOPUP-<uid> in transfer description ---
    const mTop = /TOPUP-([A-Za-z0-9_-]{10,})/i.exec(desc);
    if (mTop) {
      const uidTop = mTop[1];
      const txRef = db.collection('bank_txs').doc(txId);
      try {
        await db.runTransaction(async (t) => {
          const done = await t.get(txRef);
          if (done.exists) throw new Error('duplicate'); // idempotent
          const userRef = db.collection('users').doc(uidTop);
          const u = await t.get(userRef);
          if (!u.exists) throw new Error('user-not-found');
          const cur = Number(u.data().balance || 0);
          t.set(txRef, { kind:'TOPUP', uid: uidTop, amount, desc, account, when, createdAt: FieldValue.serverTimestamp() });
          t.update(userRef, { balance: cur + amount, updatedAt: FieldValue.serverTimestamp() });
          const logRef = db.collection('wallet_logs').doc();
          t.set(logRef, { uid: uidTop, type:'TOPUP', amount, txId, desc, account, when, createdAt: FieldValue.serverTimestamp() });
        });
        results.push({ txId, ok:true, action:'TOPUP', uid: uidTop, amount });
      } catch (e) {
        results.push({ txId, ok:false, action:'TOPUP', error: e.message });
      }
      continue;
    }

    // --- ORDER flow: look for ORDER-<id> (mark paid if amount >= total) ---
    const mOrder = /ORDER-([A-Za-z0-9_-]+)/i.exec(desc);
    if (mOrder) {
      const orderId = mOrder[1];
      try {
        const orderRef = db.collection('orders').doc(orderId);
        await db.runTransaction(async (t) => {
          const snap = await t.get(orderRef);
          if (!snap.exists) throw new Error('order-not-found');
          const o = snap.data();
          if (o.status === 'paid') return; // idempotent
          if (o.paymentMethod !== 'BANK') throw new Error('not-bank-order');
          if (Number(o.total || 0) > amount) throw new Error(`amount-not-enough(${amount} < ${o.total})`);
          t.update(orderRef, { status: 'paid', paidAt: FieldValue.serverTimestamp(), bankTxId: txId });
        });
        results.push({ txId, ok:true, action:'ORDER', orderId });
      } catch (e) {
        results.push({ txId, ok:false, action:'ORDER', error: e.message });
      }
      continue;
    }

    results.push({ txId, ignored:true, reason:'no-matching-pattern' });
  }

  return res.json({ ok:true, results });
});
