/**
 * Firebase Admin SDK Configuration for PokeVault Backend
 * Handles server-side Firebase operations
 */

const admin = require('firebase-admin');

let serviceAccount;

// Check for environment variables first (for production deployment)
console.log('Checking environment variables...');
console.log('PROJECT_ID:', process.env.PROJECT_ID ? 'SET' : 'NOT SET');
console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? 'SET' : 'NOT SET');
console.log('CLIENT_EMAIL:', process.env.CLIENT_EMAIL ? 'SET' : 'NOT SET');

if (process.env.PROJECT_ID && process.env.PRIVATE_KEY && process.env.CLIENT_EMAIL) {
    serviceAccount = {
        type: "service_account",
        projectId: process.env.PROJECT_ID,
        privateKeyId: process.env.PRIVATE_KEY_ID,
        privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.CLIENT_EMAIL,
        clientId: process.env.CLIENT_ID,
        authUri: "https://accounts.google.com/o/oauth2/auth",
        tokenUri: "https://oauth2.googleapis.com/token",
        authProviderX509CertUrl: "https://www.googleapis.com/oauth2/v1/certs",
        clientX509CertUrl: process.env.CLIENT_X509_CERT_URL
    };
    console.log('✅ Firebase credentials loaded from environment variables');
} else {
    // Fall back to JSON file (for local development)
    try {
        serviceAccount = require('./firebase-service-account.json');
        console.log('Firebase credentials loaded from file');
    } catch (error) {
        throw new Error('Firebase credentials not found. Set environment variables or create firebase-service-account.json');
    }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.PROJECT_ID || serviceAccount.project_id}-default-rtdb.firebaseio.com`
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth }; 