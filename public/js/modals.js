/**
 * Modals Module
 * Handles all modal functionality including image, confirmation, and price history modals
 */

let currentModalIndex = 0;
let priceHistoryChart = null;

/* ==================== IMAGE MODAL FUNCTIONS ==================== */

function openImageModal(cardIndex) {
    if (cardIndex < 0 || cardIndex >= portfolio.length) return;
    
    currentModalIndex = cardIndex;
    updateModalContent();
    
    const modal = document.getElementById('imageModal');
    modal.classList.add('show');
    
    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
    
    // Close modal when clicking outside the image
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeImageModal();
        }
    };
    
    // Add keyboard navigation
    document.addEventListener('keydown', handleModalKeydown);
}

function updateModalContent() {
    const card = portfolio[currentModalIndex];
    if (!card) return;
    
    const modalImage = document.getElementById('modalImage');
    const prevBtn = document.querySelector('.modal-nav-prev');
    const nextBtn = document.querySelector('.modal-nav-next');
    
    // Set image and info
    modalImage.src = card.imageUrl || '';
    modalImage.alt = card.name;
    
    // Update navigation button states
    prevBtn.disabled = currentModalIndex === 0;
    nextBtn.disabled = currentModalIndex === portfolio.length - 1;
    
    // Show/hide navigation arrows based on portfolio size
    if (portfolio.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
    }
}

function navigateModal(direction) {
    const newIndex = currentModalIndex + direction;
    
    if (newIndex >= 0 && newIndex < portfolio.length) {
        currentModalIndex = newIndex;
        updateModalContent();
    }
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('show');
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
    // Remove event listeners
    modal.onclick = null;
    document.removeEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(e) {
    switch(e.key) {
        case 'Escape':
            closeImageModal();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            navigateModal(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            navigateModal(1);
            break;
    }
}

/* ==================== CONFIRMATION MODAL FUNCTIONS ==================== */

function showConfirmModal(title, message, card, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const previewEl = document.getElementById('confirmCardPreview');
    const cancelBtn = document.getElementById('confirmCancel');
    const deleteBtn = document.getElementById('confirmDelete');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Create card preview
    const imageHTML = card.imageUrl 
        ? `<img src="${card.imageUrl}" alt="${card.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="placeholder" style="display: none;">🎴</div>`
        : `<div class="placeholder">🎴</div>`;
    
    const priceText = card.currentPrice !== null 
        ? `$${card.currentPrice.toFixed(2)}`
        : 'Price not available';
    
    const totalValue = card.currentPrice !== null 
        ? ` × ${card.quantity} = $${(card.currentPrice * card.quantity).toFixed(2)}`
        : '';
    
    previewEl.innerHTML = `
        ${imageHTML}
        <div class="confirm-card-info">
            <div class="confirm-card-name">${card.name}</div>
            <div class="confirm-card-details">${getSetDisplayName(card.set)} #${card.displayNumber || card.number}</div>
            <div class="confirm-card-value">${priceText}${totalValue}</div>
        </div>
    `;
    
    // Set up event listeners
    cancelBtn.onclick = closeConfirmModal;
    deleteBtn.onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
    
    // Close on overlay click
    const overlay = modal.querySelector('.confirm-modal-overlay');
    overlay.onclick = closeConfirmModal;
    
    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Focus on cancel button for better accessibility
    setTimeout(() => cancelBtn.focus(), 100);
    
    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeConfirmModal();
        }
    };
    
    document.addEventListener('keydown', handleEscape);
    modal._escapeHandler = handleEscape; // Store for cleanup
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    // Clean up event listeners
    if (modal._escapeHandler) {
        document.removeEventListener('keydown', modal._escapeHandler);
        delete modal._escapeHandler;
    }
    
    // Clear button handlers
    document.getElementById('confirmCancel').onclick = null;
    document.getElementById('confirmDelete').onclick = null;
    const overlay = modal.querySelector('.confirm-modal-overlay');
    overlay.onclick = null;
}

/* ==================== PRICE HISTORY MODAL FUNCTIONS ==================== */

