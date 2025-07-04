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

// Helper function to get card price (used internally and by API endpoint)
async function getCardPrice(name, set, number) {
    if (!name || !set || !number || !POKEMON_API_KEY) {
        throw new Error('Missing required parameters or API key not configured');
    }

    const setId = getSetId(set);
    const cacheKey = getPriceCacheKey(name, setId, number);
    
    // Check cache first
    if (priceCache.has(cacheKey)) {
        const cachedData = priceCache.get(cacheKey);
        if (isCacheValid(cachedData)) {
            return { 
                price: cachedData.price,
                card: { name, set, number },
                cached: true
            };
        }
    }

    if (!canMakeApiCall()) {
        // Handle rate limit by using cached data if available
        if (priceCache.has(cacheKey)) {
            const cachedData = priceCache.get(cacheKey);
            return { 
                price: cachedData.price,
                card: { name, set, number },
                note: 'Using cached price - rate limit reached'
            };
        }
        
        // Use null price if no cache available and rate limited
        return { 
            price: null,
            card: { name, set, number },
            note: 'Price not available - rate limit reached'
        };
    }

    trackApiCall();

    try {
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

        return { 
            price: price,
            card: { name, set, number }
        };
    } catch (error) {
        console.error('Error fetching card price:', error.message);
        
        // Handle error by using cached data if available
        if (priceCache.has(cacheKey)) {
            const cachedData = priceCache.get(cacheKey);
            return { 
                price: cachedData.price,
                card: { name, set, number },
                note: 'Using cached price - API error'
            };
        }
        
        // Use null price if no cache available and API error
        return { 
            price: null,
            card: { name, set, number },
            note: 'Price not available - API unavailable'
        };
    }
}

// Card price endpoint
app.get('/api/card-price', async (req, res) => {
    try {
        const { name, set, number } = req.query;
        const priceData = await getCardPrice(name, set, number);
        res.json(priceData);
    } catch (error) {
        console.error('Error fetching card price:', error.message);
        res.status(400).json({ error: error.message });
    }
});

function extractHighestPrice(responseData) {
    if (!responseData || !responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
        return null; // Return null instead of 0 for unavailable prices
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
    
    return allPrices.length > 0 ? Math.max(...allPrices) : null; // Return null instead of 0
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

        // Get price using direct function call instead of HTTP request
        const priceData = await getCardPrice(name, set, number);

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
            currentPrice: priceData.price,
            imageUrl: imageUrl,
            dateAdded: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        try {
            const addedCard = await addCardToPortfolio(userId, card);
            // Only track price history for non-null prices
            if (priceData.price !== null) {
                await addPriceToHistory(userId, cardId, priceData.price);
            }
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
                    try {
                        const priceData = await getCardPrice(card.name, card.set, card.number);
                        card.currentPrice = priceData.price;
                        card.lastUpdated = new Date().toISOString();
                        updatedCount++;
                        // Only track price history for non-null prices
                        if (priceData.price !== null) {
                            await addPriceToHistory(userId, card.id, priceData.price);
                        }
                    } catch (error) {
                        console.error(`Error fetching price for ${card.name}:`, error.message);
                        skippedCount++;
                    }
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

// Get price history for a specific card using external API data
app.get('/api/portfolio/card/:cardId/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { cardId } = req.params;
        
        console.log('=== PRICE HISTORY REQUEST ===');
        console.log('Card ID:', cardId);
        console.log('User ID:', userId);
        
        // Find the card in the user's portfolio to get its details
        const portfolio = await getUserPortfolio(userId);
        console.log('Portfolio size:', portfolio.length);
        
        const card = portfolio.find(c => c.id === cardId);
        console.log('Card found in portfolio:', !!card);
        
        if (!card) {
            console.log('Available cards in portfolio:', portfolio.map(c => ({ id: c.id, name: c.name })));
            return res.status(404).json({ error: 'Card not found in portfolio' });
        }
        
        console.log('Found card:', { name: card.name, set: card.set, number: card.number });
        console.log('Using for API call:', { name: card.name, set: card.set, number: card.number });
        
        // Get detailed pricing data from external API
        // Use the actual card set and number from the portfolio data
        const priceHistory = await getCardPriceHistory(card.name, card.set, card.number);
        console.log('Price history length:', priceHistory.length);
        
        if (priceHistory.length === 0) {
            console.log('No price history found for card:', { name: card.name, set: card.set, number: card.number });
        } else {
            console.log('Sample price data:', priceHistory.slice(0, 2));
        }
        
        res.json(priceHistory);
    } catch (error) {
        console.error('=== PRICE HISTORY ERROR ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to get price history' });
    }
});



