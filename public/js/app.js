/**
 * PokeVault Frontend Application
 * Pokemon card portfolio tracker with Firebase authentication and price tracking
 */

/* ==================== GLOBAL STATE ==================== */

let portfolio = [];
let apiStats = {};
let availableSets = [];
let searchTimeout = null;
let isSubmitting = false; // Prevent rapid-fire submissions

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

function setupFormSubmission() {
    const addCardForm = document.getElementById('addCardForm');
    if (addCardForm) {
        addCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addCard();
        });
    }
}

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

/* ==================== CARD SEARCH FUNCTIONALITY ==================== */

function setupCardSearch() {
    const searchInput = document.getElementById('cardSearch');
    const searchResults = document.getElementById('searchResults');
    
    if (!searchInput || !searchResults) return;
    
    // Search input with debouncing
    searchInput.addEventListener('input', handleSearchInput);
    
    // Hide search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.card-search-container')) {
            searchResults.style.display = 'none';
        }
    });
}

function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    if (query.length < 2) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }
    
    // Debounce search requests (300ms)
    searchTimeout = setTimeout(() => searchCards(query), 300);
}

async function searchCards(query) {
    try {
        const response = await fetch(`/api/cards/search?query=${encodeURIComponent(query)}`);
        const suggestions = await response.json();
        displaySearchResults(suggestions);
    } catch (error) {
        console.error('Error searching cards:', error);
    }
}

function displaySearchResults(suggestions) {
    const searchResults = document.getElementById('searchResults');
    
    if (suggestions.length === 0) {
        searchResults.style.display = 'none';
        return;
    }
    
    const resultsHTML = suggestions.map(card => createSearchResultHTML(card)).join('');
    searchResults.innerHTML = resultsHTML;
    searchResults.style.display = 'block';
}

function createSearchResultHTML(card) {
    const imageHTML = card.imageUrl 
        ? `<img src="${card.imageUrl}" alt="${card.name}" onerror="this.style.display='none'">`
        : '<div class="placeholder">🎴</div>';
    
    return `
        <div class="search-result-item" onclick="selectCard('${card.id}', '${card.name}', '${card.set}', '${card.number}', '${card.setName}')">
            <div class="search-result-image">${imageHTML}</div>
            <div class="search-result-info">
                <div class="search-result-name">${card.name}</div>
                <div class="search-result-details">${card.setName} #${card.number}</div>
            </div>
        </div>
    `;
}

function selectCard(cardId, name, setId, number, setName) {
    // Fill form fields
    document.getElementById('cardName').value = name;
    document.getElementById('cardNumber').value = number;
    
    // Store original TCGdx set ID for image fetching
    document.getElementById('cardName').setAttribute('data-original-set', setId);
    
    // Try to match and select the set in dropdown
    const setFound = trySelectSet(setId, setName);
    
    // Update search display
    document.getElementById('cardSearch').value = `${name} - ${setName} #${number}`;
    document.getElementById('searchResults').style.display = 'none';
    
    // Focus appropriate field
    if (setFound) {
        document.getElementById('quantity').focus();
    } else {
        document.getElementById('cardSet').focus();
    }
}

function trySelectSet(setId, setName) {
    const setSelect = document.getElementById('cardSet');
    
    // Method 1: Try exact match
    if (tryExactSetMatch(setSelect, setId)) return true;
    
    // Method 2: Try mapped set ID
    if (tryMappedSetMatch(setSelect, setId)) return true;
    
    // Method 3: Try name similarity
    if (tryNameSimilarityMatch(setSelect, setName)) return true;
    
    // No match found - clear selection
    setSelect.value = '';
    return false;
}

function tryExactSetMatch(setSelect, setId) {
    for (let option of setSelect.options) {
        if (option.value === setId) {
            setSelect.value = setId;
            return true;
        }
    }
    return false;
}

function tryMappedSetMatch(setSelect, setId) {
    const mappedSetId = mapTCGdxToApiSetId(setId);
    if (!mappedSetId) return false;
    
    for (let option of setSelect.options) {
        if (option.value === mappedSetId) {
            setSelect.value = mappedSetId;
            return true;
        }
    }
    return false;
}

function tryNameSimilarityMatch(setSelect, setName) {
    if (!setName) return false;
    
    for (let option of setSelect.options) {
        const optionName = option.textContent.toLowerCase();
        const searchName = setName.toLowerCase();
        
        if (optionName.includes(searchName) || searchName.includes(optionName)) {
            setSelect.value = option.value;
            return true;
        }
    }
    return false;
}

/* ==================== SET ID MAPPING ==================== */

