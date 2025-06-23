/**
 * PokeVault Frontend Application
 * Pokemon card portfolio tracker with Firebase authentication and price tracking
 * 
 * This is the main application file that orchestrates all modules
 */

/* ==================== GLOBAL STATE ==================== */

let portfolio = [];
let apiStats = {};
let availableSets = [];

/* ==================== APPLICATION INITIALIZATION ==================== */

document.addEventListener('DOMContentLoaded', function() {
    // Wait for authManager to be available
    if (typeof authManager === 'undefined') {
        setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
        }, 100);
        return;
    }
    
    // Initialize authentication UI first
    authManager.initAuthUI();
    
    // Listen for authentication state changes
    authManager.onAuthStateChange((user, token) => {
        if (user) {
            // User is authenticated, initialize the app
            initializeApp();
        } else {
            // User is not authenticated, clear any cached data
            portfolio = [];
            renderPortfolio();
        }
    });
});

async function initializeApp() {
    try {
        await Promise.all([
            loadPortfolio(),
            loadApiStats(), 
            loadSets()
        ]);
        setupEventListeners();
        
        // Auto-refresh stats every 30 seconds
        setInterval(loadApiStats, 30000);
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showStatus('addCardStatus', 'Error loading application', 'error');
    }
}

function setupEventListeners() {
    setupCardSearch();
    setupFormSubmission();
}

// Export global variables for use in other modules
window.portfolio = portfolio;
window.apiStats = apiStats;
window.availableSets = availableSets; 