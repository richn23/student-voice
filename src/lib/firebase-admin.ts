import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin (server-side only)
if (getApps().length === 0) {
  // For now, use project ID only (works with Firestore in test mode)
  // Later, add full service account credentials for production
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "",
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(
        /\\n/g,
        "\n"
      ),
    }),
  });
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
