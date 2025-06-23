/**
 * API Communication Module
 * Handles all API requests and authentication headers
 */

/* ==================== AUTHENTICATION HELPERS ==================== */

async function getAuthHeaders() {
    const token = await authManager.getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function makeAuthenticatedRequest(url, options = {}) {
    const authHeaders = await getAuthHeaders();
    
    const requestOptions = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...options.headers
        }
    };
    
    const response = await fetch(url, requestOptions);
    
    if (response.status === 401) {
        // Token expired or invalid, redirect to login
        authManager.showUnauthenticatedUI();
        throw new Error('Authentication required');
    }
    
    if (response.status === 503) {
        // Firebase not configured, handle gracefully
        const errorData = await response.json();
        throw new Error(errorData.error || 'Service unavailable - Firebase not configured');
    }
    
    return response;
}

/* ==================== DATA LOADING ==================== */

async function loadPortfolio() {
    if (!authManager.isAuthenticated()) {
        portfolio = [];
        renderPortfolio();
        updateStats();
        return;
    }

    try {
        const response = await makeAuthenticatedRequest('/api/portfolio');
        portfolio = await response.json();
        renderPortfolio();
        updateStats();
    } catch (error) {
        console.error('Error loading portfolio:', error);
        portfolio = [];
        renderPortfolio();
        updateStats();
    }
}

async function loadSets() {
    try {
        const response = await fetch('/api/sets');
        if (!response.ok) throw new Error(`API returned status ${response.status}`);
        
        availableSets = await response.json();
        populateSetsDropdown();
    } catch (error) {
        console.error('Error loading sets:', error);
        availableSets = getFallbackSets();
        populateSetsDropdown();
    }
}

async function loadApiStats() {
    try {
        const response = await fetch('/api/stats');
        apiStats = await response.json();
        updateApiStatsDisplay();
    } catch (error) {
        console.error('Error loading API stats:', error);
    }
}

function getFallbackSets() {
    return [
        { id: 'base1', name: 'Base Set' }, { id: 'jungle', name: 'Jungle' },
        { id: 'fossil', name: 'Fossil' }, { id: 'base2', name: 'Base Set 2' },
        { id: 'swsh1', name: 'Sword & Shield' }, { id: 'sv1', name: 'Scarlet & Violet' }
    ];
}

function updateApiStatsDisplay() {
    // Implementation for stats display would go here if needed
}

// Export functions for use in other modules
window.getAuthHeaders = getAuthHeaders;
window.makeAuthenticatedRequest = makeAuthenticatedRequest;
window.loadPortfolio = loadPortfolio;
window.loadSets = loadSets;
window.loadApiStats = loadApiStats;
window.getFallbackSets = getFallbackSets;
window.updateApiStatsDisplay = updateApiStatsDisplay; 