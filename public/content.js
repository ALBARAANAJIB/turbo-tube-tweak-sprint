
// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showToast') {
    showToast(message.message, message.count || 0);
  } else if (message.action === 'displaySummary') {
    displaySummary(message.summary);
  } else if (message.action === 'summaryError') {
    displaySummaryError(message.error);
  } else if (message.action === 'showSummaryLoading') {
    showSummaryLoading(message.message || 'Fetching transcript and generating summary...');
  } else if (message.action === 'triggerSummary') {
    // This will be received when clicked from the popup
    const summaryButton = document.getElementById('youtube-enhancer-ai-panel')?.querySelector('button');
    if (summaryButton) {
      summaryButton.click();
    }
  } else if (message.action === 'extractTranscript') {
    extractTranscriptFromPage().then(transcript => {
      sendResponse({ success: true, transcript });
    }).catch(error => {
      console.error('Error extracting transcript:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
  return true;
});

// New function to extract transcript directly from YouTube's UI
async function extractTranscriptFromPage() {
  try {
    console.log('Starting transcript extraction from YouTube page');
    
    // Check if we're on a YouTube video page
    if (!window.location.href.includes('youtube.com/watch')) {
      throw new Error('Not on a YouTube video page');
    }
    
    // First check if transcript panel is already open
    let transcriptPanel = document.querySelector('ytd-transcript-renderer');
    const transcriptSearchPanel = document.querySelector('ytd-transcript-search-panel-renderer');
    
    // If transcript panel is not open, try to open it
    if (!transcriptPanel && !transcriptSearchPanel) {
      console.log('Transcript panel not found, attempting to open it');
      
      // Find and click the "Show transcript" button
      const showTranscriptButton = findShowTranscriptButton();
      
      if (!showTranscriptButton) {
        throw new Error('Could not find Show transcript button');
      }
      
      // Click the button to open transcript
      showTranscriptButton.click();
      console.log('Clicked Show transcript button');
      
      // Wait for transcript panel to appear
      await waitForElement('ytd-transcript-renderer, ytd-transcript-search-panel-renderer', 5000);
      
      // Re-query for the transcript panel
      transcriptPanel = document.querySelector('ytd-transcript-renderer');
      const searchPanel = document.querySelector('ytd-transcript-search-panel-renderer');
      
      if (!transcriptPanel && !searchPanel) {
        throw new Error('Transcript panel did not appear after clicking button');
      }
    }
    
    // Extract the transcript content
    console.log('Transcript panel found, extracting content');
    const transcriptItems = document.querySelectorAll('ytd-transcript-segment-renderer');
    
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript segments found');
    }
    
    let fullTranscript = '';
    
    // Process each transcript segment
    transcriptItems.forEach(segment => {
      try {
        // Get text content without timestamps
        const textContent = segment.querySelector('#text')?.textContent?.trim();
        if (textContent) {
          fullTranscript += textContent + ' ';
        }
      } catch (err) {
        console.error('Error processing transcript segment:', err);
      }
    });
    
    // Clean up the transcript
    fullTranscript = fullTranscript.trim().replace(/\s+/g, ' ');
    
    if (!fullTranscript) {
      throw new Error('Failed to extract transcript text');
    }
    
    console.log('Successfully extracted transcript:', fullTranscript.substring(0, 100) + '...');
    return fullTranscript;
  } catch (error) {
    console.error('Transcript extraction error:', error);
    throw error;
  }
}

// Helper function to find the Show transcript button
function findShowTranscriptButton() {
  // Try multiple selectors to find the button
  const selectors = [
    'button[aria-label="Show transcript"]',
    'yt-formatted-string:contains("Show transcript")',
    'span:contains("Show transcript")',
    'button:contains("Show transcript")',
    'div[id="button"]:has(span:contains("transcript"))',
    'tp-yt-paper-button:contains("Show transcript")'
  ];
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.textContent.includes('transcript')) {
          return element;
        }
      }
    } catch (err) {
      console.log('Error with selector', selector, err);
    }
  }
  
  // Last resort: try to find by traversing the DOM for any element with "transcript" text
  const allButtons = document.querySelectorAll('button, tp-yt-paper-button, yt-formatted-string');
  for (const button of allButtons) {
    if (button.textContent && button.textContent.toLowerCase().includes('transcript')) {
      return button;
    }
  }
  
  return null;
}

