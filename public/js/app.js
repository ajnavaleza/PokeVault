/**
 * PokeVault Frontend Application
 * Pokemon card portfolio tracker with autocomplete search and price tracking
 */

/* ==================== GLOBAL STATE ==================== */

let portfolio = [];
const USER_ID = 'user1'; // In production, this would come from authentication
let apiStats = {};
let availableSets = [];
let searchTimeout = null;

/* ==================== APPLICATION INITIALIZATION ==================== */

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
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
    // Additional event listeners would go here
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
    
    // No match found - log and clear selection
    console.warn(`Could not find set "${setId}" (${setName}) in dropdown`);
    setSelect.value = '';
    return false;
}

function tryExactSetMatch(setSelect, setId) {
    for (let option of setSelect.options) {
        if (option.value === setId) {
            setSelect.value = setId;
            console.log(`Found exact set match: ${setId}`);
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
            console.log(`Found mapped set match: ${setId} -> ${mappedSetId}`);
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
            console.log(`Found set by name similarity: "${setName}" -> "${option.textContent}"`);
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
    const cardData = getFormData();
    if (!validateFormData(cardData)) return;

    const originalSetId = document.getElementById('cardName').getAttribute('data-original-set');
    
    showStatus('addCardStatus', 'Adding card and fetching price...', 'loading');

    try {
        const response = await fetch(`/api/portfolio/${USER_ID}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...cardData,
                originalSetId: originalSetId || cardData.set
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        portfolio.push(data.card);
        renderPortfolio();
        clearForm();
        showStatus('addCardStatus', `${cardData.name} added successfully!`, 'success');
        loadApiStats();

    } catch (error) {
        console.error('Error adding card:', error);
        showStatus('addCardStatus', `Error adding card: ${error.message}`, 'error');
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
    try {
        const response = await fetch(`/api/portfolio/${USER_ID}/card/${cardId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }

        portfolio = portfolio.filter(card => card.id !== cardId);
        renderPortfolio();

    } catch (error) {
        console.error('Error removing card:', error);
        showStatus('addCardStatus', `Error removing card: ${error.message}`, 'error');
    }
}

async function updateAllPrices() {
    const updateBtn = document.getElementById('updateBtn');
    const originalText = updateBtn.innerHTML;
    
    updateBtn.innerHTML = '⏳ Updating...';
    updateBtn.disabled = true;
    
    document.querySelectorAll('.card-item').forEach(item => item.classList.add('updating'));

    try {
        const response = await fetch(`/api/portfolio/${USER_ID}/update-prices`, {
            method: 'PUT'
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        portfolio = data.portfolio;
        renderPortfolio();
        showStatus('addCardStatus', data.message || 'Prices updated successfully!', 'success');
        loadApiStats();

    } catch (error) {
        console.error('Error updating prices:', error);
        showStatus('addCardStatus', `Error updating prices: ${error.message}`, 'error');
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
    try {
        const response = await fetch(`/api/portfolio/${USER_ID}`);
        portfolio = await response.json();
        renderPortfolio();
    } catch (error) {
        console.error('Error loading portfolio:', error);
        showStatus('addCardStatus', 'Error loading portfolio', 'error');
    }
}

async function loadSets() {
    try {
        const response = await fetch('/api/sets');
        if (!response.ok) throw new Error(`API returned status ${response.status}`);
        
        availableSets = await response.json();
        console.log(`Loaded ${availableSets.length} sets from API`);
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
    updateStats();
}

function createCardHTML(card) {
    const imageHTML = card.imageUrl 
        ? `<div class="card-image">
             <img src="${card.imageUrl}" alt="${card.name}" onerror="this.parentElement.style.display='none'">
           </div>`
        : `<div class="card-image-placeholder">
             <div class="placeholder-content"><span>🎴</span><small>No image</small></div>
           </div>`;
    
    const priceAgeIndicator = getPriceAgeIndicator(card.lastUpdated);
    
    return `
        <div class="card-item">
            <button class="remove-btn" onclick="removeCard(${card.id})" title="Remove card">×</button>
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
                        <div class="current-price">$${card.currentPrice.toFixed(2)}</div>
                        <div class="price-updated">
                            Updated: ${formatDate(card.lastUpdated)}
                            ${priceAgeIndicator}
                        </div>
                    </div>
                    <div class="total-value">Total: $${(card.currentPrice * card.quantity).toFixed(2)}</div>
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
    const totalValue = portfolio.reduce((sum, card) => sum + (card.currentPrice * card.quantity), 0);

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