function mapTCGdxToApiSetId(tcgdxSetId) {
    // Comprehensive mapping from TCGdx format to Pokemon Price Tracker API format
    const setMappings = {
        // Base Era
        'base1': 'base1', 'base2': 'base2', 'base4': 'base4',
        'jungle': 'base2', 'fossil': 'base3', 'tr': 'base5',
        'gym1': 'gym1', 'gym2': 'gym2', 'lc': 'base6',
        
        // Neo Era
        'neo1': 'neo1', 'neo2': 'neo2', 'neo3': 'neo3', 'neo4': 'neo4',
        
        // E-Card Era
        'ecard1': 'ecard1', 'ecard2': 'ecard2', 'ecard3': 'ecard3',
        
        // Ruby & Sapphire Era
        'ex1': 'ex1', 'ex2': 'ex2', 'ex3': 'ex3', 'ex4': 'ex4',
        'ex5': 'ex5', 'ex6': 'ex6', 'ex7': 'ex7', 'ex8': 'ex8',
        'ex9': 'ex9', 'ex10': 'ex10', 'ex11': 'ex11', 'ex12': 'ex12',
        'ex13': 'ex13', 'ex14': 'ex14', 'ex15': 'ex15', 'ex16': 'ex16',
        
        // Diamond & Pearl Era
        'dp1': 'dp1', 'dp2': 'dp2', 'dp3': 'dp3', 'dp4': 'dp4',
        'dp5': 'dp5', 'dp6': 'dp6', 'dp7': 'dp7',
        
        // Platinum Era
        'pl1': 'pl1', 'pl2': 'pl2', 'pl3': 'pl3', 'pl4': 'pl4',
        
        // HeartGold & SoulSilver Era
        'hgss1': 'hgss1', 'hgss2': 'hgss2', 'hgss3': 'hgss3', 'hgss4': 'hgss4',
        
        // Black & White Era
        'bw1': 'bw1', 'bw2': 'bw2', 'bw3': 'bw3', 'bw4': 'bw4', 'bw5': 'bw5',
        'bw6': 'bw6', 'bw7': 'bw7', 'bw8': 'bw8', 'bw9': 'bw9', 'bw10': 'bw10', 'bw11': 'bw11',
        
        // XY Era
        'xy1': 'xy1', 'xy2': 'xy2', 'xy3': 'xy3', 'xy4': 'xy4', 'xy5': 'xy5',
        'xy6': 'xy6', 'xy7': 'xy7', 'xy8': 'xy8', 'xy9': 'xy9', 'xy10': 'xy10',
        'xy11': 'xy11', 'xy12': 'xy12',
        
        // Sun & Moon Era
        'sm1': 'sm1', 'sm2': 'sm2', 'sm3': 'sm3', 'sm35': 'sm35', 'sm3.5': 'sm35',
        'sm4': 'sm4', 'sm5': 'sm5', 'sm6': 'sm6', 'sm7': 'sm7', 'sm75': 'sm75', 'sm7.5': 'sm75',
        'sm8': 'sm8', 'sm9': 'sm9', 'det1': 'det1', 'sm10': 'sm10', 'sm11': 'sm11',
        'sm115': 'sm115', 'sm11.5': 'sm115', 'sm12': 'sm12',
        
        // Sword & Shield Era
        'swsh1': 'swsh1', 'swsh2': 'swsh2', 'swsh3': 'swsh3', 'swsh35': 'swsh35', 'swsh3.5': 'swsh35',
        'swsh4': 'swsh4', 'swsh45': 'swsh45', 'swsh4.5': 'swsh45', 'swsh5': 'swsh5',
        'swsh6': 'swsh6', 'swsh7': 'swsh7', 'swsh8': 'swsh8', 'swsh9': 'swsh9',
        'swsh10': 'swsh10', 'swsh10.5': 'swsh10', 'swsh11': 'swsh11', 'swsh12': 'swsh12',
        'swsh12pt5': 'swsh12pt5', 'swsh12.5': 'swsh12pt5',
        
        // Scarlet & Violet Era (with comprehensive decimal format support)
        'sv1': 'sv1', 'sv01': 'sv1', 'sv2': 'sv2', 'sv02': 'sv2',
        'sv3': 'sv3', 'sv03': 'sv3', 'sv3pt5': 'sv3pt5', 'sv3.5': 'sv3pt5', 'sv03.5': 'sv3pt5',
        'sv4': 'sv4', 'sv04': 'sv4', 'sv4pt5': 'sv4pt5', 'sv4.5': 'sv4pt5', 'sv04.5': 'sv4pt5',
        'sv5': 'sv5', 'sv05': 'sv5', 'sv6': 'sv6', 'sv06': 'sv6',
        'sv6pt5': 'sv6pt5', 'sv6.5': 'sv6pt5', 'sv06.5': 'sv6pt5', // Key mapping for Shrouded Fable
        'sv7': 'sv7', 'sv07': 'sv7', 'sv8': 'sv8', 'sv08': 'sv8',
        'sv8pt5': 'sv8pt5', 'sv8.5': 'sv8pt5', 'sv08.5': 'sv8pt5',
        'sv9': 'sv9', 'sv09': 'sv9'
    };
    
    return setMappings[tcgdxSetId] || null;
}

/* ==================== CARD MANAGEMENT ==================== */

