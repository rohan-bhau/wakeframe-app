import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const requiredEnv = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }

  return value;
};

export const firebaseConfig = {
  apiKey: requiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: requiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requiredEnv(
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: requiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
} as const;

const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

export const auth = getAuth(firebaseApp);
