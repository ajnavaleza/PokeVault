/**
 * Card Search Module
 * Handles card search functionality and search results
 */

let searchTimeout = null;

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

// Export functions for use in other modules
window.setupCardSearch = setupCardSearch;
window.handleSearchInput = handleSearchInput;
window.searchCards = searchCards;
window.displaySearchResults = displaySearchResults;
window.createSearchResultHTML = createSearchResultHTML;
window.selectCard = selectCard;
window.trySelectSet = trySelectSet;
window.tryExactSetMatch = tryExactSetMatch;
window.tryMappedSetMatch = tryMappedSetMatch;
window.tryNameSimilarityMatch = tryNameSimilarityMatch;
window.populateSetsDropdown = populateSetsDropdown; 