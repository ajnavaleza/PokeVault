# 🎴 PokeVault - Pokemon Card Portfolio Tracker

A modern web application for tracking your Pokemon card collection with real-time pricing, authentication, and beautiful UI.

## ✨ Features

- 🔍 **Card Search**: Autocomplete search with card images from TCGdx API
- 💰 **Real-time Pricing**: Live price tracking from Pokemon Price Tracker API
- 🔐 **Firebase Authentication**: Secure user accounts with Google/Email login
- 📊 **Portfolio Management**: Add, remove, and track your card collection
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎯 **Duplicate Prevention**: Smart duplicate detection with quantity management
- 📈 **Collection Stats**: Total value, card count, and portfolio analytics

## 🚀 Running the Application

### Prerequisites
- Node.js (v14 or higher)
- npm

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 🚀 Deployment

The app supports both file-based configuration (for local development) and environment variables (for production deployment).

### Environment Variables for Production

Set these environment variables on your hosting platform:

```bash
# Pokemon Price Tracker API
POKEMON_API_KEY=your_api_key

# Firebase Backend Configuration
FIREBASE_PROJECT_ID=pokevault-fcd5b
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_CLIENT_X509_CERT_URL=your_cert_url

# Firebase Frontend Configuration
FIREBASE_API_KEY=your_frontend_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Deployment Platforms

**Heroku:**
```bash
heroku config:set POKEMON_API_KEY=your_key
heroku config:set FIREBASE_PROJECT_ID=pokevault-fcd5b
# ... set all other variables
git push heroku main
```

**Vercel:**
```bash
vercel env add POKEMON_API_KEY
vercel env add FIREBASE_PROJECT_ID
# ... add all other variables
vercel deploy
```

**Railway:**
```bash
railway variables set POKEMON_API_KEY=your_key
# ... set all other variables
railway up
```

## 📁 Project Structure

```
PokeVault/
├── server.js                          # Express server & API routes
├── firebase-admin.js                  # Firebase backend configuration
├── auth-middleware.js                 # Authentication middleware
├── public/
│   ├── index.html                     # Main HTML file
│   ├── firebase-config.js             # Firebase frontend config
│   ├── js/
│   │   ├── app.js                     # Main application logic
│   │   └── auth.js                    # Authentication handling
│   └── css/
│       └── styles.css                 # Application styles
├── api.txt                            # Pokemon API key (local dev)
├── firebase-service-account.json      # Firebase credentials (local dev)
└── package.json                       # Dependencies
```

## 📊 API Endpoints

- `GET /api/cards/search` - Search for Pokemon cards
- `GET /api/card-price` - Get card pricing data
- `GET /api/sets` - Get available Pokemon sets
- `GET /api/portfolio` - Get user's portfolio (authenticated)
- `POST /api/portfolio/add` - Add card to portfolio (authenticated)
- `DELETE /api/portfolio/card/:id` - Remove card (authenticated)
- `PUT /api/portfolio/update-prices` - Update all prices (authenticated)
- `PUT /api/portfolio/update-quantity` - Update card quantity (authenticated)

## 📝 License

This project is licensed under the MIT License. 