async function addCard() {
    if (!authManager.isAuthenticated()) {
        showStatus('addCardStatus', 'Please log in to add cards', 'error');
        return;
    }

    // Prevent rapid-fire submissions
    if (isSubmitting) {
        showStatus('addCardStatus', 'Please wait, processing previous request...', 'error');
        return;
    }

    const cardData = getFormData();
    if (!validateFormData(cardData)) {
        isSubmitting = false;
        return;
    }

    // Set submission flag
    isSubmitting = true;

    // Disable form immediately to prevent multiple submissions
    const addButton = document.querySelector('#addCardForm button[type="submit"]');
    const formElements = document.querySelectorAll('#addCardForm input, #addCardForm select, #addCardForm button');
    
    formElements.forEach(el => el.disabled = true);
    addButton.textContent = 'Checking...';

    try {
        // Refresh portfolio first to ensure we have the latest data
        await loadPortfolio();

        // Improved duplicate checking - check multiple variations
        const existingCard = portfolio.find(card => {
            const nameMatch = card.name.toLowerCase().trim() === cardData.name.toLowerCase().trim();
            const setMatch = card.set === cardData.set;
            
            // Check both parsed number and display number
            const numberMatch = (
                card.number === cardData.number ||
                card.displayNumber === cardData.displayNumber ||
                card.number === cardData.displayNumber ||
                card.displayNumber === cardData.number
            );
            
            return nameMatch && setMatch && numberMatch;
        });

        if (existingCard) {
            // Re-enable form for the dialog
            formElements.forEach(el => el.disabled = false);
            addButton.textContent = 'Add Card';

            const shouldIncreaseQuantity = confirm(
                `${cardData.name} is already in your portfolio (Quantity: ${existingCard.quantity}). \n\n` +
                `Would you like to increase its quantity by ${cardData.quantity} instead of adding a duplicate?`
            );
            
            if (shouldIncreaseQuantity) {
                // Disable form again for the update
                formElements.forEach(el => el.disabled = true);
                addButton.textContent = 'Updating...';

                try {
                    const newQuantity = existingCard.quantity + cardData.quantity;
                    
                    const response = await makeAuthenticatedRequest('/api/portfolio/update-quantity', {
                        method: 'PUT',
                        body: JSON.stringify({
                            cardId: existingCard.id,
                            quantity: newQuantity
                        })
                    });

                    if (response.ok) {
                        // Update local portfolio
                        existingCard.quantity = newQuantity;
                        renderPortfolio();
                        updateStats();
                        clearForm();
                        showStatus('addCardStatus', `Updated ${cardData.name} quantity to ${newQuantity}!`, 'success');
                    } else {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to update quantity');
                    }
                } catch (error) {
                    console.error('Error updating quantity:', error);
                    showStatus('addCardStatus', `Error updating quantity: ${error.message}`, 'error');
                } finally {
                    formElements.forEach(el => el.disabled = false);
                    addButton.textContent = 'Add Card';
                    isSubmitting = false;
                }
                return;
            } else {
                showStatus('addCardStatus', 'Card not added - already exists in portfolio', 'error');
                isSubmitting = false;
                return;
            }
        }

        // No duplicate found, proceed with adding
        addButton.textContent = 'Adding...';
        const originalSetId = document.getElementById('cardName').getAttribute('data-original-set');
        
        showStatus('addCardStatus', 'Adding card and fetching price...', 'loading');

        const response = await makeAuthenticatedRequest('/api/portfolio/add', {
            method: 'POST',
            body: JSON.stringify({
                ...cardData,
                originalSetId: originalSetId || cardData.set
            })
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409) {
                // Backend detected duplicate
                showStatus('addCardStatus', 'This card is already in your portfolio', 'error');
                // Refresh portfolio to sync
                await loadPortfolio();
                isSubmitting = false;
                return;
            }
            throw new Error(data.error);
        }

        // Add to local portfolio and update UI
        portfolio.push(data.card);
        renderPortfolio();
        updateStats();
        clearForm();
        
        // Refresh portfolio to ensure sync with backend
        await loadPortfolio();
        
        showStatus('addCardStatus', `${cardData.name} added successfully!`, 'success');
        loadApiStats();

    } catch (error) {
        console.error('Error adding card:', error);
        
        // Handle Firebase not configured case
        if (error.message.includes('Firebase not configured')) {
            showStatus('addCardStatus', 
                'Firebase authentication is not configured. Please follow FIREBASE_SETUP.md to enable user accounts and portfolio management.', 
                'error'
            );
        } else {
            showStatus('addCardStatus', `Error adding card: ${error.message}`, 'error');
        }
    } finally {
        // Re-enable form and reset submission flag
        formElements.forEach(el => el.disabled = false);
        addButton.textContent = 'Add Card';
        isSubmitting = false;
    }
}

