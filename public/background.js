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
const CAPTIONS_ENDPOINT = `${API_BASE}/captions`;

// Fixed AI API key and endpoints
const FIXED_AI_API_KEY = 'AIzaSyA6aTa9nXWlOlVoza5gLe5ZWc8yrVlJWn8';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

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

  // NEW: Extract transcript from page and summarize video
  if (request.action === 'extractAndSummarizeFromPage') {
    console.log('Starting transcript extraction and summarization for video:', request.videoId);
    
    (async () => {
      try {
        // First, find the tab with the video
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          sendResponse({ success: false, error: 'Cannot find active tab' });
          return;
        }

        const activeTab = tabs[0];
        
        // Send message to the tab to extract transcript
        chrome.tabs.sendMessage(activeTab.id, { 
          action: 'showSummaryLoading', 
          message: 'Extracting transcript from video...'
        });
        
        // Request transcript extraction from the content script
        chrome.tabs.sendMessage(activeTab.id, { action: 'extractTranscript' }, async (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error requesting transcript extraction:', chrome.runtime.lastError);
            chrome.tabs.sendMessage(activeTab.id, { 
              action: 'summaryError', 
              error: 'Could not extract transcript from page. Make sure captions are available for this video.'
            });
            sendResponse({ success: false, error: 'Transcript extraction failed: ' + chrome.runtime.lastError.message });
            return;
          }
          
          if (!response || !response.success || !response.transcript) {
            const errorMsg = response?.error || 'Unknown error extracting transcript';
            console.error('Transcript extraction failed:', errorMsg);
            
            chrome.tabs.sendMessage(activeTab.id, { 
              action: 'summaryError', 
              error: 'Transcript not found. This video may not have captions available.'
            });
            
            sendResponse({ success: false, error: 'Transcript extraction failed: ' + errorMsg });
            return;
          }
          
          // Update loading message
          chrome.tabs.sendMessage(activeTab.id, { 
            action: 'showSummaryLoading', 
            message: 'Generating summary...'
          });
          
          const transcript = response.transcript;
          console.log('Successfully extracted transcript, length:', transcript.length);
          
          // Now proceed with summarizing the extracted transcript
          try {
            const summary = await summarizeTranscript(
              transcript, 
              request.videoTitle || 'Unknown Video', 
              request.channelTitle || 'Unknown Channel',
              FIXED_AI_API_KEY
            );
            
            // Store the summary in local storage
            await storeVideoSummary(request.videoId, summary);
            
            // Send back to content script
            chrome.tabs.sendMessage(activeTab.id, { 
              action: 'displaySummary', 
              summary: summary
            });
            
            sendResponse({ success: true, summary: summary });
          } catch (error) {
            console.error('Error generating summary:', error);
            chrome.tabs.sendMessage(activeTab.id, { 
              action: 'summaryError', 
              error: 'Could not generate summary. Please try again later.'
            });
            sendResponse({ success: false, error: error.message });
          }
        });
        
      } catch (error) {
        console.error('Error in extractAndSummarizeFromPage:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep the message channel open for the async response
  }

  // Handle video summarization with transcript fetching
  if (request.action === 'summarizeVideo') {
    console.log('Starting original video summarization process for video:', request.videoId);
    
    (async () => {
      try {
        // Use the fixed API key
        const apiKey = FIXED_AI_API_KEY;
        const userToken = await chrome.storage.local.get(['userToken']).then(result => result.userToken);
        
        if (!userToken) {
          sendResponse({ 
            success: false, 
            error: 'You need to be signed in to summarize videos. Please sign in with your YouTube account first.'
          });
          return;
        }

        // 1. Fetch the video transcript (captions) from YouTube
        let transcript = null;
        let usedTranscript = false;
        
        if (userToken && request.videoId) {
          try {
            console.log('Fetching transcript for video:', request.videoId);
            
            // First get the list of available captions for the video
            const captionsListResponse = await fetch(`${API_BASE}/captions?part=snippet&videoId=${request.videoId}`, {
              headers: { Authorization: `Bearer ${userToken}` }
            });
            
            if (captionsListResponse.ok) {
              const captionsData = await captionsListResponse.json();
              console.log('Available captions:', captionsData);
              
              // Find English captions if available (prioritize manual ones)
              let captionOptions = captionsData.items || [];
              
              // First try English captions
              let englishCaptions = captionOptions.filter(
                item => item.snippet.language === 'en' || item.snippet.language === 'en-US' || item.snippet.language === 'en-GB'
              );
              
              // If no English captions, use any available captions
              if (englishCaptions.length === 0 && captionOptions.length > 0) {
                englishCaptions = captionOptions;
              }
              
              // Sort to prioritize manual captions over auto-generated ones
              const sortedCaptions = englishCaptions.sort((a, b) => {
                // Prioritize manual captions
                if (a.snippet.trackKind === 'standard' && b.snippet.trackKind !== 'standard') return -1;
                if (a.snippet.trackKind !== 'standard' && b.snippet.trackKind === 'standard') return 1;
                return 0;
              });
              
              if (sortedCaptions && sortedCaptions.length > 0) {
                const captionId = sortedCaptions[0].id;
                
                console.log(`Fetching caption with ID: ${captionId}`);
                
                // Get the caption content in SRT format
                const captionResponse = await fetch(`${API_BASE}/captions/${captionId}?tfmt=srt`, {
                  headers: { Authorization: `Bearer ${userToken}` }
                });
                
                if (captionResponse.ok) {
                  const captionText = await captionResponse.text();
                  console.log('Got caption text:', captionText.substring(0, 100) + '...');
                  
                  // Process the SRT format to extract just the text
                  transcript = processSrtTranscript(captionText);
                  usedTranscript = true;
                  console.log('Processed transcript length:', transcript.length);
                } else {
                  console.log('Failed to fetch caption content. Status:', captionResponse.status);
                  const errorText = await captionResponse.text();
                  console.log('Error response:', errorText);
                }
              } else {
                console.log('No captions found for this video');
              }
            } else {
              console.log('Failed to fetch captions list. Status:', captionsListResponse.status);
              const errorText = await captionsListResponse.text();
              console.log('Error response:', errorText);
            }
          } catch (error) {
            console.error('Error fetching transcript:', error);
            // Continue without transcript
          }
        }
        
        // 2. Now summarize the video using either the transcript or basic info
        const channelTitle = request.channelTitle || 'Unknown Creator';
        const videoTitle = request.videoTitle || 'Unknown Video';
        
        // Format our request body according to API requirements
        let promptText = '';
        
        if (transcript) {
          // Limit transcript length if it's too long (API may have token limits)
          const maxTranscriptLength = 16000; // Adjust based on model token limits
          const truncatedTranscript = transcript.length > maxTranscriptLength 
            ? transcript.substring(0, maxTranscriptLength) + '...[truncated for length]' 
            : transcript;
            
          promptText = `Please summarize this YouTube video titled "${videoTitle}" by ${channelTitle}.
            
Here is the video transcript:
${truncatedTranscript}

Create a clear, concise summary with 3-5 main bullet points highlighting the key takeaways.
Format your response in HTML with bullet points using <ul> and <li> tags. Make it easily scannable.`;
        } else {
          // Fallback when no transcript is available
          promptText = `Please summarize what this YouTube video titled "${videoTitle}" by ${channelTitle} might be about.
          
Based just on the title and creator, provide your best guess at 3-5 main points that might be covered in this video.
Begin by noting this is a prediction since no transcript was available.
Format your response in HTML with bullet points using <ul> and <li> tags.`;
        }
        
        const requestBody = {
          contents: [
            {
              parts: [
                { text: promptText }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 800,
            topP: 0.8,
            topK: 40
          }
        };

        console.log('Sending request to Gemini API for summary');
        
        // The API endpoint with the API key as a query parameter
        const endpoint = `${GEMINI_API_URL}?key=${apiKey}`;
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API error response:', response.status, errorText);
          
          // Handle specific error codes with more user-friendly messages
          let errorMessage = 'We couldn\'t generate a summary at this time.';
          if (response.status === 400) {
            errorMessage = 'The video content may be too complex to summarize.';
          } else if (response.status === 403) {
            errorMessage = 'We\'re having trouble accessing the summary service right now.';
          } else if (response.status === 404) {
            errorMessage = 'The summary service is temporarily unavailable.';
          } else if (response.status === 429) {
            errorMessage = 'We\'ve reached our daily limit for video summaries. Please try again tomorrow.';
          }
          
          console.error(errorMessage);
          sendResponse({ 
            success: false, 
            error: errorMessage
          });
          return;
        }
        
        const result = await response.json();
        console.log('API response:', result);
        
        // Extract the summary text from the response
        if (result.candidates && result.candidates.length > 0 && 
            result.candidates[0].content && 
            result.candidates[0].content.parts && 
            result.candidates[0].content.parts.length > 0) {
            
          const summary = result.candidates[0].content.parts[0].text;
          
          // Add a note about transcript source
          const summaryWithSource = usedTranscript 
            ? summary 
            : `<p><em>Note: This summary is based on the video title only since no transcript was available.</em></p>\n${summary}`;
          
          // Store the summary in local storage
          await storeVideoSummary(request.videoId, summaryWithSource);
          
          // Send the summary back to the content script
          sendResponse({ 
            success: true, 
            summary: summaryWithSource,
            usedTranscript: usedTranscript
          });
        } else {
          console.error('Invalid response format from API');
          sendResponse({ 
            success: false, 
            error: 'We couldn\'t create a summary from this video\'s content.'
          });
        }
      } catch (error) {
        console.error('Error summarizing video:', error);
        sendResponse({ 
          success: false, 
          error: `We encountered an issue while creating your summary. Please try again later.`
        });
      }
    })();
    return true; // Keep the message channel open for the async response
  }
  
  // Handle saving the AI API key
  if (request.action === 'saveApiKey') {
    (async () => {
      try {
        // Just store the provided key but we'll always use the fixed one internally
        await chrome.storage.local.set({ aiApiKey: request.apiKey });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error saving API key:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }
  
  // Handle saving AI model choice
  if (request.action === 'saveAiModel') {
    (async () => {
      try {
        await chrome.storage.local.set({ aiModel: request.aiModel });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error saving AI model preference:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for the async response
  }

  // If no handlers above matched, return false to indicate we won't call sendResponse
  return false;
});

// New function to summarize transcript using Gemini API
async function summarizeTranscript(transcript, videoTitle, channelTitle, apiKey) {
  console.log('Summarizing transcript with length:', transcript.length);
  
  // Limit transcript length if it's too long (API may have token limits)
  const maxTranscriptLength = 16000; // Adjust based on model token limits
  const truncatedTranscript = transcript.length > maxTranscriptLength 
    ? transcript.substring(0, maxTranscriptLength) + '...[truncated for length]' 
    : transcript;
    
  const promptText = `Please summarize this YouTube video titled "${videoTitle}" by ${channelTitle}.
    
Here is the video transcript:
${truncatedTranscript}

Create a clear, concise summary with 3-5 main bullet points highlighting the key takeaways.
Format your response in HTML with bullet points using <ul> and <li> tags. Make it easily scannable.
If the transcript mentions any specific tips, statistics or actionable advice, be sure to highlight those.`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      topP: 0.8,
      topK: 40
    }
  };

  console.log('Sending request to Gemini API for summary');
  
  // The API endpoint with the API key as a query parameter
  const endpoint = `${GEMINI_API_URL}?key=${apiKey}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error response:', response.status, errorText);
    
    // Handle specific error codes with more user-friendly messages
    let errorMessage = 'We couldn\'t generate a summary at this time.';
    if (response.status === 400) {
      errorMessage = 'The video content may be too complex to summarize.';
    } else if (response.status === 403) {
      errorMessage = 'We\'re having trouble accessing the summary service right now.';
    } else if (response.status === 404) {
      errorMessage = 'The summary service is temporarily unavailable.';
    } else if (response.status === 429) {
      errorMessage = 'We\'ve reached our daily limit for video summaries. Please try again tomorrow.';
    }
    
    throw new Error(errorMessage);
  }
  
  const result = await response.json();
  console.log('API response received');
  
  // Extract the summary text from the response
  if (result.candidates && result.candidates.length > 0 && 
      result.candidates[0].content && 
      result.candidates[0].content.parts && 
      result.candidates[0].content.parts.length > 0) {
      
    const summary = result.candidates[0].content.parts[0].text;
    return summary;
  } else {
    throw new Error('We couldn\'t create a summary from this video\'s content.');
  }
}

// Helper function to process SRT transcript format
function processSrtTranscript(srtText) {
  if (!srtText) return '';
  
  // SRT format has entries like:
  // 1
  // 00:00:01,000 --> 00:00:04,000
  // Text content here
  //
  // 2
  // ...
  
  try {
    // Split by double newline which usually separates entries
    const entries = srtText.split('\n\n');
    
    // Extract just the text content, ignore timestamps
    const textLines = entries.map(entry => {
      const lines = entry.split('\n');
      // Skip the first two lines (index and timestamp)
      if (lines.length >= 3) {
        return lines.slice(2).join(' ');
      }
      return '';
    });
    
    // Join all text together
    return textLines.join(' ')
      .replace(/  +/g, ' ') // Remove extra spaces
      .trim();
  } catch (err) {
    console.error('Error processing SRT transcript:', err);
    return '';
  }
}

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
