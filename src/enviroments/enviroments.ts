// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
//import { getAnalytics } from "firebase/analytics";
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "ger-htr-website.firebaseapp.com",
  projectId: "ger-htr-website",
  storageBucket: "ger-htr-website.firebasestorage.app",
  messagingSenderId: "806286661115",
  appId: "..."
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);