// Helper function to wait for an element to appear
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }
    
    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Set timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for element: ${selector}`));
    }, timeout);
  });
}

// Display the summary in the panel
function displaySummary(summary) {
  const summaryContent = document.getElementById('youtube-enhancer-summary-content');
  const loadingIndicator = document.getElementById('youtube-enhancer-loading');
  
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
  
  if (summaryContent) {
    summaryContent.style.display = 'block';
    summaryContent.innerHTML = `
      <h3 style="font-size: 16px; font-weight: 500; margin-bottom: 12px;">Video Summary</h3>
      <div style="font-size: 14px; line-height: 1.5; color: #0f0f0f;">${summary}</div>
    `;
  }
}

// Display error message in the panel
function displaySummaryError(error) {
  const summaryContent = document.getElementById('youtube-enhancer-summary-content');
  const loadingIndicator = document.getElementById('youtube-enhancer-loading');
  
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
  
  if (summaryContent) {
    summaryContent.style.display = 'block';
    summaryContent.innerHTML = `
      <div style="color: #c00; font-size: 14px;">
        <p>Could not generate summary.</p>
        <p style="margin-top: 8px; font-size: 13px; color: #606060;">
          ${error || 'Unknown error occurred. Please try again.'}
        </p>
      </div>
    `;
  }
}

// Show loading message with progress information
function showSummaryLoading(message) {
  const loadingIndicator = document.getElementById('youtube-enhancer-loading');
  const summaryContent = document.getElementById('youtube-enhancer-summary-content');
  
  if (summaryContent) {
    summaryContent.style.display = 'none';
  }
  
  if (loadingIndicator) {
    loadingIndicator.style.display = 'flex';
    // Update the text content
    const spinnerText = loadingIndicator.querySelector('div:not(:first-child)');
    if (spinnerText) {
      spinnerText.textContent = message;
    }
  }
}

// Create and show a toast notification
function showToast(message, count) {
  // Remove any existing toast
  const existingToast = document.getElementById('youtube-enhancer-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'youtube-enhancer-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: rgba(26, 31, 44, 0.8);
    color: white;
    padding: 12px 15px;
    border-radius: 8px;
    z-index: 9999;
    display: flex;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: Roboto, Arial, sans-serif;
    max-width: 400px;
    animation: fadeIn 0.3s, fadeOut 0.3s 4.7s;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.1);
  `;
  
  // Add check icon
  const checkIcon = document.createElement('span');
  checkIcon.innerHTML = '✅';
  checkIcon.style.marginRight = '12px';
  checkIcon.style.fontSize = '18px';
  
  // Add message text
  const messageText = document.createElement('div');
  messageText.innerHTML = `
    <div style="font-weight: 500;">${message}</div>
    <div style="font-size: 12px; color: #ccc; margin-top: 4px;">
      ${count} videos fetched. View them in your dashboard.
    </div>
  `;
  messageText.style.flexGrow = '1';
  
  // Add dashboard button
  const dashboardBtn = document.createElement('button');
  dashboardBtn.textContent = 'Open Dashboard';
  dashboardBtn.style.cssText = `
    color: white;
    margin-left: 15px;
    text-decoration: none;
    font-weight: 500;
    background-color: #9b87f5;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  `;
  dashboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'openDashboard' });
  });
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: #aaa;
    font-size: 20px;
    cursor: pointer;
    padding: 0 0 0 10px;
    margin-left: 5px;
  `;
  closeButton.addEventListener('click', () => {
    toast.remove();
  });
  
  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(20px); }
    }
  `;
  document.head.appendChild(style);
  
  // Assemble and show the toast
  toast.appendChild(checkIcon);
  toast.appendChild(messageText);
  toast.appendChild(dashboardBtn);
  toast.appendChild(closeButton);
  document.body.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.remove();
    }
  }, 5000);
}

