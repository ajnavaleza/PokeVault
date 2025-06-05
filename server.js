/**
 * PokeVault Backend API Server
 * Pokemon card portfolio tracker with Firebase authentication and Firestore database
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const TCGdex = require('@tcgdex/sdk').default
const { Query } = require('@tcgdex/sdk');

// Firebase imports (with error handling for setup)
let db = null;
let authenticateToken = null;
let optionalAuth = null;

try {
    const firebaseAdmin = require('./firebase-admin');
    const authMiddleware = require('./auth-middleware');
    
    db = firebaseAdmin.db;
    authenticateToken = authMiddleware.authenticateToken;
    optionalAuth = authMiddleware.optionalAuth;
    
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.warn('⚠️ Firebase not configured yet. Please follow FIREBASE_SETUP.md');
    console.warn('Running in fallback mode with JSON file storage.');
    
    // Fallback middleware that always fails authentication
    authenticateToken = (req, res, next) => {
        res.status(503).json({ 
            error: 'Firebase not configured. Please follow FIREBASE_SETUP.md' 
        });
    };
    
    optionalAuth = (req, res, next) => next();
}

/* ==================== SERVER CONFIGURATION ==================== */

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v1';
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Initialize tcgdex SDK
const tcgdex = new TCGdex('en');

// Global state
let POKEMON_API_KEY = '';
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
    
    // Load portfolios if Firebase is not available (fallback mode)
    if (!db) {
        await loadPortfolios();
    }
    
    await loadSetsCache();
}

async function loadApiKey() {
    try {
        // Check environment variable first (for production deployment)
        if (process.env.POKEMON_API_KEY) {
            POKEMON_API_KEY = process.env.POKEMON_API_KEY.trim();
            console.log('API key loaded from environment variable');
            return;
        }
        
        // Fall back to file (for local development)
        POKEMON_API_KEY = await fs.readFile('api.txt', 'utf8');
        POKEMON_API_KEY = POKEMON_API_KEY.trim();
        console.log('API key loaded from file');
    } catch (error) {
        console.error('Error loading API key:', error.message);
        console.warn('💡 For deployment, set POKEMON_API_KEY environment variable');
    }
}

/* ==================== FIREBASE PORTFOLIO FUNCTIONS ==================== */

async function getUserPortfolio(userId) {
    if (!db) {
        // Fallback to JSON file system
        return portfolios[userId] || [];
    }
    
    try {
        const portfolioRef = db.collection('portfolios').doc(userId);
        const doc = await portfolioRef.get();
        
        if (!doc.exists) {
            return [];
        }
        
        const data = doc.data();
        return data.cards || [];
    } catch (error) {
        console.error('Error getting portfolio:', error);
        return [];
    }
}

async function saveUserPortfolio(userId, portfolio) {
    if (!db) {
        // Fallback to JSON file system
        portfolios[userId] = portfolio;
        await savePortfolios();
        return true;
    }
    
    try {
        const portfolioRef = db.collection('portfolios').doc(userId);
        await portfolioRef.set({
            cards: portfolio,
            lastUpdated: new Date(),
            userId: userId
        });
        return true;
    } catch (error) {
        console.error('Error saving portfolio:', error);
        return false;
    }
}

async function addCardToPortfolio(userId, card) {
    try {
        const portfolio = await getUserPortfolio(userId);
        
        // Improved duplicate checking - check multiple variations
        const existingCard = portfolio.find(existingCard => {
            const nameMatch = existingCard.name.toLowerCase().trim() === card.name.toLowerCase().trim();
            const setMatch = existingCard.set === card.set;
            
            // Check both parsed number and display number
            const numberMatch = (
                existingCard.number === card.number ||
                existingCard.displayNumber === card.displayNumber ||
                existingCard.number === card.displayNumber ||
                existingCard.displayNumber === card.number
            );
            
            return nameMatch && setMatch && numberMatch;
        });

        if (existingCard) {
            console.log(`🚫 Duplicate card detected: ${card.name} (${card.set}/${card.number}) already exists with ID ${existingCard.id}`);
            throw new Error('This card is already in your portfolio');
        }

        console.log(`✅ Adding new card: ${card.name} (${card.set}/${card.number}) with ID ${card.id}`);
        portfolio.push(card);
        await saveUserPortfolio(userId, portfolio);
        return card;
    } catch (error) {
        console.error('Error adding card to portfolio:', error);
        throw error;
    }
}

