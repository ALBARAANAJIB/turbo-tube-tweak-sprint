
// OAuth 2.0 constants
const CLIENT_ID = '304162096302-c470kd77du16s0lrlumobc6s8u6uleng.apps.googleusercontent.com';
const REDIRECT_URL = chrome.identity.getRedirectURL();
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

// YouTube API endpoints
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const LIKED_VIDEOS_ENDPOINT = `${API_BASE}/videos`;
const USER_INFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v1/userinfo';
const PLAYLIST_ITEMS_ENDPOINT = `${API_BASE}/playlistItems`;
const CHANNELS_ENDPOINT = `${API_BASE}/channels`;

// Handle messages from popup.js and content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
  // Handle authentication request
  if (request.action === 'authenticate') {
    (async () => {
      try {
        const token = await authenticate();
        const userInfo = await getUserInfo(token);
        await chrome.storage.local.set({ userToken: token, userInfo: userInfo });
        sendResponse({ success: true, userInfo: userInfo });
      } catch (error) {
        console.error('Authentication error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }
  
  // Check authentication status
  if (request.action === 'checkAuth') {
    chrome.storage.local.get('userToken', (result) => {
      if (result.userToken) {
        console.log('User is authenticated');
        sendResponse({ authenticated: true });
      } else {
        console.log('User is not authenticated');
        sendResponse({ authenticated: false });
      }
    });
    return true; // Keep the message channel open for the async response
  }

  // Fetch the user's liked videos
  if (request.action === 'fetchLikedVideos' || request.action === 'getLikedVideos') {
    (async () => {
      try {
        const result = await chrome.storage.local.get('userToken');
        if (!result.userToken) {
          sendResponse({ success: false, error: 'Not authenticated' });
          return;
        }

        console.log('Fetching liked videos...');
        // First get the user's "liked videos" playlist ID
        const channelResponse = await fetch(`${CHANNELS_ENDPOINT}?part=contentDetails&mine=true`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!channelResponse.ok) throw new Error('Failed to fetch channel data');
        
        const channelData = await channelResponse.json();
        const likedPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.likes;
        
        // Fetch the videos from the liked playlist
        const playlistResponse = await fetch(`${PLAYLIST_ITEMS_ENDPOINT}?part=snippet,contentDetails&maxResults=50&playlistId=${likedPlaylistId}`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!playlistResponse.ok) throw new Error('Failed to fetch playlist items');
        
        const playlistData = await playlistResponse.json();
        console.log('Playlist items fetched:', playlistData);
        
        // Get video details for the playlist items
        const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
        
        const videosResponse = await fetch(`${LIKED_VIDEOS_ENDPOINT}?part=snippet,statistics&id=${videoIds}`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!videosResponse.ok) throw new Error('Failed to fetch video details');
        
        const videosData = await videosResponse.json();
        
        // Map playlist items to our video objects with correct liked dates
        const videos = playlistData.items.map(item => {
          const videoId = item.contentDetails.videoId;
          const videoDetails = videosData.items.find(v => v.id === videoId);
          
          if (!videoDetails) return null;
          
          return {
            id: videoId,
            title: videoDetails.snippet.title,
            channelTitle: videoDetails.snippet.channelTitle,
            channelId: videoDetails.snippet.channelId,
            publishedAt: videoDetails.snippet.publishedAt,
            // Use the date from the playlist item for when it was liked
            likedAt: item.snippet.publishedAt,
            thumbnail: videoDetails.snippet.thumbnails.medium?.url || '',
            viewCount: videoDetails.statistics?.viewCount || '0',
            likeCount: videoDetails.statistics?.likeCount || '0',
            url: `https://www.youtube.com/watch?v=${videoId}`
          };
        }).filter(Boolean); // Remove any nulls
        
        // Store the videos locally
        await chrome.storage.local.set({ 
          likedVideos: videos,
          nextPageToken: playlistData.nextPageToken || null,
          totalResults: playlistData.pageInfo?.totalResults || videos.length
        });
        
        console.log('Videos stored in local storage with correct liked dates');
        
        // Display a toast notification on YouTube pages
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
          if (tabs.length > 0) {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { 
                action: 'showToast', 
                message: 'Videos fetched successfully!',
                count: videos.length
              }).catch(err => console.log('Tab may not be ready yet:', err));
            });
          }
        });
        
        sendResponse({ success: true, count: videos.length });
      } catch (error) {
        console.error('Error fetching liked videos:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // Handle additional videos fetch with pagination
  if (request.action === 'fetchMoreVideos') {
    (async () => {
      try {
        const result = await chrome.storage.local.get(['userToken', 'likedVideos']);
        if (!result.userToken) {
          sendResponse({ success: false, error: 'Not authenticated' });
          return;
        }

        console.log('Fetching more liked videos with page token:', request.pageToken);
        
        // Get the user's "liked videos" playlist ID
        const channelResponse = await fetch(`${CHANNELS_ENDPOINT}?part=contentDetails&mine=true`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!channelResponse.ok) throw new Error('Failed to fetch channel data');
        
        const channelData = await channelResponse.json();
        const likedPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.likes;
        
        // Fetch the next page of videos using the pageToken
        const playlistResponse = await fetch(
          `${PLAYLIST_ITEMS_ENDPOINT}?part=snippet,contentDetails&maxResults=50&playlistId=${likedPlaylistId}&pageToken=${request.pageToken}`, 
          {
            headers: { Authorization: `Bearer ${result.userToken}` }
          }
        );
        
        if (!playlistResponse.ok) throw new Error('Failed to fetch playlist items');
        
        const playlistData = await playlistResponse.json();
        
        // Get video details for the playlist items
        const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
        
        const videosResponse = await fetch(`${LIKED_VIDEOS_ENDPOINT}?part=snippet,statistics&id=${videoIds}`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!videosResponse.ok) throw new Error('Failed to fetch video details');
        
        const videosData = await videosResponse.json();
        
        // Map playlist items to our video objects with correct liked dates
        const newVideos = playlistData.items.map(item => {
          const videoId = item.contentDetails.videoId;
          const videoDetails = videosData.items.find(v => v.id === videoId);
          
          if (!videoDetails) return null;
          
          return {
            id: videoId,
            title: videoDetails.snippet.title,
            channelTitle: videoDetails.snippet.channelTitle,
            channelId: videoDetails.snippet.channelId,
            publishedAt: videoDetails.snippet.publishedAt,
            likedAt: item.snippet.publishedAt,
            thumbnail: videoDetails.snippet.thumbnails.medium?.url || '',
            viewCount: videoDetails.statistics?.viewCount || '0',
            likeCount: videoDetails.statistics?.likeCount || '0'
          };
        }).filter(Boolean);
        
        console.log(`Fetched ${newVideos.length} additional videos`);
        
        // Send response before updating storage to prevent timeout issues
        sendResponse({ 
          success: true, 
          videos: newVideos,
          nextPageToken: playlistData.nextPageToken || null,
          totalResults: playlistData.pageInfo?.totalResults || 0
        });
        
      } catch (error) {
        console.error('Error fetching more videos:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // Open the dashboard
  if (request.action === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    return false;
  }

  // Handle data export
  if (request.action === 'exportData') {
    (async () => {
      try {
        const result = await chrome.storage.local.get(['userToken', 'likedVideos', 'totalResults']);
        if (!result.userToken) {
          sendResponse({ success: false, error: 'Not authenticated' });
          return;
        }
        
        // If we have videos in storage, use them as a starting point
        let allVideos = result.likedVideos || [];
        const totalLiked = result.totalResults || 0;
        
        console.log(`We have ${allVideos.length} of ${totalLiked} videos. Fetching more for export...`);
        
        // Get the user's "liked videos" playlist ID
        const channelResponse = await fetch(`${CHANNELS_ENDPOINT}?part=contentDetails&mine=true`, {
          headers: { Authorization: `Bearer ${result.userToken}` }
        });
        
        if (!channelResponse.ok) throw new Error('Failed to fetch channel data');
        
        const channelData = await channelResponse.json();
        const likedPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.likes;
        
        // Fetch all pages of videos
        let nextPageToken = null;
        let pageCount = 1;
        
        do {
          console.log(`Fetching page ${pageCount} of videos for export...`);
          
          // Construct the endpoint URL with pageToken if we have one
          let endpoint = `${PLAYLIST_ITEMS_ENDPOINT}?part=snippet,contentDetails&maxResults=50&playlistId=${likedPlaylistId}`;
          if (nextPageToken) {
            endpoint += `&pageToken=${nextPageToken}`;
          }
          
          const playlistResponse = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${result.userToken}` }
          });
          
          if (!playlistResponse.ok) throw new Error('Failed to fetch playlist items');
          
          const playlistData = await playlistResponse.json();
          
          // Get video details for the playlist items
          const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
          
          const videosResponse = await fetch(`${LIKED_VIDEOS_ENDPOINT}?part=snippet,statistics,contentDetails&id=${videoIds}`, {
            headers: { Authorization: `Bearer ${result.userToken}` }
          });
          
          if (!videosResponse.ok) throw new Error('Failed to fetch video details');
          
          const videosData = await videosResponse.json();
          
          // Map playlist items to our video objects
          const pageVideos = playlistData.items.map(item => {
            const videoId = item.contentDetails.videoId;
            const videoDetails = videosData.items.find(v => v.id === videoId);
            
            if (!videoDetails) return null;
            
            return {
              id: videoId,
              title: videoDetails.snippet.title,
              description: videoDetails.snippet.description,
              channelTitle: videoDetails.snippet.channelTitle,
              channelId: videoDetails.snippet.channelId,
              publishedAt: videoDetails.snippet.publishedAt,
              likedAt: item.snippet.publishedAt,
              thumbnail: videoDetails.snippet.thumbnails.medium?.url || '',
              viewCount: videoDetails.statistics?.viewCount || '0',
              likeCount: videoDetails.statistics?.likeCount || '0',
              duration: videoDetails.contentDetails?.duration || '',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              channelUrl: `https://www.youtube.com/channel/${videoDetails.snippet.channelId}`
            };
          }).filter(Boolean);
          
          // Add only new videos to our collection to avoid duplicates
          const existingIds = new Set(allVideos.map(v => v.id));
          const newVideos = pageVideos.filter(v => !existingIds.has(v.id));
          allVideos = [...allVideos, ...newVideos];
          
          // Check if there are more pages
          nextPageToken = playlistData.nextPageToken;
          pageCount++;
          
        } while (nextPageToken);
        
        console.log(`Exporting ${allVideos.length} videos in total`);
        
        // Create exportable data with more detailed information
        const exportData = JSON.stringify(allVideos, null, 2);
        
        // Use chrome.downloads API with a data URL
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `youtube-liked-videos-${timestamp}.json`;
        
        // Convert to data URL for download
        const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(exportData)));
        
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("Download failed:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log("Download started with ID:", downloadId);
            sendResponse({ success: true, count: allVideos.length });
          }
        });
        
      } catch (error) {
        console.error('Error exporting data:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // Handle video removal from liked list
  if (request.action === 'deleteVideo') {
    (async () => {
      try {
        const result = await chrome.storage.local.get(['userToken', 'likedVideos']);
        if (!result.userToken) {
          sendResponse({ success: false, error: 'Not authenticated' });
          return;
        }

        // Call YouTube API to remove video from liked list
        const response = await fetch(`${API_BASE}/videos/rate`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${result.userToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `id=${request.videoId}&rating=none`
        });
        
        if (!response.ok) throw new Error('Failed to delete video from liked list');
        
        // Update local storage
        if (result.likedVideos) {
          const updatedVideos = result.likedVideos.filter(video => video.id !== request.videoId);
          await chrome.storage.local.set({ likedVideos: updatedVideos });
        }
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error deleting video:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // Handle video summarization
  if (request.action === 'summarizeVideo') {
    (async () => {
      try {
        // Get API key for the AI service
        const apiKey = await getAiApiKey();
        
        if (!apiKey) {
          // No API key found, prompt the user to enter one
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'promptForApiKey',
                service: 'OpenAI'
              });
            }
          });
          
          sendResponse({ 
            success: false, 
            error: 'No API key found. Please enter your AI service API key.' 
          });
          return;
        }
        
        // Get video transcript if available
        const transcript = await getVideoTranscript(request.videoId);
        
        // Send video info to the AI service for summarization
        const summary = await generateVideoSummary(
          transcript || request.videoTitle,
          request.videoTitle,
          request.channelTitle,
          apiKey
        );
        
        // Store the summary in local storage
        await storeVideoSummary(request.videoId, summary);
        
        // Send the summary back to the content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'displaySummary',
              summary: summary
            });
          }
        });
        
        sendResponse({ success: true, summary: summary });
      } catch (error) {
        console.error('Error summarizing video:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }
  
  // Handle saving the AI API key
  if (request.action === 'saveApiKey') {
    (async () => {
      try {
        await chrome.storage.local.set({ aiApiKey: request.apiKey });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error saving API key:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // If no handlers above matched, return false to indicate we won't call sendResponse
  return false;
});

// Function to authenticate with YouTube
async function authenticate() {
  return new Promise((resolve, reject) => {
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&scope=${encodeURIComponent(SCOPES.join(' '))}`;
    
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!redirectUrl) {
          reject(new Error('Authentication failed'));
          return;
        }
        
        const url = new URL(redirectUrl);
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        
        if (!token) {
          reject(new Error('No access token found in the response'));
          return;
        }
        
        resolve(token);
      }
    );
  });
}

// Get user info with the access token
async function getUserInfo(token) {
  try {
    const response = await fetch(USER_INFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user information');
    }
    
    const userInfo = await response.json();
    return userInfo;
  } catch (error) {
    console.error('Error getting user info:', error);
    throw error;
  }
}

// Get saved AI API key
async function getAiApiKey() {
  const result = await chrome.storage.local.get('aiApiKey');
  return result.aiApiKey || null;
}

// Get video transcript (if available)
async function getVideoTranscript(videoId) {
  // This is a placeholder function. In a real implementation,
  // you would use YouTube's captions API or another service to get the transcript.
  // This requires additional permissions and potentially a server component.
  return null;
}

// Generate video summary using an AI service
async function generateVideoSummary(text, title, channelTitle, apiKey) {
  try {
    // For now, we'll use OpenAI's API as an example
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes YouTube videos. Provide a concise summary with key points and takeaways."
          },
          {
            role: "user",
            content: `Please summarize this YouTube video titled "${title}" by ${channelTitle}. ${text ? 'Here is the transcript or content to summarize: ' + text : 'No transcript available, summarize based on the title.'}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`AI API Error: ${error.error?.message || 'Unknown error'}`);
    }
    
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Store video summary in local storage
async function storeVideoSummary(videoId, summary) {
  try {
    const result = await chrome.storage.local.get('videoSummaries');
    const summaries = result.videoSummaries || {};
    
    summaries[videoId] = {
      summary,
      timestamp: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ videoSummaries: summaries });
  } catch (error) {
    console.error('Error storing summary:', error);
    throw error;
  }
}

// Open dashboard when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});