// Function to inject the "Fetch My Liked Videos" button and "Export Videos" button
function injectButtons() {
  // Check if we're on a YouTube page
  if (!window.location.hostname.includes('youtube.com')) return;
  
  // Check if we're on the liked videos page
  const isLikedVideosPage = window.location.href.includes('playlist?list=LL');
  
  if (!isLikedVideosPage) return;
  
  console.log('Detected liked videos page, attempting to inject buttons...');
  
  // Remove any existing buttons
  const existingFetchButton = document.getElementById('youtube-enhancer-fetch-button');
  if (existingFetchButton) existingFetchButton.remove();
  
  const existingExportButton = document.getElementById('youtube-enhancer-export-button');
  if (existingExportButton) existingExportButton.remove();
  
  const existingButtonContainer = document.getElementById('youtube-enhancer-button-container');
  if (existingButtonContainer) existingButtonContainer.remove();
  
  // Try multiple placement strategies for better reliability
  const placeButtonsInUI = () => {
    // Strategy 1: Find the Play all and Shuffle buttons container
    const playAllContainer = document.querySelector('ytd-playlist-header-renderer #top-level-buttons-computed');
    
    // Strategy 2: Alternative placement if first strategy fails
    const alternativeContainer = document.querySelector('ytd-playlist-header-renderer #menu-container');
    
    // Strategy 3: Last resort - the entire header section
    const headerContainer = document.querySelector('ytd-playlist-header-renderer');
    
    let targetContainer = playAllContainer || alternativeContainer || headerContainer;
    
    if (!targetContainer) {
      console.log('Could not find a suitable container for button placement');
      return false;
    }
    
    // Create a button container div to hold both buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'youtube-enhancer-button-container';
    buttonContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 16px;
      width: 100%;
      max-width: 300px;
    `;
    
    // Create fetch button with YouTube-aligned styling
    const fetchButton = createYouTubeIntegratedButton('Fetch My Liked Videos', 'youtube-enhancer-fetch-button');
    
    // Create export button with YouTube-aligned styling
    const exportButton = createYouTubeIntegratedButton('Export Videos', 'youtube-enhancer-export-button');
    
    // Add click event for fetch button
    fetchButton.addEventListener('click', () => {
      // Show loading state
      fetchButton.textContent = 'Fetching...';
      fetchButton.disabled = true;
      fetchButton.style.opacity = '0.7';
      
      // Send message to background script
      chrome.runtime.sendMessage({ action: 'fetchLikedVideos' }, (response) => {
        // Reset button
        fetchButton.textContent = 'Fetch My Liked Videos';
        fetchButton.disabled = false;
        fetchButton.style.opacity = '1';
        
        if (!response || !response.success) {
          // Show error temporarily
          fetchButton.textContent = 'Error. Try Again';
          setTimeout(() => {
            fetchButton.textContent = 'Fetch My Liked Videos';
          }, 3000);
        }
      });
    });
    
    // Add click event for export button
    exportButton.addEventListener('click', () => {
      // Show loading state
      exportButton.textContent = 'Exporting...';
      exportButton.disabled = true;
      exportButton.style.opacity = '0.7';
      
      // Send message to background script
      chrome.runtime.sendMessage({ action: 'exportData' }, (response) => {
        // Reset button
        exportButton.textContent = 'Export Videos';
        exportButton.disabled = false;
        exportButton.style.opacity = '1';
        
        if (!response || !response.success) {
          // Show error temporarily
          exportButton.textContent = 'Error. Try Again';
          setTimeout(() => {
            exportButton.textContent = 'Export Videos';
          }, 3000);
        }
      });
    });
    
    // Add buttons to container
    buttonContainer.appendChild(fetchButton);
    buttonContainer.appendChild(exportButton);
    
    // Look for the Play all / Shuffle button row
    const playShuffleRow = document.querySelector('ytd-playlist-header-renderer #top-row-buttons');
    
    if (playShuffleRow) {
      // Insert after the play/shuffle buttons
      playShuffleRow.parentNode.insertBefore(buttonContainer, playShuffleRow.nextSibling);
    } else if (targetContainer === playAllContainer) {
      // If we found the playAllContainer but not the row, insert after the container
      targetContainer.parentNode.insertBefore(buttonContainer, targetContainer.nextSibling);
    } else {
      // Last resort - just append to the header
      targetContainer.appendChild(buttonContainer);
    }
    
    console.log('Buttons injected successfully with YouTube-integrated styling');
    return true;
  };
  
  // Helper function to create buttons that blend well with YouTube's UI
  function createYouTubeIntegratedButton(text, id) {
    const button = document.createElement('button');
    button.id = id;
    button.textContent = text;
    
    // Apply YouTube-like styling that's intuitive and smooth
    button.style.cssText = `
      background-color: #2f7cf7;
      color: white;
      border: none;
      border-radius: 18px;
      padding: 0 16px;
      height: 36px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      width: 100%;
      font-family: 'Roboto', Arial, sans-serif;
    `;
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#1b6fe8';
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#2f7cf7';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
    });
    
    // Add active effect
    button.addEventListener('mousedown', () => {
      button.style.transform = 'translateY(1px)';
      button.style.boxShadow = '0 0 2px rgba(0,0,0,0.1)';
    });
    
    button.addEventListener('mouseup', () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.15)';
    });
    
    return button;
  }
  
  // Try to place the buttons immediately
  if (!placeButtonsInUI()) {
    // If initial placement fails, retry with increasing delays
    const retryTimes = [500, 1000, 2000, 3000, 5000];
    retryTimes.forEach(delay => {
      setTimeout(() => {
        if (!document.getElementById('youtube-enhancer-fetch-button')) {
          placeButtonsInUI();
        }
      }, delay);
    });
  }
}

// Add function to inject the AI summary panel
function injectSummaryPanel() {
  // Check if we're on a YouTube video page
  if (!window.location.hostname.includes('youtube.com') || 
      !window.location.pathname.includes('/watch')) {
    return;
  }
  
  console.log('Detected YouTube video page, attempting to inject summary panel...');
  
  // Remove any existing panel to prevent duplicates
  const existingPanel = document.getElementById('youtube-enhancer-ai-panel');
  if (existingPanel) existingPanel.remove();
  
  // Create the panel container
  const panel = document.createElement('div');
  panel.id = 'youtube-enhancer-ai-panel';
  panel.style.cssText = `
    position: relative;
    background-color: #f9f9f9;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    width: 100%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    font-family: Roboto, Arial, sans-serif;
  `;
  
  // Create the panel header with title and tabs
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  `;
  
  // Create the AI icon
  const aiIcon = document.createElement('div');
  aiIcon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
      <path d="M5 3v4"></path>
      <path d="M19 17v4"></path>
      <path d="M3 5h4"></path>
      <path d="M17 19h4"></path>
    </svg>
  `;
  aiIcon.style.cssText = `
    margin-right: 10px;
    color: #9b87f5;
  `;
  
  // Create the tabs container
  const tabsContainer = document.createElement('div');
  tabsContainer.style.cssText = `
    display: flex;
    background: #efefef;
    border-radius: 20px;
    padding: 4px;
  `;
  
  // Create the "All" tab
  const allTab = document.createElement('div');
  allTab.textContent = 'All';
  allTab.className = 'youtube-enhancer-tab active';
  allTab.style.cssText = `
    padding: 8px 16px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    background: #fff;
    color: #0f0f0f;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  // Create the "Watched" tab
  const watchedTab = document.createElement('div');
  watchedTab.textContent = 'Watched';
  watchedTab.className = 'youtube-enhancer-tab';
  watchedTab.style.cssText = `
    padding: 8px 16px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #606060;
  `;
  
  // Add event listeners to tabs
  allTab.addEventListener('click', () => {
    allTab.style.background = '#fff';
    allTab.style.color = '#0f0f0f';
    allTab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    watchedTab.style.background = 'transparent';
    watchedTab.style.color = '#606060';
    watchedTab.style.boxShadow = 'none';
  });
  
  watchedTab.addEventListener('click', () => {
    watchedTab.style.background = '#fff';
    watchedTab.style.color = '#0f0f0f';
    watchedTab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    allTab.style.background = 'transparent';
    allTab.style.color = '#606060';
    allTab.style.boxShadow = 'none';
  });
  
  // Assemble the tabs
  tabsContainer.appendChild(allTab);
  tabsContainer.appendChild(watchedTab);
  
  // Create the "Summarize Video" button
  const summaryButton = document.createElement('button');
  summaryButton.textContent = 'Summarize Video';
  summaryButton.style.cssText = `
    background-color: #9b87f5;
    color: white;
    border: none;
    border-radius: 18px;
    padding: 0 16px;
    height: 36px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin: 8px 0;
    transition: background-color 0.2s, transform 0.2s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  `;
  
  // Add hover effects to the button
  summaryButton.addEventListener('mouseenter', () => {
    summaryButton.style.backgroundColor = '#8a74e8';
  });
  
  summaryButton.addEventListener('mouseleave', () => {
    summaryButton.style.backgroundColor = '#9b87f5';
  });
  
  // Add click effect
  summaryButton.addEventListener('mousedown', () => {
    summaryButton.style.transform = 'scale(0.98)';
  });
  
  summaryButton.addEventListener('mouseup', () => {
    summaryButton.style.transform = 'scale(1)';
  });
  
  // Add the sparkles icon to the left of the button text
  const sparklesIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sparklesIcon.setAttribute('width', '16');
  sparklesIcon.setAttribute('height', '16');
  sparklesIcon.setAttribute('viewBox', '0 0 24 24');
  sparklesIcon.setAttribute('fill', 'none');
  sparklesIcon.setAttribute('stroke', 'currentColor');
  sparklesIcon.setAttribute('stroke-width', '2');
  sparklesIcon.setAttribute('stroke-linecap', 'round');
  sparklesIcon.setAttribute('stroke-linejoin', 'round');
  sparklesIcon.innerHTML = `
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
  `;
  sparklesIcon.style.marginRight = '8px';
  
  summaryButton.prepend(sparklesIcon);
  
  // Create a container for the summary content
  const summaryContent = document.createElement('div');
  summaryContent.id = 'youtube-enhancer-summary-content';
  summaryContent.style.cssText = `
    padding: 16px;
    border-radius: 8px;
    background-color: #fff;
    margin-top: 16px;
    display: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  // Create a loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'youtube-enhancer-loading';
  loadingIndicator.style.cssText = `
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: #606060;
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top: 3px solid #9b87f5;
    width: 20px;
    height: 20px;
    margin-right: 10px;
    animation: youtube-enhancer-spin 1s linear infinite;
  `;
  
  const spinnerText = document.createElement('div');
  spinnerText.textContent = 'Generating summary...';
  
  // Add animation for the spinner
  const style = document.createElement('style');
  style.textContent = `
    @keyframes youtube-enhancer-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  loadingIndicator.appendChild(spinner);
  loadingIndicator.appendChild(spinnerText);
  
  // Add click event to the summarize button with improved error handling
  summaryButton.addEventListener('click', () => {
    // Get current video ID and title
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) {
      console.error('Could not find video ID');
      displaySummaryError('Could not determine video ID');
      return;
    }
    
    // Get video title and channel if available
    const videoTitle = document.title ? document.title.replace(' - YouTube', '') : 'Unknown Title';
    const channelElement = document.querySelector('#top-row ytd-channel-name yt-formatted-string a');
    const channelTitle = channelElement ? channelElement.textContent : 'Unknown Channel';
    
    // Show loading state
    loadingIndicator.style.display = 'flex';
    summaryContent.style.display = 'none';
    
    // First show initial loading state
    showSummaryLoading('Finding and extracting transcript...');
    
    // Check if we already have a cached summary
    chrome.storage.local.get(['videoSummaries'], (result) => {
      const summaries = result.videoSummaries || {};
      
      // Check if we have a cached summary that's less than 24 hours old
      const cachedData = summaries[videoId];
      if (cachedData && cachedData.summary) {
        const cachedTime = new Date(cachedData.timestamp).getTime();
        const currentTime = new Date().getTime();
        const hoursDiff = (currentTime - cachedTime) / (1000 * 60 * 60);
        
        if (hoursDiff < 24) {
          // Use cached summary
          console.log('Using cached summary');
          showSummaryLoading('Loading cached summary...');
          setTimeout(() => {
            displaySummary(cachedData.summary);
          }, 500); // Small delay for better UX
          return;
        }
      }
      
      // Extract transcript directly from the YouTube page UI
      chrome.runtime.sendMessage({ 
        action: 'extractAndSummarizeFromPage',
        videoId: videoId,
        videoTitle: videoTitle,
        channelTitle: channelTitle
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error in chrome.runtime.sendMessage:', chrome.runtime.lastError);
          displaySummaryError('Communication error with extension. Please try again.');
          return;
        }
        
        if (response && response.success) {
          // Format and display the summary
          displaySummary(response.summary);
        } else {
          // Show error message with more helpful information about what went wrong
          const errorMsg = response?.error || 'Unknown error occurred';
          let userFriendlyError = 'Failed to generate summary.';
          
          if (errorMsg.includes('transcript')) {
            userFriendlyError = 'Could not find the transcript for this video. Make sure the video has captions available.';
          } else if (errorMsg.includes('API')) {
            userFriendlyError = 'There was an issue connecting to the summary service. Please try again later.';
          } else if (errorMsg.includes('timeout')) {
            userFriendlyError = 'The request timed out. This might be due to a very long video or slow connection.';
          }
          
          displaySummaryError(userFriendlyError);
        }
      });
    });
  });
  
  // Assemble the header
  header.appendChild(aiIcon);
  header.appendChild(tabsContainer);
  
  // Assemble the panel
  panel.appendChild(header);
  panel.appendChild(summaryButton);
  panel.appendChild(loadingIndicator);
  panel.appendChild(summaryContent);
  
  // Find the right insertion point in YouTube's UI
  function insertSummaryPanel() {
    // Try different selectors for better compatibility with YouTube's UI changes
    const selectors = [
      '#secondary-inner #related',
      '#secondary-inner',
      '#secondary',
      '#below'
    ];
    
    let targetContainer = null;
    
    for (const selector of selectors) {
      targetContainer = document.querySelector(selector);
      if (targetContainer) break;
    }
    
    if (!targetContainer) {
      console.log('Could not find a suitable container for panel placement');
      return false;
    }
    
    // Insert at the top of the sidebar
    targetContainer.insertBefore(panel, targetContainer.firstChild);
    return true;
  }
  
  // Try to insert panel, retry if unsuccessful
  if (!insertSummaryPanel()) {
    const retryTimes = [500, 1000, 2000, 3000];
    retryTimes.forEach(delay => {
      setTimeout(() => {
        if (!document.getElementById('youtube-enhancer-ai-panel')) {
          insertSummaryPanel();
        }
      }, delay);
    });
  }
}

