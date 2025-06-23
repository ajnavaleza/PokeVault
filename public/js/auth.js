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
        
        // Initialize UI when DOM is ready
        this.initAuthUI();
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
            this.showToast('Successfully logged in!', 'success');
            return { success: true, user: userCredential.user };
        } catch (error) {
            this.showToast(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async signUpWithEmail(email, password) {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            this.showToast('Account created successfully!', 'success');
            return { success: true, user: userCredential.user };
        } catch (error) {
            this.showToast(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // Google Authentication
    async signInWithGoogle() {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await this.auth.signInWithPopup(provider);
            this.showToast('Successfully logged in with Google!', 'success');
            return { success: true, user: result.user };
        } catch (error) {
            this.showToast(error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            if (!this.auth) throw new Error('Firebase not initialized');
            await this.auth.signOut();
            this.showToast('Successfully logged out!', 'success');
            return { success: true };
        } catch (error) {
            this.showToast(error.message, 'error');
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
        // Check if we're on the index page (landing page)
        const isOnIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        
        if (isOnIndexPage) {
            // Redirect to portfolio page after successful login
            window.location.href = 'portfolio.html';
            return;
        }
        
        // For other pages (portfolio.html, deck-analysis.html), just show the nav header
        const navHeader = document.getElementById('nav-header');
        if (navHeader) navHeader.style.display = 'block';
        
        // Update navigation header user info
        this.updateUserInfo('user-nav-info');
    }

    showUnauthenticatedUI() {
        // Check if we're on the index page
        const isOnIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        
        if (isOnIndexPage) {
            // Show landing page, hide authenticated sections
            const landingPage = document.getElementById('landing-page');
            const authSection = document.getElementById('auth-section');
            const navHeader = document.getElementById('nav-header');
            
            if (landingPage) landingPage.style.display = 'block';
            if (authSection) authSection.style.display = 'none';
            if (navHeader) navHeader.style.display = 'none';
        } else {
            // On other pages, redirect to index page if not authenticated
            window.location.href = 'index.html';
        }
        
        // Clear user info
        this.clearUserInfo();
    }

    updateUserInfo(targetId) {
        const target = document.getElementById(targetId);
        if (target && this.currentUser) {
            target.innerHTML = `
                <div class="user-profile">
                    <span>Welcome, ${this.currentUser.displayName || this.currentUser.email}</span>
                    <button id="${targetId}-logout-btn" class="btn btn-outline btn-sm">Logout</button>
                </div>
            `;
        }
    }

    // Toast notification system
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-message">${message}</span>
                <button class="toast-close btn btn-ghost btn-sm" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;

        toastContainer.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // Initialize auth UI event listeners
    initAuthUI() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                const result = await this.signInWithEmail(email, password);
                if (result.success) {
                    // Clear form
                    loginForm.reset();
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
                if (result.success) {
                    // Clear form
                    registerForm.reset();
                }
            });
        }

        // Google sign-in button
        const googleBtn = document.getElementById('google-signin-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                await this.signInWithGoogle();
            });
        }

        // Logout buttons (delegated event listener)
        document.addEventListener('click', async (e) => {
            if (e.target.id === 'user-nav-info-logout-btn' || e.target.id === 'user-info-logout-btn') {
                await this.signOut();
            }
        });
    }

    // Check authentication on page load (for portfolio.html and deck-analysis.html)
    checkAuthOnPageLoad() {
        if (!this.isAuthenticated()) {
            // Redirect to landing page if not authenticated
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    // Set active navigation link
    setActiveNavLink(pageName) {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.id === `nav-${pageName}`) {
                link.classList.add('active');
            }
        });
    }

    clearUserInfo() {
        ["user-nav-info", "user-info"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    }
}

// Create global auth manager instance
const authManager = new AuthManager();

// Export for global access
window.authManager = authManager;

// Add toast styles to head if not already present
if (!document.querySelector('#toast-styles')) {
    const toastStyles = document.createElement('style');
    toastStyles.id = 'toast-styles';
    toastStyles.textContent = `
        .toast-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        
        .toast-message {
            flex: 1;
        }
        
        .toast-close {
            padding: 0.25rem;
            min-width: auto;
            height: auto;
        }
    `;
    document.head.appendChild(toastStyles);
} 