function getFormData() {
    return {
        name: document.getElementById('cardName').value.trim(),
        set: document.getElementById('cardSet').value,
        number: parseCardNumber(document.getElementById('cardNumber').value.trim()),
        quantity: parseInt(document.getElementById('quantity').value) || 1,
        displayNumber: document.getElementById('cardNumber').value.trim()
    };
}

function validateFormData(data) {
    if (!data.name || !data.set || !data.displayNumber) {
        showStatus('addCardStatus', 'Please fill in all card details', 'error');
        return false;
    }

    const validation = validateCardNumber(data.displayNumber);
    if (!validation.valid) {
        showStatus('addCardStatus', validation.message, 'error');
        return false;
    }

    return true;
}

async function removeCard(cardId) {
    if (!authManager.isAuthenticated()) {
        showStatus('addCardStatus', 'Please log in to remove cards', 'error');
        return;
    }

    // Find the card to show preview
    const card = portfolio.find(c => c.id === cardId || c.id == cardId || c.id === parseInt(cardId));
    if (!card) {
        showStatus('addCardStatus', 'Card not found', 'error');
        return;
    }

    // Show custom confirmation modal
    showConfirmModal(
        'Remove Card',
        'Are you sure you want to remove this card from your portfolio? This action cannot be undone.',
        card,
        async () => {
            // Confirmed - proceed with deletion
            try {
                const response = await makeAuthenticatedRequest(`/api/portfolio/card/${cardId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error);
                }

                portfolio = portfolio.filter(c => c.id !== cardId);
                renderPortfolio();
                updateStats();
                showStatus('addCardStatus', `${card.name} removed successfully!`, 'success');

            } catch (error) {
                console.error('Error removing card:', error);
                
                // Handle Firebase not configured case
                if (error.message.includes('Firebase not configured')) {
                    showStatus('addCardStatus', 
                        'Firebase authentication is not configured. Portfolio management requires Firebase setup.', 
                        'error'
                    );
                } else {
                    showStatus('addCardStatus', `Error removing card: ${error.message}`, 'error');
                }
            }
        }
    );
}

async function updateAllPrices() {
    if (!authManager.isAuthenticated()) {
        showStatus('addCardStatus', 'Please log in to update prices', 'error');
        return;
    }

    const updateBtn = document.getElementById('updateBtn');
    const originalText = updateBtn.innerHTML;
    
    updateBtn.innerHTML = '⏳ Updating...';
    updateBtn.disabled = true;
    
    document.querySelectorAll('.card-item').forEach(item => item.classList.add('updating'));

    try {
        const response = await makeAuthenticatedRequest('/api/portfolio/update-prices', {
            method: 'PUT'
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        portfolio = data.portfolio;
        renderPortfolio();
        updateStats();
        showStatus('addCardStatus', data.message || 'Prices updated successfully!', 'success');
        loadApiStats();

    } catch (error) {
        console.error('Error updating prices:', error);
        
        // Handle Firebase not configured case
        if (error.message.includes('Firebase not configured')) {
            showStatus('addCardStatus', 
                'Firebase authentication is not configured. Portfolio management requires Firebase setup.', 
                'error'
            );
        } else {
            showStatus('addCardStatus', `Error updating prices: ${error.message}`, 'error');
        }
    } finally {
        updateBtn.innerHTML = originalText;
        updateBtn.disabled = false;
        document.querySelectorAll('.card-item').forEach(item => item.classList.remove('updating'));
    }
}

/* ==================== CARD NUMBER PROCESSING ==================== */

function parseCardNumber(input) {
    if (!input) return null;
    
    if (input.includes('/')) {
        return input.split('/')[0].trim(); // "25/102" -> "25"
    }
    if (input.includes('-') && /^\w+-\d+$/.test(input)) {
        return input.split('-')[1].trim(); // "Promo-001" -> "001"
    }
    return input; // Return as-is for other formats
}

function validateCardNumber(input) {
    if (!input) {
        return { valid: false, message: 'Card number is required' };
    }
    
    const validPatterns = [
        /^\d+\/\d+$/, /^[A-Z]+\d+\/[A-Z]*\d+$/, /^\d+$/, /^[A-Z]+\d+$/,
        /^[A-Za-z]+-\d+$/, /^[A-Za-z]+\d+[A-Za-z]*$/, /^[A-Z]{1,4}\d+$/,
        /^[A-Z]{2,6}\d+$/, /^[A-Z]+\d+[A-Za-z]+$/, /^\d+[A-Z]+$/,
        /^[A-Z]+\d+\/[A-Z]+\d+$/, /^[A-Za-z0-9]+-[A-Za-z0-9]+$/, /^[A-Z]{1,3}\d{1,3}$/
    ];
    
    const isValid = validPatterns.some(pattern => pattern.test(input));
    
    if (!isValid) {
        return { 
            valid: false, 
            message: 'Invalid format. Examples: 25/102, TG20, SV001/SV198, V001, VMAX045' 
        };
    }
    
    return { valid: true, parsed: parseCardNumber(input) };
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

function populateSetsDropdown() {
    const setSelect = document.getElementById('cardSet');
    if (!setSelect) return;
    
    setSelect.innerHTML = '<option value="">Select Set</option>';
    
    const sortedSets = availableSets.sort((a, b) => a.name.localeCompare(b.name));
    sortedSets.forEach(set => {
        const option = document.createElement('option');
        option.value = set.id;
        option.textContent = set.name;
        setSelect.appendChild(option);
    });
}

function getFallbackSets() {
    return [
        { id: 'base1', name: 'Base Set' }, { id: 'jungle', name: 'Jungle' },
        { id: 'fossil', name: 'Fossil' }, { id: 'base2', name: 'Base Set 2' },
        { id: 'swsh1', name: 'Sword & Shield' }, { id: 'sv1', name: 'Scarlet & Violet' }
    ];
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

function updateApiStatsDisplay() {
    // Implementation for stats display would go here if needed
}

/* ==================== UI RENDERING ==================== */

function handleContainerClick(event) {
    // Handle price clicks
    const priceElement = event.target.closest('.clickable-price');
    if (priceElement) {
        const cardId = priceElement.dataset.cardId;
        const cardName = priceElement.dataset.cardName;
        const cardImage = priceElement.dataset.cardImage;
        const cardDetails = priceElement.dataset.cardDetails;
        const currentPrice = parseFloat(priceElement.dataset.currentPrice);
        
        showPriceHistory(cardId, cardName, cardImage, cardDetails, currentPrice);
        return;
    }

    // Handle card image clicks
    const cardImage = event.target.closest('.card-image');
    if (cardImage) {
        // Find the .card-item parent and its index in the cardsContainer
        const cardItem = cardImage.closest('.card-item');
        const cardsContainer = document.getElementById('cardsContainer');
        const cardItems = Array.from(cardsContainer.getElementsByClassName('card-item'));
        const cardIndex = cardItems.indexOf(cardItem);
        if (cardIndex !== -1) {
            openImageModal(cardIndex);
        }
        return;
    }
}

function renderPortfolio() {
    const container = document.getElementById('cardsContainer');
    
    if (portfolio.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No cards in your portfolio yet</h3>
                <p>Add your first Pokemon card above to start tracking your collection!</p>
            </div>
        `;
        updateStats();
        return;
    }

    container.innerHTML = portfolio.map(createCardHTML).join('');
    
    // Add event delegation for card image clicks and price clicks
    container.removeEventListener('click', handleContainerClick); // Remove any existing listener
    container.addEventListener('click', handleContainerClick);
    
    updateStats();
}

function createCardHTML(card) {
    const imageHTML = card.imageUrl 
        ? `<div class="card-image" style="cursor: pointer;">
            <img src="${card.imageUrl}" alt="${card.name}" onerror="this.parentElement.style.display='none'">
        </div>`
        : `<div class="card-image-placeholder">
             <div class="placeholder-content"><span>🎴</span><small>No image</small></div>
           </div>`;
    
    const priceAgeIndicator = getPriceAgeIndicator(card.lastUpdated);
    
    return `
        <div class="card-item">
            <button class="remove-btn" onclick="removeCard('${card.id}')" title="Remove card">×</button>
            ${imageHTML}
            <div class="card-content">
                <div class="card-name">${card.name}</div>
                <div class="card-details">
                    <div class="card-detail"><strong>Set:</strong> ${getSetDisplayName(card.set)}</div>
                    <div class="card-detail"><strong>Card #:</strong> ${card.displayNumber || card.number}</div>
                    <div class="card-detail"><strong>Quantity:</strong> ${card.quantity}</div>
                    <div class="card-detail"><strong>Added:</strong> ${formatDate(card.dateAdded)}</div>
                </div>
                <div class="price-info">
                    <div>
                        <div class="current-price clickable-price" data-card-id="${card.id}" data-card-name="${card.name}" data-card-image="${card.imageUrl || ''}" data-card-details="${getSetDisplayName(card.set)} #${card.displayNumber || card.number}" data-current-price="${card.currentPrice}" title="Click to see price history">${card.currentPrice !== null ? '$' + card.currentPrice.toFixed(2) : 'Price not available'}</div>
                        <div class="price-updated">
                            Updated: ${formatDate(card.lastUpdated)}
                            ${priceAgeIndicator}
                        </div>
                    </div>
                    <div class="total-value">Total: ${card.currentPrice !== null ? '$' + (card.currentPrice * card.quantity).toFixed(2) : 'N/A'}</div>
                </div>
            </div>
        </div>
    `;
}

function getPriceAgeIndicator(lastUpdated) {
    const hoursOld = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60));
    
    if (hoursOld > 24) return `<span class="price-age old">📊 ${Math.floor(hoursOld/24)}d old</span>`;
    if (hoursOld > 1) return `<span class="price-age medium">📊 ${hoursOld}h old</span>`;
    return `<span class="price-age fresh">📊 Fresh</span>`;
}

function updateStats() {
    const totalCards = portfolio.reduce((sum, card) => sum + card.quantity, 0);
    const totalValue = portfolio.reduce((sum, card) => {
        if (card.currentPrice !== null) {
            return sum + (card.currentPrice * card.quantity);
        }
        return sum;
    }, 0);

    document.getElementById('totalCards').textContent = totalCards;
    document.getElementById('uniqueCards').textContent = portfolio.length;
    document.getElementById('totalValue').textContent = `$${totalValue.toFixed(2)}`;
}

/* ==================== UTILITY FUNCTIONS ==================== */

function getSetDisplayName(setId) {
    const foundSet = availableSets.find(set => set.id === setId);
    return foundSet ? foundSet.name : setId;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function clearForm() {
    document.getElementById('cardName').value = '';
    document.getElementById('cardSet').value = '';
    document.getElementById('cardNumber').value = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('cardSearch').value = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('cardName').removeAttribute('data-original-set');
}

function clearSearch() {
    document.getElementById('cardSearch').value = '';
    document.getElementById('searchResults').style.display = 'none';
    clearForm();
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.innerHTML = `<div class="${type}">${message}</div>`;
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => element.innerHTML = '', 7000);
    }
}

