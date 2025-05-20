
document.addEventListener('DOMContentLoaded', () => {
  const loginButton = document.getElementById('login-button');
  const loginContainer = document.getElementById('login-container');
  const featuresContainer = document.getElementById('features-container');
  const fetchVideosButton = document.getElementById('fetch-videos');
  const openDashboardButton = document.getElementById('open-dashboard');
  const exportDataButton = document.getElementById('export-data');
  const aiSummaryButton = document.getElementById('ai-summary');
  const signOutButton = document.getElementById('sign-out');
  const userEmail = document.getElementById('user-email');
  const userInitial = document.getElementById('user-initial');

  // Check if user is already authenticated
  chrome.storage.local.get(['userToken', 'userInfo'], (result) => {
    if (result.userToken && result.userInfo) {
      // User is authenticated, show features
      loginContainer.style.display = 'none';
      featuresContainer.style.display = 'block';
      
      // Display user info
      if (result.userInfo.email) {
        userEmail.textContent = result.userInfo.email;
        userInitial.textContent = result.userInfo.email.charAt(0).toUpperCase();
      } else if (result.userInfo.name) {
        userEmail.textContent = result.userInfo.name;
        userInitial.textContent = result.userInfo.name.charAt(0).toUpperCase();
      }
    } else {
      // User is not authenticated, show login
      loginContainer.style.display = 'block';
      featuresContainer.style.display = 'none';
    }
  });

  // Login with YouTube
  loginButton && loginButton.addEventListener('click', () => {
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    
    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
      if (response && response.success) {
        loginContainer.style.display = 'none';
        featuresContainer.style.display = 'block';
        
        // Display user info
        if (response.userInfo && response.userInfo.email) {
          userEmail.textContent = response.userInfo.email;
          userInitial.textContent = response.userInfo.email.charAt(0).toUpperCase();
        } else if (response.userInfo && response.userInfo.name) {
          userEmail.textContent = response.userInfo.name;
          userInitial.textContent = response.userInfo.name.charAt(0).toUpperCase();
        }
      } else {
        showErrorMessage('Authentication failed. Please try again.');
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in with YouTube';
      }
    });
  });

  // Fetch liked videos
  fetchVideosButton && fetchVideosButton.addEventListener('click', () => {
    fetchVideosButton.disabled = true;
    const originalText = fetchVideosButton.textContent;
    fetchVideosButton.textContent = 'Fetching...';
    
    chrome.runtime.sendMessage({ action: 'fetchLikedVideos' }, (response) => {
      fetchVideosButton.disabled = false;
      fetchVideosButton.textContent = originalText;
      
      if (response && response.success) {
        // Show a success message in the popup
        showSuccessMessage(fetchVideosButton, `${response.count} videos fetched!`);
      } else {
        showErrorMessage('Failed to fetch videos. Please try again.');
      }
    });
  });

  // Open dashboard
  openDashboardButton && openDashboardButton.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  // Export data
  exportDataButton && exportDataButton.addEventListener('click', () => {
    exportDataButton.disabled = true;
    const originalText = exportDataButton.textContent;
    exportDataButton.textContent = 'Exporting...';
    
    chrome.runtime.sendMessage({ action: 'exportData' }, (response) => {
      // Clear timeout to prevent race conditions
      setTimeout(() => {
        exportDataButton.disabled = false;
        exportDataButton.textContent = originalText;
        
        if (response && response.success) {
          showSuccessMessage(exportDataButton, `${response.count} videos exported!`);
        } else {
          showErrorMessage('Export failed. Please try again.');
          console.error('Export failed:', response?.error || 'Unknown error');
        }
      }, 1000);
    });
  });

  // AI Summary - Direct access to YouTube videos' summaries
  aiSummaryButton && aiSummaryButton.addEventListener('click', () => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
          // We're on a YouTube video page, so we can directly trigger the summary
          chrome.tabs.sendMessage(currentTab.id, { action: 'triggerSummary' })
            .catch(err => {
              console.error('Error sending message to tab:', err);
              // If message sending fails, open dashboard instead
              chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tab=ai') });
            });
          window.close(); // Close the popup
        } else {
          // Not on a YouTube video, open dashboard with AI tab
          chrome.tabs.create({ 
            url: chrome.runtime.getURL('dashboard.html?tab=ai') 
          });
        }
      });
    } catch (error) {
      console.error('Error in AI summary button click:', error);
      // Fallback to opening dashboard
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tab=ai') });
    }
  });

  // Sign out
  signOutButton && signOutButton.addEventListener('click', () => {
    chrome.storage.local.remove(['userToken', 'userInfo', 'likedVideos'], () => {
      loginContainer.style.display = 'block';
      featuresContainer.style.display = 'none';
    });
  });
  
  // Helper function to show success message
  function showSuccessMessage(element, message) {
    const successMessage = document.createElement('div');
    successMessage.classList.add('success-message');
    successMessage.textContent = message;
    
    // Insert after the element
    element.parentNode.insertBefore(successMessage, element.nextSibling);
    
    // Remove after 3 seconds
    setTimeout(() => {
      successMessage.remove();
    }, 3000);
  }
  
  // Helper function to show error message
  function showErrorMessage(message) {
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('error-message');
    errorMessage.style.color = '#ff3333';
    errorMessage.style.padding = '8px';
    errorMessage.style.margin = '8px 0';
    errorMessage.style.borderRadius = '4px';
    errorMessage.style.backgroundColor = 'rgba(255,0,0,0.1)';
    errorMessage.textContent = message;
    
    // Insert at the top of the container that's currently visible
    const container = loginContainer.style.display === 'none' ? featuresContainer : loginContainer;
    container.insertBefore(errorMessage, container.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorMessage.remove();
    }, 5000);
  }
});