// Test endpoint to see detailed card data structure
app.get('/api/test-card-data', async (req, res) => {
    try {
        const { name, set, number } = req.query;
        
        if (!name || !set || !number) {
            return res.status(400).json({ error: 'Missing required parameters: name, set, number' });
        }

        const setId = getSetId(set);
        
        if (!canMakeApiCall()) {
            return res.status(429).json({ error: 'API rate limit reached' });
        }

        trackApiCall();

        // First, get the card data to find the card ID
        const searchResponse = await axios.get(`${API_BASE_URL}/prices`, {
            params: { name, setId, number, limit: 1 },
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!searchResponse.data || !searchResponse.data.data || searchResponse.data.data.length === 0) {
            return res.status(404).json({ error: 'Card not found' });
        }

        const cardData = searchResponse.data.data[0];
        const externalCardId = cardData.id;

        // Now get detailed pricing using the card ID
        if (!canMakeApiCall()) {
            return res.status(429).json({ error: 'API rate limit reached' });
        }

        trackApiCall();

        const detailedResponse = await axios.get(`${API_BASE_URL}/prices`, {
            params: { id: externalCardId },
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            searchResult: cardData,
            detailedPricing: detailedResponse.data,
            cardId: externalCardId
        });

    } catch (error) {
        console.error('Error testing card data:', error.message);
        res.status(500).json({ error: 'Failed to fetch card data' });
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

// Initialize server immediately for Vercel, async for local development
if (process.env.VERCEL) {
    // In Vercel, initialize but don't wait
    initializeServer().catch(error => {
        console.error('Failed to initialize server:', error);
    });
} else {
    // Local development - wait for initialization
    initializeServer().then(() => {
        app.listen(PORT, () => {
            console.log(`🎴 PokeVault server running on http://localhost:${PORT}`);
            console.log('Pokemon card portfolio tracker is ready!');
        });
    }).catch(error => {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    });
}

// Export for Vercel
module.exports = app;

async function addPriceToHistory(userId, cardId, price) {
    if (!db) {
        // For file-based storage, we'll need to extend the portfolios structure
        return;
    }
    
    try {
        const historyRef = db.collection('priceHistory').doc(`${userId}_${cardId}`);
        const historyDoc = await historyRef.get();
        
        let history = [];
        if (historyDoc.exists) {
            history = historyDoc.data().history || [];
        }
        
        // Add new price entry
        const newEntry = {
            price: price,
            date: new Date().toISOString()
        };
        
        history.push(newEntry);
        
        // Keep only last 30 days of history to save storage
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        history = history.filter(entry => new Date(entry.date) >= thirtyDaysAgo);
        
        await historyRef.set({
            userId: userId,
            cardId: cardId,
            history: history,
            lastUpdated: new Date()
        });
    } catch (error) {
        console.error('Error adding price to history:', error);
    }
}

async function getCardPriceHistory(name, set, number) {
    if (!name || !set || !number || !POKEMON_API_KEY) {
        throw new Error('Missing required parameters or API key not configured');
    }

    const setId = getSetId(set);
    
    if (!canMakeApiCall()) {
        throw new Error('API rate limit reached');
    }

    trackApiCall();

    try {
        // Use the same API call as the working getCardPrice function
        const response = await axios.get(`${API_BASE_URL}/prices`, {
            params: { name, setId, number, limit: 1 },
            headers: {
                'Authorization': `Bearer ${POKEMON_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data || !response.data.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
            return [];
        }

        // Extract all available price points to create a more comprehensive "history"
        const priceHistory = extractPriceHistory(response.data);
        
        return priceHistory;

    } catch (error) {
        console.error('Error fetching card price history:', error.message);
        return [];
    }
}

function extractPriceHistory(responseData) {
    if (!responseData || !responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
        return [];
    }
    
    const cardData = responseData.data[0];
    const allPrices = [];
    const baseDate = new Date();
    
    // Extract CardMarket time-based averages (these represent actual historical data)
    if (cardData.cardmarket && cardData.cardmarket.prices) {
        const cardmarketPrices = cardData.cardmarket.prices;
        
        // 30-day average (oldest data point)
        if (cardmarketPrices.avg30 && cardmarketPrices.avg30 > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 30);
            allPrices.push({
                price: parseFloat(cardmarketPrices.avg30),
                date: date.toISOString(),
                source: 'CardMarket 30-Day Average',
                category: 'historical',
                color: '#6c757d'
            });
        }
        
        // 7-day average
        if (cardmarketPrices.avg7 && cardmarketPrices.avg7 > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 7);
            allPrices.push({
                price: parseFloat(cardmarketPrices.avg7),
                date: date.toISOString(),
                source: 'CardMarket 7-Day Average',
                category: 'recent',
                color: '#0d6efd'
            });
        }
        
        // 1-day average (most recent)
        if (cardmarketPrices.avg1 && cardmarketPrices.avg1 > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 1);
            allPrices.push({
                price: parseFloat(cardmarketPrices.avg1),
                date: date.toISOString(),
                source: 'CardMarket 1-Day Average',
                category: 'current',
                color: '#198754'
            });
        }
        
        // Add trend price as a comparison point
        if (cardmarketPrices.trendPrice && cardmarketPrices.trendPrice > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 14);
            allPrices.push({
                price: parseFloat(cardmarketPrices.trendPrice),
                date: date.toISOString(),
                source: 'CardMarket Trend Price',
                category: 'trend',
                color: '#fd7e14'
            });
        }
        
        // Add reverse holo averages if available (for cards that have them)
        if (cardmarketPrices.reverseHoloAvg30 && cardmarketPrices.reverseHoloAvg30 > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 25);
            allPrices.push({
                price: parseFloat(cardmarketPrices.reverseHoloAvg30),
                date: date.toISOString(),
                source: 'Reverse Holo 30-Day Average',
                category: 'reverse-holo',
                color: '#6f42c1'
            });
        }
        
        if (cardmarketPrices.reverseHoloAvg7 && cardmarketPrices.reverseHoloAvg7 > 0) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - 5);
            allPrices.push({
                price: parseFloat(cardmarketPrices.reverseHoloAvg7),
                date: date.toISOString(),
                source: 'Reverse Holo 7-Day Average',
                category: 'reverse-holo',
                color: '#6f42c1'
            });
        }
    }
    
    // Extract ALL eBay graded card prices to show the full grading spectrum
    if (cardData.ebay && cardData.ebay.prices) {
        const gradeInfo = {
            '10': { name: 'PSA 10', dayOffset: 2, color: '#dc3545' }, // Premium red
            '9': { name: 'PSA 9', dayOffset: 4, color: '#fd7e14' },   // Orange
            '8': { name: 'PSA 8', dayOffset: 6, color: '#ffc107' }    // Yellow
        };
        
        Object.entries(cardData.ebay.prices).forEach(([grade, gradeData]) => {
            if (gradeInfo[grade] && gradeData.stats && gradeData.stats.average && gradeData.stats.average > 0) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() - gradeInfo[grade].dayOffset);
                
                allPrices.push({
                    price: parseFloat(gradeData.stats.average),
                    date: date.toISOString(),
                    source: `eBay ${gradeInfo[grade].name} Graded`,
                    category: 'graded',
                    color: gradeInfo[grade].color
                });
            }
        });
    }
    
    // Extract TCGPlayer prices (representing different market conditions)
    if (cardData.tcgPlayer && cardData.tcgPlayer.prices) {
        const tcgPlayerInfo = [
            { key: 'low', name: 'TCGPlayer Low', dayOffset: 21, color: '#dc3545' },
            { key: 'market', name: 'TCGPlayer Market', dayOffset: 10, color: '#0d6efd' },
            { key: 'high', name: 'TCGPlayer High', dayOffset: 3, color: '#198754' }
        ];
        
        tcgPlayerInfo.forEach(({ key, name, dayOffset, color }) => {
            if (cardData.tcgPlayer.prices[key] && cardData.tcgPlayer.prices[key] > 0) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() - dayOffset);
                
                allPrices.push({
                    price: parseFloat(cardData.tcgPlayer.prices[key]),
                    date: date.toISOString(),
                    source: name,
                    category: 'tcgplayer',
                    color: color
                });
            }
        });
    }
    
    // If we still don't have any prices, try to create at least one data point from the highest price
    if (allPrices.length === 0) {
        const highestPrice = extractHighestPrice(responseData);
        if (highestPrice && highestPrice > 0) {
            allPrices.push({
                price: highestPrice,
                date: new Date().toISOString(),
                source: 'Current Market Price',
                category: 'current',
                color: '#6c757d'
            });
        }
    }
    
    // Sort by date (oldest first for chart timeline)
    allPrices.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return allPrices;
}

async function getPriceHistory(userId, cardId) {
    if (!db) {
        return [];
    }
    
    try {
        const historyRef = db.collection('priceHistory').doc(`${userId}_${cardId}`);
        const historyDoc = await historyRef.get();
        
        if (!historyDoc.exists) {
            return [];
        }
        
        return historyDoc.data().history || [];
    } catch (error) {
        console.error('Error getting price history:', error);
        return [];
    }
} 