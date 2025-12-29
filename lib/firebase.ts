import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDgVumOW56U2NeWWJjHPr7gdya6KWSvnDI",
  authDomain: "yolo-videochat.firebaseapp.com",
  projectId: "yolo-videochat",
  storageBucket: "yolo-videochat.firebasestorage.app",
  messagingSenderId: "437252324088",
  appId: "1:437252324088:web:2681b9faee9ac95fc1990d",
  measurementId: "G-80GD9TKFDL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;