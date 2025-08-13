
// functions/index.js (revised)
// - Robust validation & total recompute for wallet
// - Transactional balance deduction + order creation
// - Wallet logs (idempotent by orderId)
// - Keeps existing BANK webhook with minor polish

const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

/** Helper: compute total from items (price * qty) with validation */
function sumFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError('invalid-argument', 'EMPTY_CART');
  }
  const total = items.reduce((s, it) => {
    const price = Number(it?.price ?? 0);
    const qty = Number(it?.qty ?? 1);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
      throw new HttpsError('invalid-argument', 'INVALID_ITEM');
    }
    return s + price * qty;
  }, 0);
  if (total <= 0) throw new HttpsError('invalid-argument', 'INVALID_TOTAL');
  return Math.round(total);
}

/** placeOrderWithWallet: require auth, recompute total, tx: deduct balance + create order */
exports.placeOrderWithWallet = onCall({ region: 'asia-southeast1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn phải đăng nhập.');

  const { items, total, address, note } = req.data || {};
  if (!address || typeof address !== 'string') {
    throw new HttpsError('invalid-argument', 'Thiếu địa chỉ giao hàng.');
  }

  // Recompute server-side total from items
  const calcTotal = sumFromItems(items);
  if (Math.abs(Number(total || 0) - calcTotal) > 1) {
    throw new HttpsError('failed-precondition', 'TOTAL_MISMATCH');
  }

  const userRef = db.collection('users').doc(uid);
  const ordersRef = db.collection('orders');

  let orderId = null;
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef);
    if (!us.exists) {
      throw new HttpsError('failed-precondition', 'USER_NOT_FOUND');
    }
    const balance = Number(us.data().balance || 0);
    if (balance < calcTotal) {
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_FUNDS');
    }

    // Deduct balance
    tx.update(userRef, {
      balance: balance - calcTotal,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create order (paid via wallet)
    const orderDoc = ordersRef.doc();
    const order = {
      userId: uid,
      user: { email: req.auth.token?.email || null },
      items,
      total: calcTotal,
      paymentMethod: 'WALLET',
      status: 'paid_wallet',
      address: String(address),
      note: String(note || ''),
      channel: 'web',
      createdAt: FieldValue.serverTimestamp(),
      paidAt: FieldValue.serverTimestamp(),
    };
    tx.set(orderDoc, order);
    orderId = orderDoc.id;

    // Wallet log (idempotent by (uid, orderId))
    const logRef = db.collection('wallet_logs').doc(`WALLET-${uid}-${orderId}`);
    tx.set(logRef, {
      uid,
      type: 'DEBIT',
      reason: 'ORDER',
      orderId,
      amount: calcTotal,
      createdAt: FieldValue.serverTimestamp(),
    });
  }).catch((err) => {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'INTERNAL_ERROR');
  });

  return { ok: true, orderId };
});

// --- Bank webhook: idempotent TOPUP & ORDER update ---
const hookSecret = defineSecret('BANKHOOK_SECRET');

exports.bankWebhook = onRequest({ region: 'asia-southeast1', secrets: [hookSecret] }, async (req, res) => {
  try {
    // 1) Verify secret
    const secret = hookSecret.value();
    const headerSig = req.get('x-hook-sign') || (req.get('authorization')||'').replace(/^Bearer\\s+/i,'');
    if (!secret || !headerSig || headerSig !== secret) {
      return res.status(401).json({ ok:false, error:'Unauthorized' });
    }

    // 2) Normalize payloads
    const body = req.body || {};
    const list = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [body];

    const results = [];
    for (const tx of list) {
      const amount = Number(tx.amount || tx.totalAmount || tx.value || 0);
      const desc   = String(tx.description || tx.content || tx.note || '');
      const when   = tx.when || tx.time || tx.createdAt || Date.now();
      const account= String(tx.account || tx.beneficiaryAccount || tx.toAccount || '');
      const txId   = String(tx.txId || tx.id || tx.reference || `${account}-${when}-${amount}`);

      if (!amount || amount <= 0) { results.push({ txId, ignored:true, reason:'no-amount' }); continue; }

      // TOPUP-<uid>
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

      // ORDER-<id> (BANK)
      const mOrder = /ORDER-([A-Za-z0-9_-]+)/i.exec(desc);
      if (mOrder) {
        const orderId = mOrder[1];
        try {
          const orderRef = db.collection('orders').doc(orderId);
          await db.runTransaction(async (t) => {
            const snap = await t.get(orderRef);
            if (!snap.exists) throw new Error('order-not-found');
            const o = snap.data();
            if (o.status === 'paid' || o.status === 'paid_bank') return; // idempotent
            if (o.paymentMethod !== 'BANK') throw new Error('not-bank-order');
            if (Number(o.total || 0) > amount) throw new Error(`amount-not-enough(${amount} < ${o.total})`);
            t.update(orderRef, { status: 'paid_bank', paidAt: FieldValue.serverTimestamp(), bankTxId: txId });
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
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'INTERNAL_ERROR' });
  }
});
