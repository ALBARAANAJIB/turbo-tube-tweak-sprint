
document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');
  const loadingElement = document.getElementById('loading');
  const noVideosElement = document.getElementById('no-videos');
  const searchInput = document.getElementById('search');
  const filterSelect = document.getElementById('filter');
  const selectAllButton = document.getElementById('select-all');
  const deleteSelectedButton = document.getElementById('delete-selected');
  const selectionCountElement = document.getElementById('selection-count');
  const confirmationModal = document.getElementById('confirmation-modal');
  const cancelDeleteButton = document.getElementById('cancel-delete');
  const confirmDeleteButton = document.getElementById('confirm-delete');
  const userEmail = document.getElementById('user-email');
  const userInitial = document.getElementById('user-initial');
  const loadMoreContainer = document.querySelector('.load-more-container');
  
  let videos = [];
  let selectedVideos = new Set();
  let isLoadingMore = false;
  
  // Initialize the dashboard
  init();

  // Event listeners for search and filter
  searchInput.addEventListener('input', renderVideos);
  filterSelect.addEventListener('change', renderVideos);
  
  // Event listeners for bulk actions
  selectAllButton.addEventListener('click', toggleSelectAll);
  deleteSelectedButton.addEventListener('click', showDeleteConfirmation);
  
  // Event listeners for modal
  cancelDeleteButton.addEventListener('click', hideDeleteConfirmation);
  confirmDeleteButton.addEventListener('click', deleteSelectedVideos);
  
  // Initialize the dashboard
  function init() {
    // Load user info
    chrome.storage.local.get('userInfo', (result) => {
      if (result.userInfo) {
        if (result.userInfo.email) {
          userEmail.textContent = result.userInfo.email;
          userInitial.textContent = result.userInfo.email.charAt(0).toUpperCase();
        } else if (result.userInfo.name) {
          userEmail.textContent = result.userInfo.name;
          userInitial.textContent = result.userInfo.name.charAt(0).toUpperCase();
        } else {
          // If no email or name, show "Welcome back" message
          userEmail.textContent = "Welcome back!";
          userInitial.textContent = "👋";
        }
      } else {
        // User info not found
        userEmail.textContent = "Welcome to Dashboard";
        userInitial.textContent = "👋";
      }
    });
    
    // Load videos
    chrome.storage.local.get(['likedVideos', 'nextPageToken', 'totalResults'], (result) => {
      if (result.likedVideos && result.likedVideos.length > 0) {
        videos = result.likedVideos;
        renderVideos();
        
        // Show total count and pagination info if available
        if (result.totalResults) {
          const totalCount = document.createElement('div');
          totalCount.className = 'total-count';
          totalCount.textContent = `Showing ${videos.length} of ${result.totalResults} videos`;
          videoList.parentNode.insertBefore(totalCount, videoList);
          
          // If there are more videos to load, show a "Load more" button
          if (result.nextPageToken) {
            addLoadMoreButton(result.nextPageToken);
          }
        }
      } else {
        loadingElement.style.display = 'none';
        noVideosElement.style.display = 'block';
      }
    });
  }
  
  // Function to add a load more button
  function addLoadMoreButton(pageToken) {
    // Remove existing button if any
    const existingBtn = document.getElementById('load-more');
    if (existingBtn) {
      existingBtn.remove();
    }
    
    // Create new button
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'load-more';
    loadMoreBtn.className = 'secondary-button';
    loadMoreBtn.textContent = 'Load More Videos';
    loadMoreBtn.addEventListener('click', () => loadMoreVideos(pageToken));
    
    // Add to the dedicated container
    loadMoreContainer.innerHTML = '';
    loadMoreContainer.appendChild(loadMoreBtn);
  }
  
  // Function to load more videos using the nextPageToken
  function loadMoreVideos(pageToken) {
    if (isLoadingMore) return;
    
    const loadMoreBtn = document.getElementById('load-more');
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading...';
    }
    
    isLoadingMore = true;
    
    chrome.runtime.sendMessage({ 
      action: 'fetchMoreVideos', 
      pageToken: pageToken 
    }, (response) => {
      isLoadingMore = false;
      
      if (response && response.success) {
        console.log("Successfully loaded more videos:", response);
        
        // Add the new videos to our array
        videos = [...videos, ...response.videos];
        
        // Update the stored videos in local storage
        chrome.storage.local.set({ 
          likedVideos: videos,
          nextPageToken: response.nextPageToken || null
        });
        
        // Re-render with the new videos
        renderVideos();
        
        // Update or remove the load more button
        if (response.nextPageToken) {
          addLoadMoreButton(response.nextPageToken);
        } else if (loadMoreBtn) {
          loadMoreBtn.remove();
        }
        
        // Update the total count display
        const totalCount = document.querySelector('.total-count');
        if (totalCount) {
          totalCount.textContent = `Showing ${videos.length} of ${response.totalResults || videos.length} videos`;
        }
      } else {
        console.error("Failed to load more videos:", response?.error || "Unknown error");
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Try Again';
        }
        // Show error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = response?.error || 'Failed to load more videos. Please try again.';
        errorMessage.style.color = '#ea384c';
        errorMessage.style.marginTop = '16px';
        errorMessage.style.textAlign = 'center';
        
        // Remove existing error message if any
        const existingError = document.querySelector('.error-message');
        if (existingError) {
          existingError.remove();
        }
        
        // Add error message after load more button
        loadMoreContainer.appendChild(errorMessage);
        
        // Make error message disappear after 5 seconds
        setTimeout(() => {
          if (errorMessage.parentNode) {
            errorMessage.remove();
          }
        }, 5000);
      }
    });
  }
  
  // Render videos based on search and filter
  function renderVideos() {
    // Clear current list
    videoList.innerHTML = '';
    
    // Get search term
    const searchTerm = searchInput.value.toLowerCase();
    
    // Get filter value
    const filterValue = filterSelect.value;
    
    // Filter videos
    let filteredVideos = videos.filter(video => 
      video.title.toLowerCase().includes(searchTerm) || 
      video.channelTitle.toLowerCase().includes(searchTerm)
    );
    
    // Apply sorting based on filter
    switch (filterValue) {
      case 'recent':
        // Sort by likedAt date, newest first
        filteredVideos.sort((a, b) => new Date(b.likedAt) - new Date(a.likedAt));
        break;
      case 'oldest':
        // Sort by likedAt date, oldest first
        filteredVideos.sort((a, b) => new Date(a.likedAt) - new Date(b.likedAt));
        break;
      case 'popular':
        // Sort by view count
        filteredVideos.sort((a, b) => parseInt(b.viewCount) - parseInt(a.viewCount));
        break;
      default:
        // Default is already sorted by recently liked
        filteredVideos.sort((a, b) => new Date(b.likedAt) - new Date(a.likedAt));
    }
    
    // Display videos
    filteredVideos.forEach(video => {
      const videoCard = createVideoCard(video);
      videoList.appendChild(videoCard);
    });
    
    // Hide loading element
    loadingElement.style.display = 'none';
    
    // Show no videos message if needed
    if (filteredVideos.length === 0) {
      if (searchTerm || filterValue !== 'all') {
        noVideosElement.textContent = 'No videos match your search or filter.';
      } else {
        noVideosElement.textContent = 'No liked videos found. Try fetching videos first.';
      }
      noVideosElement.style.display = 'block';
    } else {
      noVideosElement.style.display = 'none';
    }
  }
  
  // Create a video card element
  function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.id = video.id;
    
    // Format the date
    const likedDate = new Date(video.likedAt);
    const formattedDate = likedDate.toLocaleDateString();
    
    // Format view count
    const viewCount = parseInt(video.viewCount).toLocaleString();
    
    card.innerHTML = `
      <div class="video-thumbnail">
        <img src="${video.thumbnail}" alt="${video.title}">
        <div class="checkbox-container">
          <input type="checkbox" class="video-checkbox" data-id="${video.id}">
        </div>
      </div>
      <div class="video-details">
        <h3 class="video-title">
          <a href="https://www.youtube.com/watch?v=${video.id}" target="_blank">${video.title}</a>
        </h3>
        <div class="video-channel">${video.channelTitle}</div>
        <div class="video-meta">
          <span>${viewCount} views</span>
          <span>Liked on ${formattedDate}</span>
        </div>
        <div class="video-actions">
          <button class="delete-button" data-id="${video.id}">
            <span class="delete-icon">×</span> Remove
          </button>
        </div>
      </div>
    `;
    
    // Add event listener for delete button
    const deleteButton = card.querySelector('.delete-button');
    deleteButton.addEventListener('click', () => deleteVideo(video.id));
    
    // Add event listener for checkbox
    const checkbox = card.querySelector('.video-checkbox');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedVideos.add(video.id);
      } else {
        selectedVideos.delete(video.id);
      }
      updateSelectionCount();
    });
    
    // Check if this video is already selected
    if (selectedVideos.has(video.id)) {
      checkbox.checked = true;
    }
    
    return card;
  }
  
  // Delete a single video
  function deleteVideo(videoId) {
    chrome.runtime.sendMessage({ action: 'deleteVideo', videoId }, (response) => {
      if (response && response.success) {
        // Remove from local array
        videos = videos.filter(video => video.id !== videoId);
        
        // Remove from selected videos if it was selected
        selectedVideos.delete(videoId);
        
        // Update selection count
        updateSelectionCount();
        
        // Re-render videos
        renderVideos();
      } else {
        alert('Failed to delete video. Please try again.');
      }
    });
  }
  
  // Toggle select all videos
  function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    
    // Check if all are selected
    const allSelected = checkboxes.length === selectedVideos.size;
    
    if (allSelected) {
      // Deselect all
      selectedVideos.clear();
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    } else {
      // Select all
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedVideos.add(checkbox.getAttribute('data-id'));
      });
    }
    
    // Update selection count
    updateSelectionCount();
  }
  
  // Update selection count
  function updateSelectionCount() {
    const count = selectedVideos.size;
    selectionCountElement.textContent = `${count} video${count !== 1 ? 's' : ''} selected`;
    
    // Enable or disable delete button
    deleteSelectedButton.disabled = count === 0;
  }
  
  // Show delete confirmation modal
  function showDeleteConfirmation() {
    if (selectedVideos.size > 0) {
      confirmationModal.style.display = 'flex';
    }
  }
  
  // Hide delete confirmation modal
  function hideDeleteConfirmation() {
    confirmationModal.style.display = 'none';
  }
  
  // Delete selected videos
  function deleteSelectedVideos() {
    const totalToDelete = selectedVideos.size;
    let deleted = 0;
    let failed = 0;
    
    // Convert Set to Array for iteration
    const videoIds = Array.from(selectedVideos);
    
    // Hide modal
    hideDeleteConfirmation();
    
    // Show loading state
    loadingElement.textContent = 'Deleting selected videos...';
    loadingElement.style.display = 'block';
    
    // Process each video
    videoIds.forEach(videoId => {
      chrome.runtime.sendMessage({ action: 'deleteVideo', videoId }, (response) => {
        if (response && response.success) {
          deleted++;
        } else {
          failed++;
        }
        
        // Check if all operations completed
        if (deleted + failed === totalToDelete) {
          // Remove from local array
          videos = videos.filter(video => !selectedVideos.has(video.id));
          
          // Clear selected videos
          selectedVideos.clear();
          
          // Update selection count
          updateSelectionCount();
          
          // Re-render videos
          loadingElement.style.display = 'none';
          renderVideos();
          
          // Show result
          if (failed > 0) {
            alert(`Successfully removed ${deleted} videos. Failed to remove ${failed} videos.`);
          }
        }
      });
    });
  }
});
