/**
 * Firebase Authentication Module for PokeVault
 * Handles user login, logout, and authentication state
 * Uses Firebase CDN - no module bundler required
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.authToken = null;
        this.onAuthStateChangeCallbacks = [];
        this.auth = null;
        
        // Initialize when Firebase is ready
        this.initWhenReady();
    }

    async initWhenReady() {
        // Wait for Firebase to be loaded and initialized
        if (typeof firebase === 'undefined') {
            setTimeout(() => this.initWhenReady(), 100);
            return;
        }
        
        // Initialize Firebase
        const firebaseApp = window.initializeFirebase();
        this.auth = firebaseApp.auth;
        
        // Initialize auth state listener
        this.initAuthStateListener();
    }

    initAuthStateListener() {
        if (!this.auth) return;
        
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                this.authToken = await user.getIdToken();
                this.showAuthenticatedUI();
                
                // Call registered callbacks
                this.onAuthStateChangeCallbacks.forEach(callback => {
                    callback(user, this.authToken);
                });
            } else {
                this.currentUser = null;
                this.authToken = null;
                this.showUnauthenticatedUI();
                
                // Call registered callbacks
                this.onAuthStateChangeCallbacks.forEach(callback => {
                    callback(null, null);
                });
            }
        });
    }

    // Register callback for auth state changes
    onAuthStateChange(callback) {
        this.onAuthStateChangeCallbacks.push(callback);
    }

    // Email/Password Authentication
    async signInWithEmail(email, password) {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async signUpWithEmail(email, password) {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Google Authentication
    async signInWithGoogle() {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await this.auth.signInWithPopup(provider);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            await this.auth.signOut();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get current auth token for API calls
    async getAuthToken() {
        if (this.currentUser) {
            return await this.currentUser.getIdToken();
        }
        return null;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Get current user info
    getCurrentUser() {
        return this.currentUser;
    }

    // UI Management
    showAuthenticatedUI() {
        // Hide auth forms
        const authContainer = document.getElementById('auth-container');
        const mainApp = document.getElementById('main-app');
        const userInfo = document.getElementById('user-info');
        
        if (authContainer) authContainer.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        // Show user info
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <div class="user-profile">
                    <span>Welcome, ${this.currentUser.displayName || this.currentUser.email}</span>
                    <button id="logout-btn" class="btn btn-outline">Logout</button>
                </div>
            `;
        }
    }

    showUnauthenticatedUI() {
        // Show auth forms
        const authContainer = document.getElementById('auth-container');
        const mainApp = document.getElementById('main-app');
        const userInfo = document.getElementById('user-info');
        
        if (authContainer) authContainer.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        if (userInfo) userInfo.innerHTML = '';
    }

    // Initialize auth UI event listeners
    initAuthUI() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                const result = await this.signInWithEmail(email, password);
                if (!result.success) {
                    this.showError(result.error);
                }
            });
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('register-email').value;
                const password = document.getElementById('register-password').value;
                
                const result = await this.signUpWithEmail(email, password);
                if (!result.success) {
                    this.showError(result.error);
                }
            });
        }

        // Google sign-in button
        const googleBtn = document.getElementById('google-signin-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                const result = await this.signInWithGoogle();
                if (!result.success) {
                    this.showError(result.error);
                }
            });
        }

        // Logout button (delegated event listener)
        document.addEventListener('click', async (e) => {
            if (e.target.id === 'logout-btn') {
                const result = await this.signOut();
                if (!result.success) {
                    this.showError(result.error);
                }
            }
        });
    }

    showError(message) {
        // Create or update error message element
        let errorDiv = document.getElementById('auth-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'auth-error';
            errorDiv.className = 'error-message';
            const authContainer = document.getElementById('auth-container');
            if (authContainer) {
                authContainer.insertBefore(errorDiv, authContainer.firstChild);
            }
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Hide error after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Create global auth manager instance
const authManager = new AuthManager();

// Export for global access
window.authManager = authManager; 