async function removeCardFromPortfolio(userId, cardId) {
    try {
        const portfolio = await getUserPortfolio(userId);
        // Handle both string and numeric IDs for backward compatibility
        const updatedPortfolio = portfolio.filter(card => 
            card.id !== cardId && card.id != cardId && card.id !== parseInt(cardId)
        );
        
        if (updatedPortfolio.length === portfolio.length) {
            return false; // No card was removed
        }
        
        await saveUserPortfolio(userId, updatedPortfolio);
        return true;
    } catch (error) {
        console.error('Error removing card from portfolio:', error);
        throw error;
    }
}

/* ==================== DATA PERSISTENCE (LEGACY FALLBACK) ==================== */

// Global state for fallback mode
let portfolios = {};

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

/* ==================== DATA PERSISTENCE (LEGACY - KEEPING FOR SETS CACHE) ==================== */

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
        console.log('🔄 Fetching sets from Pokemon Price Tracker API...');
        console.log('API URL:', `${API_BASE_URL}/sets`);
        console.log('API Key status:', POKEMON_API_KEY ? 'Loaded' : 'NOT SET');
        
        const response = await axios.get(`${API_BASE_URL}/sets`, {
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Sets API response status:', response.status);
        console.log('📦 Sets API response data type:', typeof response.data);
        console.log('📦 Sets API response data length/keys:', Array.isArray(response.data) ? response.data.length : Object.keys(response.data || {}));

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
            console.warn('⚠️ Unexpected API response format:', response.data);
            throw new Error('Unexpected API response format');
        }

        console.log('🎯 Processed sets count:', sets.length);
        setsData = sets;
        await saveSetsCache();
        return setsData;
        
    } catch (error) {
        console.error('❌ Error fetching sets:', error.message);
        if (error.response) {
            console.error('HTTP Status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
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

// Portfolio management endpoints (with authentication)
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const portfolio = await getUserPortfolio(userId);
        res.json(portfolio);
    } catch (error) {
        console.error('Error getting portfolio:', error);
        res.status(500).json({ error: 'Failed to get portfolio' });
    }
});

app.post('/api/portfolio/add', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { name, set, number, quantity, displayNumber, originalSetId } = req.body;

        if (!name || !set || !number || !quantity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get price using API set ID
        const priceResponse = await axios.get(`http://localhost:${PORT}/api/card-price`, {
            params: { name, set, number }
        });

        // Get image using original tcgdx set ID
        const imageSetId = originalSetId || set;
        const imageUrl = await fetchCardImage(name, imageSetId, number);

        // Generate a more robust unique ID
        const cardId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const card = {
            id: cardId,
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

        try {
            const addedCard = await addCardToPortfolio(userId, card);
            res.json({ success: true, card: addedCard });
        } catch (error) {
            if (error.message === 'This card is already in your portfolio') {
                return res.status(409).json({ error: error.message });
            }
            console.error('Error adding card to portfolio:', error);
            res.status(500).json({ error: 'Failed to add card to portfolio' });
        }
    } catch (error) {
        console.error('Error adding card:', error.message);
        res.status(500).json({ error: 'Failed to add card' });
    }
});

app.delete('/api/portfolio/card/:cardId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const cardId = req.params.cardId;

        // Handle both string and numeric IDs for backward compatibility
        const portfolio = await getUserPortfolio(userId);
        const cardExists = portfolio.some(card => 
            card.id === cardId || card.id == cardId || card.id === parseInt(cardId)
        );

        if (!cardExists) {
            return res.status(404).json({ error: 'Card not found in portfolio' });
        }

        if (!await removeCardFromPortfolio(userId, cardId)) {
            return res.status(404).json({ error: 'Card not found in portfolio' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing card from portfolio:', error);
        res.status(500).json({ error: 'Failed to remove card from portfolio' });
    }
});

app.put('/api/portfolio/update-prices', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const portfolio = await getUserPortfolio(userId);

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

        try {
            await saveUserPortfolio(userId, portfolio);
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
            console.error('Error saving portfolio:', error);
            res.status(500).json({ error: 'Failed to save portfolio' });
        }
    } catch (error) {
        console.error('Error updating prices:', error.message);
        res.status(500).json({ error: 'Failed to update prices' });
    }
});

