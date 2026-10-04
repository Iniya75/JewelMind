import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: "jewelmind-bc345.firebaseapp.com",
  projectId: "jewelmind-bc345",
  storageBucket: "jewelmind-bc345.firebasestorage.app",
  messagingSenderId: "1080208612935",
  appId: "1:1080208612935:web:9a7d31212fd21483d29b62",
  measurementId: "G-B9R57P3WRM",
};

// Avoid re-initializing on HMR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
