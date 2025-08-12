// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

// Dùng đúng cấu hình bạn đã cung cấp (đã fix storageBucket .appspot.com)
const firebaseConfig = {
  apiKey: "AIzaSyB-A0omawXnKjVdq_4ea3UWjJhAEpx-tSg",
  authDomain: "tuananh-3b562.firebaseapp.com",
  projectId: "tuananh-3b562",
  storageBucket: "tuananh-3b562.appspot.com",
  messagingSenderId: "503117226992",
  appId: "1:503117226992:web:d4d90849149a39182b3335",
  measurementId: "G-P2DEDDNFH4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Region gần VN
export const functions = getFunctions(app, 'asia-southeast1');
