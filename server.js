/**
 * PokeVault Backend API Server
 * Pokemon card portfolio tracker with price fetching and image integration
 */


const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const TCGdex = require('@tcgdex/sdk').default
const { Query } = require('@tcgdex/sdk');

/* ==================== SERVER CONFIGURATION ==================== */

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v1';
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Initialize tcgdex SDK
const tcgdex = new TCGdex('en');

// Global state
let POKEMON_API_KEY = '';
let portfolios = {};
let setsData = [];

// API rate limiting
let apiCallsToday = 0;
let apiCallsThisMinute = 0;
let minuteResetTime = Date.now() + 60000;

// Caching
const priceCache = new Map();
const imageCache = new Map();

/* ==================== MIDDLEWARE SETUP ==================== */

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/* ==================== INITIALIZATION ==================== */

async function initializeServer() {
    await loadApiKey();
    await loadPortfolios();
    await loadSetsCache();
}

async function loadApiKey() {
    try {
        POKEMON_API_KEY = await fs.readFile('api.txt', 'utf8');
        POKEMON_API_KEY = POKEMON_API_KEY.trim();
        console.log('API key loaded successfully');
    } catch (error) {
        console.error('Error loading API key:', error.message);
    }
}

/* ==================== DATA PERSISTENCE ==================== */

async function loadPortfolios() {
    try {
        const data = await fs.readFile('portfolios.json', 'utf8');
        portfolios = JSON.parse(data);
    } catch (error) {
        portfolios = {};
    }
}

async function savePortfolios() {
    try {
        await fs.writeFile('portfolios.json', JSON.stringify(portfolios, null, 2));
    } catch (error) {
        console.error('Error saving portfolios:', error.message);
    }
}

async function loadSetsCache() {
    try {
        const data = await fs.readFile('sets-cache.json', 'utf8');
        const cacheData = JSON.parse(data);
        
        // Use cache if less than 24 hours old
        if (Date.now() - cacheData.timestamp < 86400000) {
            setsData = cacheData.sets;
            console.log('Loaded sets from cache');
        }
    } catch (error) {
        console.log('No sets cache found, will fetch from API when needed');
    }
}

async function saveSetsCache() {
    try {
        const cacheData = {
            sets: setsData,
            timestamp: Date.now()
        };
        await fs.writeFile('sets-cache.json', JSON.stringify(cacheData, null, 2));
    } catch (error) {
        console.error('Error saving sets cache:', error.message);
    }
}

/* ==================== RATE LIMITING & CACHING ==================== */

function canMakeApiCall() {
    const now = Date.now();
    
    // Reset minute counter if needed
    if (now > minuteResetTime) {
        apiCallsThisMinute = 0;
        minuteResetTime = now + 60000;
    }
    
    return apiCallsToday < 200 && apiCallsThisMinute < 60;
}

function trackApiCall() {
    apiCallsToday++;
    apiCallsThisMinute++;
}

function getPriceCacheKey(name, setId, number) {
    return `${name}-${setId}-${number}`.toLowerCase();
}

function getImageCacheKey(name, setId, number) {
    return `img-${name}-${setId}-${number}`.toLowerCase();
}

function isCacheValid(cacheEntry) {
    return Date.now() - cacheEntry.timestamp < CACHE_DURATION;
}

/* ==================== IMAGE URL PROCESSING ==================== */

function constructImageUrl(baseImageUrl, quality, format) {
    if (!baseImageUrl) return null;
    
    // Remove existing quality/format suffixes
    let cleanUrl = baseImageUrl.replace(/\/(small|large|high|medium|low)\.(png|jpg|webp)$/, '');
    
    // Construct new URL with desired quality and format
    return `${cleanUrl}/${quality}.${format}`;
}

/* ==================== SET ID MAPPING ==================== */

