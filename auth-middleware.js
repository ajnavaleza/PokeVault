/**
 * Authentication Middleware for PokeVault
 * Verifies Firebase ID tokens
 */

const { auth } = require('./firebase-admin');

/**
 * Middleware to verify Firebase ID token
 */
async function authenticateToken(req, res, next) {
    try {
        // Check if Firebase auth is available
        if (!auth) {
            return res.status(503).json({ 
                error: 'Firebase not configured. Please follow FIREBASE_SETUP.md' 
            });
        }

        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No valid authorization header' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        
        // Verify the ID token
        const decodedToken = await auth.verifyIdToken(idToken);
        
        // Add user info to request
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email
        };
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Invalid authentication token' });
    }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
async function optionalAuth(req, res, next) {
    try {
        // Check if Firebase auth is available
        if (!auth) {
            return next(); // Continue without authentication
        }

        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await auth.verifyIdToken(idToken);
            
            req.user = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                name: decodedToken.name || decodedToken.email
            };
        }
        
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
}

module.exports = { authenticateToken, optionalAuth }; 