/* ==================== IMAGE MODAL FUNCTIONS ==================== */

let currentModalIndex = 0;

function openImageModal(cardIndex) {
    if (cardIndex < 0 || cardIndex >= portfolio.length) return;
    
    currentModalIndex = cardIndex;
    updateModalContent();
    
    const modal = document.getElementById('imageModal');
    modal.classList.add('show');
    
    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
    
    // Close modal when clicking outside the image
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeImageModal();
        }
    };
    
    // Add keyboard navigation
    document.addEventListener('keydown', handleModalKeydown);
}

function updateModalContent() {
    const card = portfolio[currentModalIndex];
    if (!card) return;
    
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalDetails = document.getElementById('modalDetails');
    const modalCounter = document.getElementById('modalCounter');
    const prevBtn = document.querySelector('.modal-nav-prev');
    const nextBtn = document.querySelector('.modal-nav-next');
    
    // Set image and info
    modalImage.src = card.imageUrl || '';
    modalImage.alt = card.name;
    modalTitle.textContent = card.name;
    modalDetails.textContent = `${getSetDisplayName(card.set)} #${card.displayNumber || card.number}`;
    modalCounter.textContent = `${currentModalIndex + 1} of ${portfolio.length}`;
    
    // Update navigation button states
    prevBtn.disabled = currentModalIndex === 0;
    nextBtn.disabled = currentModalIndex === portfolio.length - 1;
    
    // Show/hide navigation arrows based on portfolio size
    if (portfolio.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
    }
}

