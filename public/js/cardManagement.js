/**
 * Card Management Module
 * Handles card CRUD operations and form management
 */

let isSubmitting = false; // Prevent rapid-fire submissions

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

function setupFormSubmission() {
    const addCardForm = document.getElementById('addCardForm');
    if (addCardForm) {
        addCardForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addCard();
        });
    }
}

// Export functions for use in other modules
window.addCard = addCard;
window.getFormData = getFormData;
window.validateFormData = validateFormData;
window.removeCard = removeCard;
window.updateAllPrices = updateAllPrices;
window.setupFormSubmission = setupFormSubmission; 