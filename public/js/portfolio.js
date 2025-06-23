/**
 * Portfolio Module
 * Handles portfolio rendering, stats calculation, and UI updates
 */

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

// Export functions for use in other modules
window.handleContainerClick = handleContainerClick;
window.renderPortfolio = renderPortfolio;
window.createCardHTML = createCardHTML;
window.updateStats = updateStats; 