function navigateModal(direction) {
    const newIndex = currentModalIndex + direction;
    
    if (newIndex >= 0 && newIndex < portfolio.length) {
        currentModalIndex = newIndex;
        updateModalContent();
    }
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('show');
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
    // Remove event listeners
    modal.onclick = null;
    document.removeEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(e) {
    switch(e.key) {
        case 'Escape':
            closeImageModal();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            navigateModal(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            navigateModal(1);
            break;
    }
}

/* ==================== CONFIRMATION MODAL FUNCTIONS ==================== */

function showConfirmModal(title, message, card, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const previewEl = document.getElementById('confirmCardPreview');
    const cancelBtn = document.getElementById('confirmCancel');
    const deleteBtn = document.getElementById('confirmDelete');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Create card preview
    const imageHTML = card.imageUrl 
        ? `<img src="${card.imageUrl}" alt="${card.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="placeholder" style="display: none;">🎴</div>`
        : `<div class="placeholder">🎴</div>`;
    
    const priceText = card.currentPrice !== null 
        ? `$${card.currentPrice.toFixed(2)}`
        : 'Price not available';
    
    const totalValue = card.currentPrice !== null 
        ? ` × ${card.quantity} = $${(card.currentPrice * card.quantity).toFixed(2)}`
        : '';
    
    previewEl.innerHTML = `
        ${imageHTML}
        <div class="confirm-card-info">
            <div class="confirm-card-name">${card.name}</div>
            <div class="confirm-card-details">${getSetDisplayName(card.set)} #${card.displayNumber || card.number}</div>
            <div class="confirm-card-value">${priceText}${totalValue}</div>
        </div>
    `;
    
    // Set up event listeners
    cancelBtn.onclick = closeConfirmModal;
    deleteBtn.onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
    
    // Close on overlay click
    const overlay = modal.querySelector('.confirm-modal-overlay');
    overlay.onclick = closeConfirmModal;
    
    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Focus on cancel button for better accessibility
    setTimeout(() => cancelBtn.focus(), 100);
    
    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeConfirmModal();
        }
    };
    
    document.addEventListener('keydown', handleEscape);
    modal._escapeHandler = handleEscape; // Store for cleanup
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    // Clean up event listeners
    if (modal._escapeHandler) {
        document.removeEventListener('keydown', modal._escapeHandler);
        delete modal._escapeHandler;
    }
    
    // Clear button handlers
    document.getElementById('confirmCancel').onclick = null;
    document.getElementById('confirmDelete').onclick = null;
    const overlay = modal.querySelector('.confirm-modal-overlay');
    overlay.onclick = null;
}