function mapTotcgdexSetId(setId) {
    // Basic mapping for common sets - can be expanded as needed
    const setMapping = {
        'base1': 'base1', 'jungle': 'jungle', 'fossil': 'fossil', 'base2': 'base2',
        'swsh1': 'swsh1', 'swsh2': 'swsh2', 'swsh3': 'swsh3', 'swsh4': 'swsh4',
        'swsh5': 'swsh5', 'swsh6': 'swsh6', 'swsh7': 'swsh7', 'swsh8': 'swsh8',
        'swsh9': 'swsh9', 'swsh10': 'swsh10', 'swsh11': 'swsh11', 'swsh12': 'swsh12',
        'sv1': 'sv1', 'sv2': 'sv2', 'sv3': 'sv3', 'sv4': 'sv4', 'sv5': 'sv5'
    };
    
    return setMapping[setId] || setId;
}

function getSetId(setName) {
    // Simplified set name to ID mapping
    const setMap = {
        'base1': 'base1', 'jungle': 'jungle', 'fossil': 'fossil', 'base2': 'base2',
        'sword-shield': 'swsh1', 'swsh1': 'swsh1',
        'rebel-clash': 'swsh2', 'swsh2': 'swsh2',
        'darkness-ablaze': 'swsh3', 'swsh3': 'swsh3',
        'vivid-voltage': 'swsh4', 'swsh4': 'swsh4',
        'battle-styles': 'swsh5', 'swsh5': 'swsh5',
        'chilling-reign': 'swsh6', 'swsh6': 'swsh6',
        'evolving-skies': 'swsh7', 'swsh7': 'swsh7',
        'fusion-strike': 'swsh8', 'swsh8': 'swsh8',
        'brilliant-stars': 'swsh9', 'swsh9': 'swsh9',
        'astral-radiance': 'swsh10', 'swsh10': 'swsh10',
        'lost-origin': 'swsh11', 'swsh11': 'swsh11',
        'silver-tempest': 'swsh12', 'swsh12': 'swsh12',
        'scarlet-violet': 'sv1', 'sv1': 'sv1',
        'paldea-evolved': 'sv2', 'sv2': 'sv2',
        'obsidian-flames': 'sv3', 'sv3': 'sv3',
        'paradox-rift': 'sv4', 'sv4': 'sv4',
        'temporal-forces': 'sv5', 'sv5': 'sv5'
    };
    
    return setMap[setName] || setName;
}

/* ==================== CARD IMAGE FETCHING ==================== */

async function fetchCardImage(name, setId, number) {
    const cacheKey = getImageCacheKey(name, setId, number);
    
    // Check cache first
    if (imageCache.has(cacheKey)) {
        const cachedData = imageCache.get(cacheKey);
        if (isCacheValid(cachedData)) {
            return cachedData.imageUrl;
        }
    }
    
    try {
        const tcgdexSetId = mapTotcgdexSetId(setId);
        
        // Build card ID for tcgdex (format: setId-number)
        const cardId = buildCardId(tcgdexSetId, number);
        
        // Try to get the card from tcgdex
        const card = await tcgdex.card.get(cardId);
        
        if (card && card.getImageURL) {
            const imageUrl = card.getImageURL('high', 'png');
            
            if (imageUrl) {
                // Cache the result
                imageCache.set(cacheKey, {
                    imageUrl: imageUrl,
                    timestamp: Date.now()
                });
                
                return imageUrl;
            }
        }
        
        // Try alternative formats if direct approach fails
        return await tryAlternativeCardFormats(tcgdexSetId, number, cacheKey);
        
    } catch (error) {
        console.error(`Error fetching image for ${name}:`, error.message);
        return null;
    }
}

function buildCardId(setId, number) {
    if (number && typeof number === 'string') {
        // Handle special formats
        if (number.startsWith('TG') || /^[A-Z]+\d+$/.test(number)) {
            return `${setId}-${number.toLowerCase()}`;
        }
        // Pad standard numbers
        if (/^\d+$/.test(number)) {
            return `${setId}-${number.padStart(3, '0')}`;
        }
    }
    
    return `${setId}-${number}`;
}

