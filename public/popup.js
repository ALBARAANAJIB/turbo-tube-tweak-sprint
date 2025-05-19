
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
  loginButton.addEventListener('click', () => {
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
        alert('Authentication failed. Please try again.');
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in with YouTube';
      }
    });
  });

  // Fetch liked videos
  fetchVideosButton.addEventListener('click', () => {
    fetchVideosButton.disabled = true;
    const originalText = fetchVideosButton.textContent;
    fetchVideosButton.textContent = 'Fetching...';
    
    chrome.runtime.sendMessage({ action: 'fetchLikedVideos' }, (response) => {
      fetchVideosButton.disabled = false;
      fetchVideosButton.textContent = originalText;
      
      if (response && response.success) {
        // Show a success message in the popup
        const successMessage = document.createElement('div');
        successMessage.classList.add('success-message');
        successMessage.textContent = `${response.count} videos fetched!`;
        
        // Insert after the fetch button
        fetchVideosButton.parentNode.insertBefore(successMessage, fetchVideosButton.nextSibling);
        
        // Remove after 3 seconds
        setTimeout(() => {
          successMessage.remove();
        }, 3000);
      } else {
        alert('Failed to fetch videos. Please try again.');
      }
    });
  });

  // Open dashboard
  openDashboardButton.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  // Export data
  exportDataButton.addEventListener('click', () => {
    exportDataButton.disabled = true;
    const originalText = exportDataButton.textContent;
    exportDataButton.textContent = 'Exporting...';
    
    chrome.runtime.sendMessage({ action: 'exportData' }, (response) => {
      // Clear timeout to prevent race conditions
      setTimeout(() => {
        exportDataButton.disabled = false;
        exportDataButton.textContent = originalText;
        
        if (response && response.success) {
          // Show a success message in the popup
          const successMessage = document.createElement('div');
          successMessage.classList.add('success-message');
          successMessage.textContent = `${response.count} videos exported!`;
          
          // Insert after the export button
          exportDataButton.parentNode.insertBefore(successMessage, exportDataButton.nextSibling);
          
          // Remove after 3 seconds
          setTimeout(() => {
            successMessage.remove();
          }, 3000);
        } else {
          // Show error message
          const errorMessage = document.createElement('div');
          errorMessage.classList.add('error-message');
          errorMessage.style.color = '#ff3333';
          errorMessage.textContent = 'Export failed. Please try again.';
          
          // Insert after the export button
          exportDataButton.parentNode.insertBefore(errorMessage, exportDataButton.nextSibling);
          
          // Remove after 3 seconds
          setTimeout(() => {
            errorMessage.remove();
          }, 3000);
          
          console.error('Export failed:', response?.error || 'Unknown error');
        }
      }, 1000);
    });
  });

  // AI Summary
  aiSummaryButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'aiSummary' });
  });

  // Sign out
  signOutButton.addEventListener('click', () => {
    chrome.storage.local.remove(['userToken', 'userInfo', 'likedVideos'], () => {
      loginContainer.style.display = 'block';
      featuresContainer.style.display = 'none';
    });
  });
});