// Enhanced URL change detection with mutation observer
function handleUrlChange() {
  let lastUrl = location.href;
  
  // Function to check and inject appropriate UI elements
  const checkAndInject = () => {
    if (window.location.href.includes('playlist?list=LL')) {
      console.log('Liked videos page detected, injecting buttons');
      injectButtons();
      setTimeout(injectButtons, 1000);
      setTimeout(injectButtons, 2500);
    }
    
    if (window.location.href.includes('/watch')) {
      console.log('Video page detected, injecting summary panel');
      injectSummaryPanel();
      setTimeout(injectSummaryPanel, 1000);
    }
  };
  
  // Call once on initial load with delay
  setTimeout(checkAndInject, 1000);
  
  // Create an observer to watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    try {
      // Check if URL has changed
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        console.log('URL changed to: ' + location.href);
        setTimeout(checkAndInject, 1000);
        return;
      }
      
      // Check for specific mutations on liked videos page
      if (window.location.href.includes('playlist?list=LL')) {
        // Check if our buttons are missing
        const fetchButtonExists = document.getElementById('youtube-enhancer-fetch-button');
        const exportButtonExists = document.getElementById('youtube-enhancer-export-button');
        if (!fetchButtonExists || !exportButtonExists) {
          console.log('Buttons missing, reinjecting');
          injectButtons();
        }
      }
      
      // Check for mutations on video page that might require reinserting the panel
      if (window.location.href.includes('/watch')) {
        let shouldReinject = false;
        
        for (const mutation of mutations) {
          // Look for changes to the related videos or sidebar
          if (mutation.target && 
              (mutation.target.id === 'related' || 
              mutation.target.id === 'secondary-inner' ||
              mutation.target.id === 'secondary')) {
            shouldReinject = true;
            break;
          }
          
          // Check if any major layout changes happened
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.id === 'related' || 
                  node.id === 'secondary-inner' ||
                  node.id === 'secondary') {
                shouldReinject = true;
                break;
              }
            }
          }
        }
        
        if (shouldReinject && !document.getElementById('youtube-enhancer-ai-panel')) {
          console.log('Detected sidebar changes - injecting summary panel');
          setTimeout(injectSummaryPanel, 500);
        }
      }
    } catch (err) {
      console.error('Error in mutation observer:', err);
    }
  });
  
  // Watch for both URL changes and content changes with error handling
  try {
    observer.observe(document, { 
      subtree: true, 
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
      characterData: true
    });
  } catch (err) {
    console.error('Error setting up mutation observer:', err);
    // Fallback to interval checking if observer fails
    setInterval(() => {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        checkAndInject();
      }
    }, 2000);
  }
  
  // Watch for YouTube's SPA navigation events
  document.addEventListener('yt-navigate-finish', () => {
    console.log('YouTube navigation event detected');
    setTimeout(checkAndInject, 1000);
  });
}