app.put('/api/portfolio/update-quantity', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { cardId, quantity } = req.body;

        if (!cardId || !quantity || quantity < 1) {
            return res.status(400).json({ error: 'Invalid card ID or quantity' });
        }

        const portfolio = await getUserPortfolio(userId);
        const cardIndex = portfolio.findIndex(card => 
            card.id === cardId || card.id == cardId || card.id === parseInt(cardId)
        );

        if (cardIndex === -1) {
            return res.status(404).json({ error: 'Card not found in portfolio' });
        }

        portfolio[cardIndex].quantity = parseInt(quantity);
        await saveUserPortfolio(userId, portfolio);

        res.json({ 
            success: true, 
            card: portfolio[cardIndex],
            message: `Quantity updated to ${quantity}`
        });
    } catch (error) {
        console.error('Error updating card quantity:', error);
        res.status(500).json({ error: 'Failed to update card quantity' });
    }
});

// User profile endpoint
app.get('/api/user/profile', authenticateToken, (req, res) => {
    res.json({
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name
    });
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
        // Base Era (1998-2000)
        { id: 'base1', name: 'Base Set' },
        { id: 'jungle', name: 'Jungle' },
        { id: 'fossil', name: 'Fossil' },
        { id: 'base2', name: 'Base Set 2' },
        { id: 'tr', name: 'Team Rocket' },
        { id: 'gym1', name: 'Gym Heroes' },
        { id: 'gym2', name: 'Gym Challenge' },
        
        // Neo Era (2000-2001)
        { id: 'neo1', name: 'Neo Genesis' },
        { id: 'neo2', name: 'Neo Discovery' },
        { id: 'neo3', name: 'Neo Revelation' },
        { id: 'neo4', name: 'Neo Destiny' },
        
        // E-Card Era (2002-2003)
        { id: 'ecard1', name: 'Expedition Base Set' },
        { id: 'ecard2', name: 'Aquapolis' },
        { id: 'ecard3', name: 'Skyridge' },
        
        // EX Era (2003-2007)
        { id: 'ex1', name: 'Ruby & Sapphire' },
        { id: 'ex2', name: 'Sandstorm' },
        { id: 'ex3', name: 'Dragon' },
        { id: 'ex4', name: 'Team Magma vs Team Aqua' },
        { id: 'ex5', name: 'Hidden Legends' },
        { id: 'ex6', name: 'FireRed & LeafGreen' },
        { id: 'ex7', name: 'Team Rocket Returns' },
        { id: 'ex8', name: 'Deoxys' },
        { id: 'ex9', name: 'Emerald' },
        { id: 'ex10', name: 'Unseen Forces' },
        { id: 'ex11', name: 'Delta Species' },
        { id: 'ex12', name: 'Legend Maker' },
        { id: 'ex13', name: 'Holon Phantoms' },
        { id: 'ex14', name: 'Crystal Guardians' },
        { id: 'ex15', name: 'Dragon Frontiers' },
        { id: 'ex16', name: 'Power Keepers' },
        
        // Diamond & Pearl Era (2007-2009)
        { id: 'dp1', name: 'Diamond & Pearl' },
        { id: 'dp2', name: 'Mysterious Treasures' },
        { id: 'dp3', name: 'Secret Wonders' },
        { id: 'dp4', name: 'Great Encounters' },
        { id: 'dp5', name: 'Majestic Dawn' },
        { id: 'dp6', name: 'Legends Awakened' },
        { id: 'dp7', name: 'Stormfront' },
        
        // Platinum Era (2009-2010)
        { id: 'pl1', name: 'Platinum' },
        { id: 'pl2', name: 'Rising Rivals' },
        { id: 'pl3', name: 'Supreme Victors' },
        { id: 'pl4', name: 'Arceus' },
        
        // HeartGold & SoulSilver Era (2010-2011)
        { id: 'hgss1', name: 'HeartGold & SoulSilver' },
        { id: 'hgss2', name: 'Unleashed' },
        { id: 'hgss3', name: 'Undaunted' },
        { id: 'hgss4', name: 'Triumphant' },
        
        // Black & White Era (2011-2013)
        { id: 'bw1', name: 'Black & White' },
        { id: 'bw2', name: 'Emerging Powers' },
        { id: 'bw3', name: 'Noble Victories' },
        { id: 'bw4', name: 'Next Destinies' },
        { id: 'bw5', name: 'Dark Explorers' },
        { id: 'bw6', name: 'Dragons Exalted' },
        { id: 'bw7', name: 'Dragon Vault' },
        { id: 'bw8', name: 'Boundaries Crossed' },
        { id: 'bw9', name: 'Plasma Storm' },
        { id: 'bw10', name: 'Plasma Freeze' },
        { id: 'bw11', name: 'Plasma Blast' },
        { id: 'bw12', name: 'Legendary Treasures' },
        
        // XY Era (2014-2016)
        { id: 'xy1', name: 'XY' },
        { id: 'xy2', name: 'Flashfire' },
        { id: 'xy3', name: 'Furious Fists' },
        { id: 'xy4', name: 'Phantom Forces' },
        { id: 'xy5', name: 'Primal Clash' },
        { id: 'xy6', name: 'Roaring Skies' },
        { id: 'xy7', name: 'Ancient Origins' },
        { id: 'xy8', name: 'BREAKthrough' },
        { id: 'xy9', name: 'BREAKpoint' },
        { id: 'xy10', name: 'Fates Collide' },
        { id: 'xy11', name: 'Steam Siege' },
        { id: 'xy12', name: 'Evolutions' },
        
        // Sun & Moon Era (2017-2019)
        { id: 'sm1', name: 'Sun & Moon' },
        { id: 'sm2', name: 'Guardians Rising' },
        { id: 'sm3', name: 'Burning Shadows' },
        { id: 'sm35', name: 'Shining Legends' },
        { id: 'sm4', name: 'Crimson Invasion' },
        { id: 'sm5', name: 'Ultra Prism' },
        { id: 'sm6', name: 'Forbidden Light' },
        { id: 'sm7', name: 'Celestial Storm' },
        { id: 'sm75', name: 'Dragon Majesty' },
        { id: 'sm8', name: 'Lost Thunder' },
        { id: 'sm9', name: 'Team Up' },
        { id: 'det1', name: 'Detective Pikachu' },
        { id: 'sm10', name: 'Unbroken Bonds' },
        { id: 'sm11', name: 'Unified Minds' },
        { id: 'sm115', name: 'Hidden Fates' },
        { id: 'sm12', name: 'Cosmic Eclipse' },
        
        // Sword & Shield Era (2020-2022)
        { id: 'swsh1', name: 'Sword & Shield' },
        { id: 'swsh2', name: 'Rebel Clash' },
        { id: 'swsh3', name: 'Darkness Ablaze' },
        { id: 'swsh35', name: 'Champion\'s Path' },
        { id: 'swsh4', name: 'Vivid Voltage' },
        { id: 'swsh45', name: 'Shining Fates' },
        { id: 'swsh5', name: 'Battle Styles' },
        { id: 'swsh6', name: 'Chilling Reign' },
        { id: 'swsh7', name: 'Evolving Skies' },
        { id: 'swsh8', name: 'Fusion Strike' },
        { id: 'swsh9', name: 'Brilliant Stars' },
        { id: 'swsh10', name: 'Astral Radiance' },
        { id: 'swsh11', name: 'Pokemon GO' },
        { id: 'swsh12', name: 'Lost Origin' },
        { id: 'swsh12pt5', name: 'Silver Tempest' },
        
        // Scarlet & Violet Era (2023-Present)
        { id: 'sv1', name: 'Scarlet & Violet Base Set' },
        { id: 'sv2', name: 'Paldea Evolved' },
        { id: 'sv3', name: 'Obsidian Flames' },
        { id: 'sv3pt5', name: '151' },
        { id: 'sv4', name: 'Paradox Rift' },
        { id: 'sv4pt5', name: 'Paldean Fates' },
        { id: 'sv5', name: 'Temporal Forces' },
        { id: 'sv6', name: 'Twilight Masquerade' },
        { id: 'sv6pt5', name: 'Shrouded Fable' },
        { id: 'sv7', name: 'Stellar Crown' },
        { id: 'sv8', name: 'Surging Sparks' }
    ];
}

// Frontend route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ==================== SERVER STARTUP ==================== */

// Initialize server for both local development and Vercel deployment
initializeServer().then(() => {
    // Only start server if not in Vercel environment
    if (!process.env.VERCEL) {
        app.listen(PORT, () => {
            console.log(`🎴 PokeVault server running on http://localhost:${PORT}`);
            console.log('Pokemon card portfolio tracker is ready!');
        });
    }
}).catch(error => {
    console.error('Failed to initialize server:', error);
    if (!process.env.VERCEL) {
        process.exit(1);
    }
});

// Export for Vercel
module.exports = app; 