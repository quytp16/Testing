// functions/index.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// Auto-deduct wallet when placing order
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

// Bank webhook reconciliation for BANK payments
const hookSecret = defineSecret('BANKHOOK_SECRET');
exports.bankWebhook = onRequest({ region: 'asia-southeast1', secrets: [hookSecret] }, async (req, res) => {
  const sign = req.get('x-hook-sign') || (req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (!sign || sign !== hookSecret.value()) {
    return res.status(401).json({ ok:false, error:'Unauthorized' });
  }

  const raw = req.body || {};
  const list = Array.isArray(raw.data) ? raw.data : [raw];

  const results = [];
  for (const tx of list) {
    const amount = Number(tx.amount) || 0;
    const desc = String(tx.description||'');
    const m = /ORDER-([A-Za-z0-9_-]+)/.exec(desc);
    if (!m) { results.push({ ignored:true, reason:'no-order-id' }); continue; }
    const orderId = m[1];

    try {
      const orderRef = db.collection('orders').doc(orderId);
      const snap = await orderRef.get();
      if (!snap.exists) { results.push({ orderId, ignored:true, reason:'order-not-found' }); continue; }
      const o = snap.data();
      if (o.status === 'paid') { results.push({ orderId, ignored:true, reason:'already-paid' }); continue; }
      if (o.paymentMethod !== 'BANK') { results.push({ orderId, ignored:true, reason:'not-bank' }); continue; }
      if (o.status !== 'awaiting_bank') { results.push({ orderId, ignored:true, reason:'wrong-status' }); continue; }

      const need = Number(o.total)||0;
      if (amount < need) { results.push({ orderId, ignored:true, reason:`amount-not-enough(${amount}<${need})` }); continue; }

      await orderRef.update({ status:'paid', paidAt: FieldValue.serverTimestamp() });
      results.push({ orderId, ok:true, set:'paid' });
    } catch (e) {
      results.push({ orderId, ok:false, error: e.message||'unknown' });
    }
  }

  return res.json({ ok:true, results });
});