async function showPriceHistory(cardId, cardName, cardImageUrl, cardDetails, currentPrice) {
    // Close any other open modals
    document.querySelectorAll('.image-modal.show, .price-history-modal.show').forEach(m => m.classList.remove('show'));

    if (!authManager.isAuthenticated()) {
        showStatus('addCardStatus', 'Please log in to view price history', 'error');
        return;
    }

    const modal = document.getElementById('priceHistoryModal');
    const cardImage = document.getElementById('priceHistoryCardImage');
    const cardNameEl = document.getElementById('priceHistoryCardName');
    const cardDetailsEl = document.getElementById('priceHistoryCardDetails');
    const loadingEl = document.getElementById('priceHistoryLoading');
    const errorEl = document.getElementById('priceHistoryError');
    const chartContainer = document.querySelector('.price-chart-container');

    // Set card info
    cardImage.src = cardImageUrl || '';
    cardImage.style.display = cardImageUrl ? 'block' : 'none';
    cardNameEl.textContent = cardName;
    cardDetailsEl.textContent = cardDetails;

    // Show modal and loading state
    modal.classList.add('show');
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    chartContainer.style.display = 'none';
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';

    // Close modal when clicking outside
    const overlay = modal.querySelector('.price-history-modal-overlay');
    overlay.onclick = closePriceHistoryModal;

    try {
        console.log('Fetching price history for card:', cardId);
        const response = await makeAuthenticatedRequest(`/api/portfolio/card/${cardId}/history`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const history = await response.json();
        console.log('Received price history:', history);

        loadingEl.style.display = 'none';

        if (!history || history.length === 0) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = '<p>No price history available from external API. This could be due to API rate limits or the card not being found in the external database.</p>';
            return;
        }

        // Show chart container
        chartContainer.style.display = 'flex';

        // Add explanation text for the chart
        const existingExplanation = document.querySelector('.chart-explanation');
        if (existingExplanation) {
            existingExplanation.remove();
        }
        
        const explanation = document.createElement('div');
        explanation.className = 'chart-explanation';
        explanation.innerHTML = `
            <p><strong>Comprehensive Market Analysis:</strong> This chart displays all available pricing data from multiple sources including 
            historical averages (CardMarket 1, 7, 30-day), current market trends, graded card values (PSA/BGS), and marketplace data (TCGPlayer, eBay). 
            Each data point represents real market conditions across different platforms and time periods.</p>
        `;
        chartContainer.parentNode.insertBefore(explanation, chartContainer);

        // Calculate stats
        const prices = history.map(h => h.price).filter(p => p !== null);
        const highPrice = Math.max(...prices);
        const lowPrice = Math.min(...prices);
        const firstPrice = history[0]?.price;
        const priceChange = currentPrice && firstPrice ? currentPrice - firstPrice : 0;
        const priceChangePercent = firstPrice ? ((priceChange / firstPrice) * 100) : 0;

        // Update stats
        document.getElementById('currentPriceValue').textContent = currentPrice ? `$${currentPrice.toFixed(2)}` : 'N/A';
        document.getElementById('highPriceValue').textContent = highPrice ? `$${highPrice.toFixed(2)}` : 'N/A';
        document.getElementById('lowPriceValue').textContent = lowPrice ? `$${lowPrice.toFixed(2)}` : 'N/A';
        
        const priceChangeEl = document.getElementById('priceChangeValue');
        const changeText = priceChange >= 0 ? `+$${priceChange.toFixed(2)}` : `-$${Math.abs(priceChange).toFixed(2)}`;
        const percentText = priceChangePercent >= 0 ? `+${priceChangePercent.toFixed(1)}%` : `${priceChangePercent.toFixed(1)}%`;
        priceChangeEl.textContent = `${changeText} (${percentText})`;
        priceChangeEl.className = `price-stat-value ${priceChange >= 0 ? 'positive' : 'negative'}`;

        // Create chart with a small delay to ensure proper cleanup
        setTimeout(() => {
            createPriceChart(history);
        }, 50);

    } catch (error) {
        console.error('Error loading price history:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.innerHTML = '<p>Failed to load price history. Please try again later.</p>';
    }
}

function createPriceChart(history) {
    const canvas = document.getElementById('priceHistoryChart');
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (priceHistoryChart) {
        priceHistoryChart.destroy();
        priceHistoryChart = null;
    }
    
    // Also destroy any chart that might be attached to the canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    // Clear the canvas to ensure clean state
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Prepare data
    const validData = history.filter(h => h.price !== null && h.price !== undefined);
    
    if (validData.length === 0) {
        return;
    }

    // Group data by category for better visualization
    const categoryGroups = {};
    validData.forEach(item => {
        const category = item.category || 'other';
        if (!categoryGroups[category]) {
            categoryGroups[category] = [];
        }
        categoryGroups[category].push(item);
    });

    // Define category styles with improved colors and labels
    const categoryStyles = {
        'historical': { 
            label: 'Historical (30-day avg)', 
            borderColor: '#6c757d', 
            backgroundColor: 'rgba(108, 117, 125, 0.2)',
            pointStyle: 'circle'
        },
        'recent': { 
            label: 'Recent Trends (7-day avg)', 
            borderColor: '#0d6efd', 
            backgroundColor: 'rgba(13, 110, 253, 0.2)',
            pointStyle: 'circle'
        },
        'current': { 
            label: 'Current Market (1-day avg)', 
            borderColor: '#198754', 
            backgroundColor: 'rgba(25, 135, 84, 0.2)',
            pointStyle: 'circle'
        },
        'trend': { 
            label: 'Market Trends', 
            borderColor: '#fd7e14', 
            backgroundColor: 'rgba(253, 126, 20, 0.2)',
            pointStyle: 'triangle'
        },
        'reverse-holo': { 
            label: 'Reverse Holo Variants', 
            borderColor: '#6f42c1', 
            backgroundColor: 'rgba(111, 66, 193, 0.2)',
            pointStyle: 'rectRot'
        },
        'graded': { 
            label: 'Graded Cards (PSA/BGS)', 
            borderColor: '#dc3545', 
            backgroundColor: 'rgba(220, 53, 69, 0.2)',
            pointStyle: 'star'
        },
        'tcgplayer': { 
            label: 'TCGPlayer Market Data', 
            borderColor: '#20c997', 
            backgroundColor: 'rgba(32, 201, 151, 0.2)',
            pointStyle: 'rect'
        }
    };

    // Create datasets
    const datasets = [];
    
    // Create labels from dates for simpler chart without time adapter
    const labels = validData.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // If we have custom colors for individual points, create a comprehensive line chart
    const hasCustomColors = validData.some(item => item.color);
    
    if (hasCustomColors && validData.length > 1) {
        // Create line chart with individual colored points
        datasets.push({
            label: 'Market Price Analysis',
            data: validData.map(item => item.price),
            backgroundColor: validData.map(item => item.color || '#007bff'),
            borderColor: '#007bff',
            borderWidth: 3,
            pointRadius: 10,
            pointHoverRadius: 14,
            pointBorderWidth: 2,
            pointBorderColor: '#ffffff',
            fill: false,
            tension: 0.4
        });
    } else {
        // Create category-based datasets for cleaner visualization
        Object.entries(categoryGroups).forEach(([category, items]) => {
            const style = categoryStyles[category] || { 
                label: category.charAt(0).toUpperCase() + category.slice(1), 
                borderColor: '#007bff', 
                backgroundColor: 'rgba(0, 123, 255, 0.2)',
                pointStyle: 'circle'
            };
            
            // Find indices of these items in the validData array for proper positioning
            const categoryData = validData.map(item => 
                items.some(categoryItem => categoryItem.date === item.date && categoryItem.price === item.price) 
                    ? item.price 
                    : null
            );
            
            datasets.push({
                label: style.label,
                data: categoryData,
                borderColor: style.borderColor,
                backgroundColor: style.backgroundColor,
                borderWidth: 3,
                pointRadius: 8,
                pointHoverRadius: 12,
                pointStyle: style.pointStyle,
                fill: false,
                tension: 0.3,
                spanGaps: true
            });
        });
    }

    priceHistoryChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels,
            datasets: datasets 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Comprehensive Market Analysis: Multi-platform pricing data',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20,
                    color: '#374151'
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4c51bf',
                    borderWidth: 2,
                    cornerRadius: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            return labels[context[0].dataIndex];
                        },
                        label: function(context) {
                            const dataPoint = validData[context.dataIndex];
                            
                            if (dataPoint) {
                                return [
                                    `Price: $${context.parsed.y.toFixed(2)}`,
                                    `Source: ${dataPoint.source}`,
                                    `Category: ${dataPoint.category || 'Other'}`
                                ];
                            }
                            return `Price: $${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date',
                        color: '#6b7280',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    ticks: {
                        color: '#6b7280',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(107, 114, 128, 0.15)'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Price (USD)',
                        color: '#6b7280',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    },
                    grid: {
                        color: 'rgba(107, 114, 128, 0.15)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function closePriceHistoryModal() {
    const modal = document.getElementById('priceHistoryModal');
    modal.classList.remove('show');
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
    // Destroy chart to prevent memory leaks
    if (priceHistoryChart) {
        priceHistoryChart.destroy();
        priceHistoryChart = null;
    }
}

// Export functions for use in other modules
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.navigateModal = navigateModal;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.showPriceHistory = showPriceHistory;
window.closePriceHistoryModal = closePriceHistoryModal; 