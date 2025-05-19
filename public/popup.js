
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
  chrome.storage.local.get(['userToken', 'userInfo', 'aiApiKey'], (result) => {
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
      
      // Check if API key is set for AI features
      if (!result.aiApiKey) {
        const aiCard = document.getElementById('ai-card');
        if (aiCard) {
          // Add a warning indicator
          const warningIcon = document.createElement('div');
          warningIcon.innerHTML = '⚠️';
          warningIcon.style.position = 'absolute';
          warningIcon.style.top = '8px';
          warningIcon.style.right = '8px';
          warningIcon.style.fontSize = '16px';
          warningIcon.title = 'API key not set';
          aiCard.appendChild(warningIcon);
          
          // Update button text
          if (aiSummaryButton) {
            aiSummaryButton.textContent = 'Set API Key';
          }
        }
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

  // AI Summary
  aiSummaryButton && aiSummaryButton.addEventListener('click', () => {
    chrome.storage.local.get(['aiApiKey'], (result) => {
      if (!result.aiApiKey) {
        // Show API key input dialog
        showApiKeyDialog();
      } else {
        // Open dashboard with AI tab active
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('dashboard.html?tab=ai') 
        });
      }
    });
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
  
  // Function to show API key input dialog
  function showApiKeyDialog() {
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;
    
    // Create dialog content
    const dialogContent = document.createElement('div');
    dialogContent.style.cssText = `
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      width: 90%;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    
    // Add dialog title
    const title = document.createElement('h3');
    title.textContent = 'Set Gemini API Key';
    title.style.cssText = `
      font-size: 18px;
      margin: 0 0 16px 0;
      color: #0f0f0f;
    `;
    
    // Add dialog description
    const description = document.createElement('p');
    description.innerHTML = `
      To use the AI summary feature, please enter your Google Gemini API key. 
      You can get one from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.
    `;
    description.style.cssText = `
      font-size: 14px;
      margin: 0 0 16px 0;
      color: #606060;
    `;
    
    // Add API key input
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter your Gemini API key';
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      margin-bottom: 16px;
    `;
    
    // Add buttons container
    const buttons = document.createElement('div');
    buttons.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;
    
    // Add cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      background-color: #f1f1f1;
      color: #0f0f0f;
    `;
    
    // Add save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      background-color: #9b87f5;
      color: white;
    `;
    
    // Add test button
    const testButton = document.createElement('button');
    testButton.textContent = 'Test Key';
    testButton.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      background-color: #4CAF50;
      color: white;
      margin-right: auto;
    `;
    
    // Add status message element
    const statusMessage = document.createElement('div');
    statusMessage.style.cssText = `
      font-size: 14px;
      margin: 16px 0 0 0;
      display: none;
    `;
    
    // Add click event to cancel button
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    // Add click event to save button
    saveButton.addEventListener('click', () => {
      const apiKey = input.value.trim();
      if (!apiKey) {
        statusMessage.textContent = 'Please enter an API key';
        statusMessage.style.color = '#ff3333';
        statusMessage.style.display = 'block';
        return;
      }
      
      chrome.runtime.sendMessage({ 
        action: 'saveApiKey',
        apiKey: apiKey
      }, (response) => {
        if (response && response.success) {
          document.body.removeChild(dialog);
          location.reload(); // Reload popup to update UI
        } else {
          statusMessage.textContent = 'Failed to save API key';
          statusMessage.style.color = '#ff3333';
          statusMessage.style.display = 'block';
        }
      });
    });
    
    // Add click event to test button
    testButton.addEventListener('click', () => {
      const apiKey = input.value.trim();
      if (!apiKey) {
        statusMessage.textContent = 'Please enter an API key to test';
        statusMessage.style.color = '#ff3333';
        statusMessage.style.display = 'block';
        return;
      }
      
      // Show testing status
      statusMessage.textContent = 'Testing API key...';
      statusMessage.style.color = '#606060';
      statusMessage.style.display = 'block';
      testButton.disabled = true;
      
      // Test API key with a simple request
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [{ parts: [{ text: "Hello, can you provide a short test response?" }] }]
      };
      
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`API test failed with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        statusMessage.textContent = 'API key is valid!';
        statusMessage.style.color = '#4CAF50';
      })
      .catch(error => {
        console.error("API test error:", error);
        statusMessage.textContent = 'Invalid API key. Please check and try again.';
        statusMessage.style.color = '#ff3333';
      })
      .finally(() => {
        testButton.disabled = false;
      });
    });
    
    // Assemble dialog
    buttons.appendChild(testButton);
    buttons.appendChild(cancelButton);
    buttons.appendChild(saveButton);
    
    dialogContent.appendChild(title);
    dialogContent.appendChild(description);
    dialogContent.appendChild(input);
    dialogContent.appendChild(buttons);
    dialogContent.appendChild(statusMessage);
    
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);
    
    // Focus input field
    input.focus();
  }
});
