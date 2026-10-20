
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDpPMtTV4Q72Fb9MTxb3Helxip0xVfljY",
  authDomain: "vybe-a5352.firebaseapp.com",
  projectId: "vybe-a5352",
  storageBucket: "vybe-a5352.firebasestorage.app",
  messagingSenderId: "147929594590",
  appId: "1:147929594590:web:7e1b0d1094b1a56c6d204f",
  measurementId: "G-9R1142C28Q"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