async function tryAlternativeCardFormats(setId, number, cacheKey) {
    const alternativeFormats = [
        `${setId}-${number}`,
        `${setId}-${number.toLowerCase()}`,
        `${setId}-${String(number).padStart(2, '0')}`,
        `${setId}-${String(number).padStart(3, '0')}`
    ];
    
    for (const altCardId of alternativeFormats) {
        try {
            const altCard = await tcgdex.card.get(altCardId);
            
            if (altCard && altCard.getImageURL) {
                const imageUrl = altCard.getImageURL('high', 'png');
                
                if (imageUrl) {
                    // Cache the result
                    imageCache.set(cacheKey, {
                        imageUrl: imageUrl,
                        timestamp: Date.now()
                    });
                    
                    return imageUrl;
                }
            }
        } catch (error) {
            continue; // Try next alternative
        }
    }
    
    return null;
}

/* ==================== SETS DATA FETCHING ==================== */

async function fetchSets() {
    if (setsData.length > 0) {
        return setsData;
    }

    if (!canMakeApiCall()) {
        throw new Error('API rate limit exceeded');
    }

    try {
        trackApiCall();
        const response = await axios.get(`${API_BASE_URL}/sets`, {
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Process API response
        let sets = [];
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            sets = response.data.data
                .filter(set => set && set.id && set.name)
                .map(set => ({ id: set.id, name: set.name }));
        } else if (Array.isArray(response.data)) {
            sets = response.data
                .filter(set => set && set.id && set.name)
                .map(set => ({ id: set.id, name: set.name }));
        } else {
            throw new Error('Unexpected API response format');
        }

        setsData = sets;
        await saveSetsCache();
        return setsData;
        
    } catch (error) {
        console.error('Error fetching sets:', error.message);
        throw error;
    }
}

/* ==================== API ROUTES ==================== */

// Card search endpoint
app.get('/api/cards/search', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const searchResults = await tcgdex.card.list(
            Query.create()
                .contains('name', query)
                .sort('name', 'ASC')
                .paginate(1, 20)
        );

        const suggestions = [];
        
        for (const card of searchResults) {
            try {
                const fullCard = await tcgdex.card.get(card.id);
                const setId = card.id.split('-')[0];
                
                let imageUrl = null;
                if (fullCard.image) {
                    imageUrl = constructImageUrl(fullCard.image, 'low', 'webp');
                }
                
                suggestions.push({
                    id: card.id,
                    name: card.name,
                    set: setId,
                    setName: setId,
                    number: card.localId,
                    imageUrl: imageUrl,
                    displayText: `${card.name} - ${setId} #${card.localId}`
                });
            } catch (cardError) {
                console.error(`Error getting card details for ${card.id}:`, cardError.message);
                // Add basic info without image as fallback
                const setId = card.id.split('-')[0];
                suggestions.push({
                    id: card.id,
                    name: card.name,
                    set: setId,
                    setName: setId,
                    number: card.localId,
                    imageUrl: null,
                    displayText: `${card.name} - ${setId} #${card.localId}`
                });
            }
        }

        res.json(suggestions);

    } catch (error) {
        console.error('Error searching cards:', error.message);
        res.json([]);
    }
});

