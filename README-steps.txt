HƯỚNG DẪN TRIỂN KHAI — Bộ file đầy đủ (không cần ZIP)

Các file bạn cần copy vào project (đặt ở thư mục gốc trừ khi ghi chú khác):
- index.html
- auth.js
- admin.js
- shop.js
- checkout.html
- checkout.js
- app-config.js
- firebase-config.js (đã sửa storageBucket .appspot.com)
- flash-sale.html
- functions/index.js (tạo thư mục functions/ trên máy bạn)
- functions/package.json

Bước triển khai tóm tắt:
1) Firebase Console
   - Auth → bật Email/Password.
   - Firestore → tạo DB (region asia-southeast1). Rules như đã trao đổi.
   - Tạo user admin → set role = admin, balance ban đầu.

2) Cloud Functions
   - npm i -g firebase-tools
   - firebase login
   - firebase init functions (JS, Node 20, region asia-southeast1)
   - Chép đè 2 file trong thư mục functions/ từ gói này.
   - Thiết lập secret webhook:
       firebase functions:secrets:set BANKHOOK_SECRET
   - Deploy:
       firebase deploy --only functions

3) Frontend
   - Chép đè toàn bộ các file html/js ở trên vào thư mục gốc web (GitHub Pages hoặc hosting).
   - Sửa app-config.js theo đúng thông tin ngân hàng (bankCode, accountNumber, accountName).

4) Kiểm thử
   - WALLET: user có số dư → đặt hàng → ví trừ ngay (status=paid).
   - BANK: tạo đơn → VietQR hiện addInfo=ORDER-<id> → chuyển khoản đúng ND → webhook bankWebhook → set paid.

Nếu cần mình gộp các file này thành nhiều link tải lẻ (mỗi file một link), bạn đã có ngay trong thư mục này.
