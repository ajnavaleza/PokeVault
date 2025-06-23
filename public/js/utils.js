/**
 * Utilities Module
 * Helper functions for card processing, validation, and general utilities
 */

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

/* ==================== UTILITY FUNCTIONS ==================== */

function getSetDisplayName(setId) {
    // This function would need to be implemented based on your set data
    // For now, return the setId as a fallback
    return setId || 'Unknown Set';
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return 'Invalid Date';
    }
}

function getPriceAgeIndicator(lastUpdated) {
    if (!lastUpdated) return '';
    
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffHours = (now - updated) / (1000 * 60 * 60);
    
    if (diffHours < 1) return '<span class="price-fresh">●</span>';
    if (diffHours < 24) return '<span class="price-recent">●</span>';
    if (diffHours < 168) return '<span class="price-old">●</span>';
    return '<span class="price-stale">●</span>';
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.innerHTML = `<div class="${type}">${message}</div>`;
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => element.innerHTML = '', 7000);
    }
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

// Export functions for use in other modules
window.parseCardNumber = parseCardNumber;
window.validateCardNumber = validateCardNumber;
window.mapTCGdxToApiSetId = mapTCGdxToApiSetId;
window.getSetDisplayName = getSetDisplayName;
window.formatDate = formatDate;
window.getPriceAgeIndicator = getPriceAgeIndicator;
window.showStatus = showStatus;
window.clearForm = clearForm;
window.clearSearch = clearSearch; 