// Card price endpoint
app.get('/api/card-price', async (req, res) => {
    try {
        const { name, set, number } = req.query;
        
        if (!name || !set || !number || !POKEMON_API_KEY) {
            return res.status(400).json({ error: 'Missing required parameters or API key not configured' });
        }

        const setId = getSetId(set);
        const cacheKey = getPriceCacheKey(name, setId, number);
        
        // Check cache first
        if (priceCache.has(cacheKey)) {
            const cachedData = priceCache.get(cacheKey);
            if (isCacheValid(cachedData)) {
                return res.json({ 
                    price: cachedData.price,
                    card: { name, set, number },
                    cached: true
                });
            }
        }

        if (!canMakeApiCall()) {
            return handleRateLimitExceeded(res, cacheKey, { name, set, number });
        }

        trackApiCall();

        const response = await axios.get(`${API_BASE_URL}/prices`, {
            params: { name, setId, number, limit: 1 },
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const price = extractHighestPrice(response.data);

        // Cache the result
        priceCache.set(cacheKey, {
            price: price,
            timestamp: Date.now()
        });

        res.json({ 
            price: price,
            card: { name, set, number }
        });

    } catch (error) {
        console.error('Error fetching card price:', error.message);
        handlePriceError(res, req.query);
    }
});

function handleRateLimitExceeded(res, cacheKey, cardInfo) {
    if (priceCache.has(cacheKey)) {
        const cachedData = priceCache.get(cacheKey);
        return res.json({ 
            price: cachedData.price,
            card: cardInfo,
            note: 'Using cached price - rate limit reached'
        });
    }
    
    const mockPrice = [5.99, 12.50, 25.00, 45.99, 89.99, 150.00, 299.99][Math.floor(Math.random() * 7)];
    return res.json({ 
        price: mockPrice,
        card: cardInfo,
        note: 'Using mock price - rate limit reached'
    });
}

function extractHighestPrice(responseData) {
    if (!responseData || !responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
        return 0;
    }
    
    const cardData = responseData.data[0];
    const allPrices = [];
    
    // Extract eBay prices from all grades
    if (cardData.ebay && cardData.ebay.prices) {
        Object.values(cardData.ebay.prices).forEach(gradeData => {
            if (gradeData.stats && gradeData.stats.average && gradeData.stats.average > 0) {
                allPrices.push(parseFloat(gradeData.stats.average));
            }
        });
    }
    
    // Extract TCGPlayer prices
    if (cardData.tcgPlayer && cardData.tcgPlayer.prices) {
        ['market', 'mid', 'high', 'low'].forEach(type => {
            if (cardData.tcgPlayer.prices[type] && cardData.tcgPlayer.prices[type] > 0) {
                allPrices.push(parseFloat(cardData.tcgPlayer.prices[type]));
            }
        });
    }
    
    // Extract CardMarket prices
    if (cardData.cardmarket && cardData.cardmarket.prices) {
        ['trendPrice', 'averagePrice'].forEach(type => {
            if (cardData.cardmarket.prices[type] && cardData.cardmarket.prices[type] > 0) {
                allPrices.push(parseFloat(cardData.cardmarket.prices[type]));
            }
        });
    }
    
    return allPrices.length > 0 ? Math.max(...allPrices) : 0;
}

function handlePriceError(res, queryParams) {
    const setId = getSetId(queryParams.set);
    const cacheKey = getPriceCacheKey(queryParams.name, setId, queryParams.number);
    
    if (priceCache.has(cacheKey)) {
        const cachedData = priceCache.get(cacheKey);
        return res.json({ 
            price: cachedData.price,
            card: queryParams,
            note: 'Using cached price - API error'
        });
    }
    
    const mockPrice = [5.99, 12.50, 25.00, 45.99, 89.99, 150.00, 299.99][Math.floor(Math.random() * 7)];
    res.json({ 
        price: mockPrice,
        card: queryParams,
        note: 'Using mock price - API unavailable'
    });
}

// Portfolio management endpoints
app.get('/api/portfolio/:userId', (req, res) => {
    const userId = req.params.userId;
    const portfolio = portfolios[userId] || [];
    res.json(portfolio);
});

app.post('/api/portfolio/:userId/add', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { name, set, number, quantity, displayNumber, originalSetId } = req.body;

        if (!name || !set || !number || !quantity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get price using API set ID
        const priceResponse = await axios.get(`http://localhost:${PORT}/api/card-price`, {
            params: { name, set, number }
        });

        // Get image using original tcgdex set ID
        const imageSetId = originalSetId || set;
        const imageUrl = await fetchCardImage(name, imageSetId, number);

        const card = {
            id: Date.now(),
            name,
            set,
            number,
            displayNumber: displayNumber || number,
            quantity: parseInt(quantity),
            currentPrice: priceResponse.data.price,
            imageUrl: imageUrl,
            dateAdded: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        if (!portfolios[userId]) {
            portfolios[userId] = [];
        }

        portfolios[userId].push(card);
        await savePortfolios();

        res.json({ success: true, card });
    } catch (error) {
        console.error('Error adding card:', error.message);
        res.status(500).json({ error: 'Failed to add card' });
    }
});

app.delete('/api/portfolio/:userId/card/:cardId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const cardId = parseInt(req.params.cardId);

        if (!portfolios[userId]) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        portfolios[userId] = portfolios[userId].filter(card => card.id !== cardId);
        await savePortfolios();

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing card:', error.message);
        res.status(500).json({ error: 'Failed to remove card' });
    }
});