/* ==================== PRICE HISTORY MODAL FUNCTIONS ==================== */

let priceHistoryChart = null;

async function showPriceHistory(cardId, cardName, cardImageUrl, cardDetails, currentPrice) {
    if (!authManager.isAuthenticated()) {
        showStatus('addCardStatus', 'Please log in to view price history', 'error');
        return;
    }

    const modal = document.getElementById('priceHistoryModal');
    const cardImage = document.getElementById('priceHistoryCardImage');
    const cardNameEl = document.getElementById('priceHistoryCardName');
    const cardDetailsEl = document.getElementById('priceHistoryCardDetails');
    const loadingEl = document.getElementById('priceHistoryLoading');
    const errorEl = document.getElementById('priceHistoryError');
    const chartContainer = document.querySelector('.price-chart-container');

    // Set card info
    cardImage.src = cardImageUrl || '';
    cardImage.style.display = cardImageUrl ? 'block' : 'none';
    cardNameEl.textContent = cardName;
    cardDetailsEl.textContent = cardDetails;

    // Show modal and loading state
    modal.classList.add('show');
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    chartContainer.style.display = 'none';
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';

    // Close modal when clicking outside
    const overlay = modal.querySelector('.price-history-modal-overlay');
    overlay.onclick = closePriceHistoryModal;

    try {
        console.log('Fetching price history for card:', cardId);
        const response = await makeAuthenticatedRequest(`/api/portfolio/card/${cardId}/history`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const history = await response.json();
        console.log('Received price history:', history);

        loadingEl.style.display = 'none';

        if (!history || history.length === 0) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = '<p>No price history available from external API. This could be due to API rate limits or the card not being found in the external database.</p>';
            return;
        }

        // Show chart container
        chartContainer.style.display = 'flex';

        // Add explanation text for the chart
        const existingExplanation = document.querySelector('.chart-explanation');
        if (existingExplanation) {
            existingExplanation.remove();
        }
        
        const explanation = document.createElement('div');
        explanation.className = 'chart-explanation';
        explanation.innerHTML = `
            <p><strong>Comprehensive Market Analysis:</strong> This chart displays all available pricing data from multiple sources including 
            historical averages (CardMarket 1, 7, 30-day), current market trends, graded card values (PSA/BGS), and marketplace data (TCGPlayer, eBay). 
            Each data point represents real market conditions across different platforms and time periods.</p>
        `;
        chartContainer.parentNode.insertBefore(explanation, chartContainer);

        // Calculate stats
        const prices = history.map(h => h.price).filter(p => p !== null);
        const highPrice = Math.max(...prices);
        const lowPrice = Math.min(...prices);
        const firstPrice = history[0]?.price;
        const priceChange = currentPrice && firstPrice ? currentPrice - firstPrice : 0;
        const priceChangePercent = firstPrice ? ((priceChange / firstPrice) * 100) : 0;

        // Update stats
        document.getElementById('currentPriceValue').textContent = currentPrice ? `$${currentPrice.toFixed(2)}` : 'N/A';
        document.getElementById('highPriceValue').textContent = highPrice ? `$${highPrice.toFixed(2)}` : 'N/A';
        document.getElementById('lowPriceValue').textContent = lowPrice ? `$${lowPrice.toFixed(2)}` : 'N/A';
        
        const priceChangeEl = document.getElementById('priceChangeValue');
        const changeText = priceChange >= 0 ? `+$${priceChange.toFixed(2)}` : `-$${Math.abs(priceChange).toFixed(2)}`;
        const percentText = priceChangePercent >= 0 ? `+${priceChangePercent.toFixed(1)}%` : `${priceChangePercent.toFixed(1)}%`;
        priceChangeEl.textContent = `${changeText} (${percentText})`;
        priceChangeEl.className = `price-stat-value ${priceChange >= 0 ? 'positive' : 'negative'}`;

        // Create chart with a small delay to ensure proper cleanup
        setTimeout(() => {
            createPriceChart(history);
        }, 50);

    } catch (error) {
        console.error('Error loading price history:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.innerHTML = '<p>Failed to load price history. Please try again later.</p>';
    }
}

function createPriceChart(history) {
    const canvas = document.getElementById('priceHistoryChart');
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (priceHistoryChart) {
        priceHistoryChart.destroy();
        priceHistoryChart = null;
    }
    
    // Also destroy any chart that might be attached to the canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Clear the canvas to ensure clean state
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Prepare data
    const validData = history.filter(h => h.price !== null && h.price !== undefined);
    
    if (validData.length === 0) {
        return;
    }

    // Group data by category for better visualization
    const categoryGroups = {};
    validData.forEach(item => {
        const category = item.category || 'other';
        if (!categoryGroups[category]) {
            categoryGroups[category] = [];
        }
        categoryGroups[category].push(item);
    });

    // Define category styles with improved colors and labels
    const categoryStyles = {
        'historical': { 
            label: 'Historical (30-day avg)', 
            borderColor: '#6c757d', 
            backgroundColor: 'rgba(108, 117, 125, 0.2)',
            pointStyle: 'circle'
        },
        'recent': { 
            label: 'Recent Trends (7-day avg)', 
            borderColor: '#0d6efd', 
            backgroundColor: 'rgba(13, 110, 253, 0.2)',
            pointStyle: 'circle'
        },
        'current': { 
            label: 'Current Market (1-day avg)', 
            borderColor: '#198754', 
            backgroundColor: 'rgba(25, 135, 84, 0.2)',
            pointStyle: 'circle'
        },
        'trend': { 
            label: 'Market Trends', 
            borderColor: '#fd7e14', 
            backgroundColor: 'rgba(253, 126, 20, 0.2)',
            pointStyle: 'triangle'
        },
        'reverse-holo': { 
            label: 'Reverse Holo Variants', 
            borderColor: '#6f42c1', 
            backgroundColor: 'rgba(111, 66, 193, 0.2)',
            pointStyle: 'rectRot'
        },
        'graded': { 
            label: 'Graded Cards (PSA/BGS)', 
            borderColor: '#dc3545', 
            backgroundColor: 'rgba(220, 53, 69, 0.2)',
            pointStyle: 'star'
        },
        'tcgplayer': { 
            label: 'TCGPlayer Market Data', 
            borderColor: '#20c997', 
            backgroundColor: 'rgba(32, 201, 151, 0.2)',
            pointStyle: 'rect'
        }
    };

    // Create datasets
    const datasets = [];
    
    // Create labels from dates for simpler chart without time adapter
    const labels = validData.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // If we have custom colors for individual points, create a comprehensive line chart
    const hasCustomColors = validData.some(item => item.color);
    
    if (hasCustomColors && validData.length > 1) {
        // Create line chart with individual colored points
        datasets.push({
            label: 'Market Price Analysis',
            data: validData.map(item => item.price),
            backgroundColor: validData.map(item => item.color || '#007bff'),
            borderColor: '#007bff',
            borderWidth: 3,
            pointRadius: 10,
            pointHoverRadius: 14,
            pointBorderWidth: 2,
            pointBorderColor: '#ffffff',
            fill: false,
            tension: 0.4
        });
    } else {
        // Create category-based datasets for cleaner visualization
        Object.entries(categoryGroups).forEach(([category, items]) => {
            const style = categoryStyles[category] || { 
                label: category.charAt(0).toUpperCase() + category.slice(1), 
                borderColor: '#007bff', 
                backgroundColor: 'rgba(0, 123, 255, 0.2)',
                pointStyle: 'circle'
            };
            
            // Find indices of these items in the validData array for proper positioning
            const categoryData = validData.map(item => 
                items.some(categoryItem => categoryItem.date === item.date && categoryItem.price === item.price) 
                    ? item.price 
                    : null
            );
            
            datasets.push({
                label: style.label,
                data: categoryData,
                borderColor: style.borderColor,
                backgroundColor: style.backgroundColor,
                borderWidth: 3,
                pointRadius: 8,
                pointHoverRadius: 12,
                pointStyle: style.pointStyle,
                fill: false,
                tension: 0.3,
                spanGaps: true
            });
        });
    }

    priceHistoryChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels,
            datasets: datasets 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Comprehensive Market Analysis: Multi-platform pricing data',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20,
                    color: '#374151'
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4c51bf',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            return labels[context[0].dataIndex];
                        },
                        label: function(context) {
                            const dataPoint = validData[context.dataIndex];
                            
                            if (dataPoint) {
                                return [
                                    `Price: $${context.parsed.y.toFixed(2)}`,
                                    `Source: ${dataPoint.source}`,
                                    `Category: ${dataPoint.category || 'Other'}`
                                ];
                            }
                            return `Price: $${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date',
                        color: '#6b7280',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    ticks: {
                        color: '#6b7280',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(107, 114, 128, 0.15)'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Price (USD)',
                        color: '#6b7280',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    },
                    grid: {
                        color: 'rgba(107, 114, 128, 0.15)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function closePriceHistoryModal() {
    const modal = document.getElementById('priceHistoryModal');
    modal.classList.remove('show');
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
    // Destroy chart to prevent memory leaks
    if (priceHistoryChart) {
        priceHistoryChart.destroy();
        priceHistoryChart = null;
    }
}

// Make functions globally available
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.navigateModal = navigateModal;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.showPriceHistory = showPriceHistory;
window.closePriceHistoryModal = closePriceHistoryModal; 