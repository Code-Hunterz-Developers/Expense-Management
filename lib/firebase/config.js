export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBrmNun6d4icWKLuYOCDhWUle-mpLBVmKc',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'expense-management-7664f.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'expense-management-7664f',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'expense-management-7664f.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '743116569995',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:743116569995:web:c3890ce4057930c35dc38e',
};