app.put('/api/portfolio/:userId/update-prices', async (req, res) => {
    try {
        const userId = req.params.userId;
        const portfolio = portfolios[userId];

        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        let updatedCount = 0;
        let skippedCount = 0;

        for (let card of portfolio) {
            try {
                const setId = getSetId(card.set);
                const cacheKey = getPriceCacheKey(card.name, setId, card.number);
                
                const needsUpdate = !priceCache.has(cacheKey) || 
                                  !isCacheValid(priceCache.get(cacheKey)) ||
                                  (Date.now() - new Date(card.lastUpdated).getTime()) > CACHE_DURATION;

                if (needsUpdate && canMakeApiCall()) {
                    const priceResponse = await axios.get(`http://localhost:${PORT}/api/card-price`, {
                        params: { name: card.name, set: card.set, number: card.number }
                    });
                    card.currentPrice = priceResponse.data.price;
                    card.lastUpdated = new Date().toISOString();
                    updatedCount++;
                } else {
                    if (priceCache.has(cacheKey)) {
                        const cachedData = priceCache.get(cacheKey);
                        card.currentPrice = cachedData.price;
                        card.lastUpdated = new Date().toISOString();
                    }
                    skippedCount++;
                }
            } catch (error) {
                console.error(`Error updating price for ${card.name}:`, error.message);
                skippedCount++;
            }
        }

        await savePortfolios();
        
        res.json({ 
            success: true, 
            portfolio,
            message: `Updated ${updatedCount} cards, skipped ${skippedCount} cards`,
            stats: {
                updated: updatedCount,
                skipped: skippedCount,
                apiCallsToday: apiCallsToday,
                dailyLimit: 200
            }
        });
    } catch (error) {
        console.error('Error updating prices:', error.message);
        res.status(500).json({ error: 'Failed to update prices' });
    }
});

// Stats and sets endpoints
app.get('/api/stats', (req, res) => {
    res.json({
        apiCallsToday: apiCallsToday,
        dailyLimit: 200,
        apiCallsThisMinute: apiCallsThisMinute,
        minuteLimit: 60,
        cacheSize: priceCache.size,
        imageCacheSize: imageCache.size,
        nextMinuteReset: new Date(minuteResetTime).toISOString()
    });
});

app.get('/api/sets', async (req, res) => {
    try {
        const sets = await fetchSets();
        res.json(sets);
    } catch (error) {
        console.error('Error fetching sets:', error.message);
        res.json(getFallbackSets());
    }
});

function getFallbackSets() {
    return [
        { id: 'base1', name: 'Base Set' }, { id: 'jungle', name: 'Jungle' },
        { id: 'fossil', name: 'Fossil' }, { id: 'base2', name: 'Base Set 2' },
        { id: 'swsh1', name: 'Sword & Shield' }, { id: 'swsh9', name: 'Brilliant Stars' },
        { id: 'sv1', name: 'Scarlet & Violet Base Set' }, { id: 'sv4', name: 'Paradox Rift' }
    ];
}

// Frontend route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ==================== SERVER STARTUP ==================== */

initializeServer().then(() => {
    app.listen(PORT, () => {
        console.log(`🎴 PokeVault server running on http://localhost:${PORT}`);
        console.log('Pokemon card portfolio tracker is ready!');
    });
}).catch(error => {
    console.error('Failed to initialize server:', error);
    process.exit(1);
}); 