// Initialize when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleUrlChange);
} else {
  handleUrlChange();
}

// Add event listener for YouTube's spfprocess event (when content refreshes)
document.addEventListener('yt-action', (event) => {
  if (event?.detail?.actionName === 'yt-append-continuation' || 
      event?.detail?.actionName === 'ytd-update-grid-state') {
    if (window.location.href.includes('playlist?list=LL')) {
      console.log('YouTube action detected, checking buttons');
      setTimeout(injectButtons, 1000);
    }
    
    if (window.location.href.includes('/watch')) {
      console.log('YouTube action detected, checking summary panel');
      setTimeout(injectSummaryPanel, 1000);
    }
  }
});

// Re-check whenever visibility changes (user comes back to the tab)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (window.location.href.includes('playlist?list=LL')) {
      console.log('Page became visible, ensuring buttons exist');
      setTimeout(injectButtons, 1000);
    }
    
    if (window.location.href.includes('/watch')) {
      console.log('Page became visible, ensuring summary panel exists');
      setTimeout(injectSummaryPanel, 1000);
    }
  }
});

// Also set up periodic checks as a safety measure
setInterval(() => {
  try {
    if (window.location.href.includes('playlist?list=LL')) {
      const fetchButtonExists = document.getElementById('youtube-enhancer-fetch-button');
      const exportButtonExists = document.getElementById('youtube-enhancer-export-button');
      if (!fetchButtonExists || !exportButtonExists) {
        console.log('Periodic check: buttons missing, reinjecting');
        injectButtons();
      }
    }
    
    if (window.location.href.includes('/watch')) {
      const panelExists = document.getElementById('youtube-enhancer-ai-panel');
      if (!panelExists) {
        console.log('Periodic check: summary panel missing, reinjecting');
        injectSummaryPanel();
      }
    }
  } catch (err) {
    console.error('Error in periodic check:', err);
  }
}, 5000);
