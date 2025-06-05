# PokeVault 🎴

A modern Pokemon card portfolio tracker with real-time price tracking, autocomplete search, and image integration.

## Features

- **📋 Portfolio Management**: Add, remove, and organize your Pokemon card collection
- **🔍 Smart Search**: Autocomplete search with card previews from 20,000+ cards
- **💰 Real-time Pricing**: Automatic price fetching with highest-value selection from multiple sources
- **🖼️ Card Images**: High-quality card images from TCGdx database
- **📊 Portfolio Statistics**: Track total value, card counts, and collection insights
- **⚡ Performance**: Intelligent caching and rate limiting for optimal performance

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express.js
- **APIs**: Pokemon Price Tracker API, TCGdex API
- **Data**: JSON file storage with caching

## Project Structure

```
PokeVault/
├── public/
│   ├── index.html          # Main application UI
│   ├── style.css           # Application styling
│   └── js/
│       └── app.js          # Frontend JavaScript (cleaned & organized)
├── server.js               # Backend API server (cleaned & organized)
├── package.json            # Dependencies and scripts
├── api.txt                 # Pokemon Price Tracker API key
├── portfolios.json         # User portfolio data
├── sets-cache.json         # Cached set data
└── README.md              # This file
```

## Code Organization

### Frontend (`public/js/app.js`)

The frontend code is organized into logical sections:

- **Global State**: Application variables and constants
- **Application Initialization**: Startup logic and event listeners
- **Card Search Functionality**: Autocomplete search with TCGdx integration
- **Set ID Mapping**: Comprehensive mapping between TCGdx and API formats
- **Card Management**: Add/remove/update card operations
- **Card Number Processing**: Validation and parsing of Pokemon card formats
- **Data Loading**: API communication and error handling
- **UI Rendering**: Dynamic DOM manipulation and portfolio display
- **Utility Functions**: Helper functions for formatting and data processing

### Backend (`server.js`)

The server code is structured for maintainability:

- **Server Configuration**: Express setup and middleware
- **Initialization**: Startup procedures and data loading
- **Data Persistence**: File-based storage with JSON
- **Rate Limiting & Caching**: API call management and response caching
- **Image URL Processing**: TCGdx image URL construction
- **Set ID Mapping**: Translation between different set naming conventions
- **Card Image Fetching**: Integration with TCGdx for card images
- **Sets Data Fetching**: Pokemon set information management
- **API Routes**: RESTful endpoints for all operations

## API Endpoints

### Card Operations
- `GET /api/cards/search?query={term}` - Search cards with autocomplete
- `GET /api/card-price?name={name}&set={set}&number={number}` - Get card price

### Portfolio Management
- `GET /api/portfolio/{userId}` - Get user's portfolio
- `POST /api/portfolio/{userId}/add` - Add card to portfolio
- `DELETE /api/portfolio/{userId}/card/{cardId}` - Remove card
- `PUT /api/portfolio/{userId}/update-prices` - Update all card prices

### Utility
- `GET /api/sets` - Get available Pokemon sets
- `GET /api/stats` - Get API usage statistics

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PokeVault
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add API key**
   Create `api.txt` file with your Pokemon Price Tracker API key:
   ```
   your_api_key_here
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open browser**
   Navigate to `http://localhost:3000`

## Dependencies

### Backend
- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `axios` - HTTP client for API requests
- `@tcgdx/sdk` - TCGdx API integration

### Frontend
- Vanilla JavaScript (no external dependencies)

## Features Deep Dive

### Smart Search System
- **Debounced Input**: 300ms delay prevents excessive API calls
- **Image Previews**: Low-resolution WebP images for fast loading
- **Set Mapping**: Intelligent mapping between TCGdx and pricing API formats
- **Fallback Handling**: Graceful degradation when images fail to load

### Price Management
- **Multi-source Pricing**: Aggregates from eBay, TCGPlayer, and CardMarket
- **Highest Value Selection**: Always displays the maximum available price
- **Smart Caching**: 1-hour cache duration with rate limit protection
- **Background Updates**: Batch price updates without blocking UI

### Card Number Validation
Supports all Pokemon card number formats:
- Standard: `25/102`, `150/185`
- Modern: `SV001/SV198`, `PAL001/PAL200`
- Special: `TG20`, `V001`, `VMAX045`
- Promo: `Promo-001`, `SWSH-123`

### Image Integration
- **High Quality**: 600x825px images for portfolio display
- **Fast Thumbnails**: 245x337px WebP for search results
- **Fallback System**: Graceful handling of missing images
- **URL Construction**: Dynamic quality and format selection

### Supported Set Formats
The application handles multiple set ID formats:
- **Base Era**: base1, jungle, fossil, base2
- **Modern Era**: swsh1-swsh12, sv1-sv9
- **Special Sets**: Decimal formats (sv06.5 → sv6pt5)

## License

This project is for educational and personal use. Please respect the terms of service for all integrated APIs.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the established code organization
4. Test thoroughly with edge cases
5. Submit a pull request

---

**Built with ❤️ for Pokemon card collectors** 