
// assets/firebase-config.js
// Public web config; safe to keep on client.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB-A0omawXnKjVdq_4ea3UWjJhAEpx-tSg",
  authDomain: "tuananh-3b562.firebaseapp.com",
  projectId: "tuananh-3b562",
  storageBucket: "tuananh-3b562.firebasestorage.app",
  messagingSenderId: "503117226992",
  appId: "1:503117226992:web:d4d90849149a39182b3335",
  measurementId: "G-P2DEDDNFH4"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
