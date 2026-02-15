// Background service worker for Tab Organizer extension

// Tab relationship tracking storage
let tabRelationships = new Map(); // tabId -> { parent, children, createdAt, domain, etc. }
let tabSessions = new Map(); // sessionId -> { tabs, startTime, endTime }

chrome.runtime.onInstalled.addListener(() => {
  console.log('Tab Organizer extension installed');
  
  // Initialize tab tracking
  initializeTabTracking();
});

// Shared function to get tabs with current group information
async function getTabsWithGroupInfo() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Get existing tab groups
  const currentWindow = await chrome.windows.getCurrent();
  const existingGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
  const groupMap = new Map();
  
  for (const group of existingGroups) {
    groupMap.set(group.id, {
      name: group.title || 'Untitled',
      color: group.color
    });
  }
  
  // Extract tab information with current group data
  return tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    index: tab.index,
    currentGroup: tab.groupId !== -1 && groupMap.has(tab.groupId) 
      ? groupMap.get(tab.groupId) 
      : null
  }));
}

// Shared function to generate AI prompt
function generateAIPrompt(promptText, tabInfo) {
  return `${promptText}

Here are the current browser tabs (with their IDs and current groups):
${tabInfo.map((tab, i) => {
    const groupInfo = tab.currentGroup 
      ? ` [Group: ${tab.currentGroup.name}] [Group color: ${tab.currentGroup.color}]`
      : ' [Group: Ungrouped] [Group color: none]';
    return `${i + 1}. [ID: ${tab.id}] ${tab.title} - ${tab.url}${groupInfo}`;
  }).join('\n')}

Please respond with a JSON object in this exact format:
{
  "groups": [
    {
      "name": "Group Name",
      "color": "blue",
      "tabs": [tab_id1, tab_id2, tab_id3]
    }
  ]
}

IMPORTANT INSTRUCTIONS:
- Use the exact tab IDs from the list above (${tabInfo.map(tab => tab.id).join(', ')}) in your response
- You can keep existing groups if they make sense, or reorganize tabs as needed
- Choose appropriate colors: "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"
- You can create a group called "Ungrouped" for tabs that don't fit into any category
- Consider the current grouping but feel free to improve it`;
}

// Initialize tab relationship tracking
async function initializeTabTracking() {
  console.log('🔍 Initializing tab relationship tracking...');
  
  // Track existing tabs
  const existingTabs = await chrome.tabs.query({});
  existingTabs.forEach(tab => {
    trackTabCreation(tab.id, tab.url, null, Date.now());
  });
  
  console.log(`📊 Started tracking ${existingTabs.length} existing tabs`);
}

// Handle messages from popup and options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'organizeTabsWithAI') {
    organizeTabsWithAI(request.config)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'applyDebugGrouping') {
    applyDebugGrouping(request.grouping, request.tabs)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'getTabsWithGroupInfo') {
    getTabsWithGroupInfo()
      .then(tabs => sendResponse({ success: true, tabs }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'generateAIPrompt') {
    try {
      const prompt = generateAIPrompt(request.promptText, request.tabInfo);
      sendResponse({ success: true, prompt });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

async function organizeTabsWithAI(config) {
  try {
    // Get tab info with current group data
    const tabInfo = await getTabsWithGroupInfo();

    // Generate AI prompt using shared function
    const prompt = generateAIPrompt(config.promptText, tabInfo);

    // Call appropriate AI API based on provider
    const aiResponse = await callAIAPI(config, prompt);
    
    // Parse AI response
    const grouping = JSON.parse(aiResponse);
    
    // Organize tabs based on AI grouping
    await organizeTabs(tabInfo, grouping);
    
    return { success: true, grouping };
  } catch (error) {
    console.error('Error organizing tabs:', error);
    throw error;
  }
}

async function callAIAPI(config, prompt) {
  const provider = config.provider || 'anthropic';
  
  if (provider === 'openai') {
    return await callOpenAIAPI(config, prompt);
  } else if (provider === 'gemini') {
    return await callGeminiAPI(config, prompt);
  } else {
    return await callAnthropicAPI(config, prompt);
  }
}

async function callAnthropicAPI(config, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiToken,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText}\n${errorData}`);
  }

  const result = await response.json();
  return result.content[0].text;
}

async function callOpenAIAPI(config, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiToken}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 1024,
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}\n${errorData}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

async function callGeminiAPI(config, prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': config.apiToken
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: config.maxTokens || 1024,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${response.statusText}\n${errorData}`);
  }

  const result = await response.json();
  return result.candidates[0].content.parts[0].text;
}

async function organizeTabs(tabs, grouping) {
  try {
    // Clear existing groups first
    const currentWindow = await chrome.windows.getCurrent();
    const existingGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    for (const group of existingGroups) {
      const groupTabs = await chrome.tabs.query({ groupId: group.id });
      if (groupTabs.length > 0) {
        await chrome.tabs.ungroup(groupTabs.map(tab => tab.id));
      }
    }

    // Create new Chrome tab groups
    for (const group of grouping.groups) {
      const validTabIds = group.tabs.filter(tabId => 
        tabs.some(tab => tab.id === tabId)
      );
      
      if (validTabIds.length === 0) {
        console.warn(`No valid tabs found for group: ${group.name}`);
        continue;
      }
      
      // Handle "Ungrouped" special case - don't create a group
      if (group.name.toLowerCase() === 'ungrouped') {
        console.log(`📝 Leaving ${validTabIds.length} tabs ungrouped as requested`);
        continue;
      }
      
      try {
        // Create tab group
        const tabGroup = await chrome.tabs.group({
          tabIds: validTabIds
        });
        
        // Use AI-selected color or fall back to automatic selection
        const color = group.color || getGroupColor(group.name);
        
        // Set group title and color
        await chrome.tabGroups.update(tabGroup, {
          title: group.name,
          color: color
        });
        
        console.log(`✅ Created tab group "${group.name}" with color ${color}`);
      } catch (error) {
        console.error(`Failed to create group "${group.name}":`, error);
      }
    }
  } catch (error) {
    console.error('Error organizing tabs:', error);
    throw error;
  }
}

async function applyDebugGrouping(grouping, debugTabs) {
  try {
    // Get current tabs
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    
    // Create a mapping from debug tab IDs to real tab IDs
    // The debug tabs should correspond to current tabs by order/position
    const tabMapping = {};
    
    // Strategy 1: Try exact ID matching first
    debugTabs.forEach(debugTab => {
      const matchingTab = currentTabs.find(realTab => realTab.id === debugTab.id);
      if (matchingTab) {
        tabMapping[debugTab.id] = matchingTab.id;
      }
    });
    
    // Strategy 2: If exact matching didn't work, use index-based mapping
    if (Object.keys(tabMapping).length === 0) {
      debugTabs.forEach((debugTab, index) => {
        if (currentTabs[index]) {
          tabMapping[debugTab.id] = currentTabs[index].id;
        }
      });
    }
    
    // Strategy 3: If AI returned unexpected tab IDs, try to map them by position
    // Check if the AI response contains IDs we don't recognize
    const allAITabIds = new Set();
    for (const group of grouping.groups) {
      group.tabs.forEach(id => allAITabIds.add(id));
    }
    
    const unmappedIds = Array.from(allAITabIds).filter(id => !tabMapping[id]);
    if (unmappedIds.length > 0) {
      console.log('AI returned unmapped tab IDs, attempting position-based mapping:', unmappedIds);
      
      // Try to map unmapped IDs by treating them as 1-based indices
      unmappedIds.forEach(aiTabId => {
        const index = aiTabId - 1; // Convert 1-based to 0-based
        if (index >= 0 && index < currentTabs.length) {
          tabMapping[aiTabId] = currentTabs[index].id;
          console.log(`Mapped AI tab ID ${aiTabId} to real tab ${currentTabs[index].id} at index ${index}`);
        }
      });
    }

    console.log('=== APPLY DEBUG GROUPING ===');
    console.log('Debug tabs (what was sent to AI):', debugTabs.map(t => ({ id: t.id, title: t.title })));
    console.log('Current tabs (actual browser tabs):', currentTabs.map(t => ({ id: t.id, title: t.title, index: t.index })));
    console.log('AI Grouping response:', JSON.stringify(grouping, null, 2));
    console.log('Tab mapping (debug ID -> real ID):', tabMapping);

    // First, ungroup all tabs to start fresh (prevents repeated clicking issues)
    try {
      console.log('Clearing existing tab groups...');
      const currentWindow = await chrome.windows.getCurrent();
      const existingGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
      for (const group of existingGroups) {
        const groupTabs = await chrome.tabs.query({ groupId: group.id });
        if (groupTabs.length > 0) {
          await chrome.tabs.ungroup(groupTabs.map(tab => tab.id));
          console.log(`Removed existing group: ${group.title || 'Untitled'} (${groupTabs.length} tabs)`);
        }
      }
    } catch (error) {
      console.warn('Failed to clear existing groups:', error);
    }

    // Check if we have a mapping issue
    const missingMappings = [];
    for (const group of grouping.groups) {
      for (const debugTabId of group.tabs) {
        if (!tabMapping[debugTabId]) {
          missingMappings.push(debugTabId);
        }
      }
    }
    
    if (missingMappings.length > 0) {
      console.error('Missing mappings for tab IDs:', missingMappings);
      console.error('Available debug tab IDs:', Object.keys(tabMapping));
      throw new Error(`AI returned tab IDs that don't match loaded tabs: ${missingMappings.join(', ')}`);
    }

    // Create actual Chrome tab groups instead of just moving tabs
    for (const group of grouping.groups) {
      console.log(`Creating Chrome tab group: ${group.name} with tabs:`, group.tabs);
      
      // Get the real tab IDs for this group
      const realTabIds = group.tabs
        .map(debugTabId => tabMapping[debugTabId])
        .filter(realTabId => realTabId !== undefined);
      
      if (realTabIds.length === 0) {
        console.warn(`No valid tabs found for group: ${group.name}`);
        continue;
      }
      
      console.log(`Creating group "${group.name}" with real tab IDs:`, realTabIds);
      
      try {
        // Create a new tab group
        const tabGroup = await chrome.tabs.group({
          tabIds: realTabIds
        });
        
        // Set the group title and color
        await chrome.tabGroups.update(tabGroup, {
          title: group.name,
          color: getGroupColor(group.name)
        });
        
        console.log(`✅ Created tab group "${group.name}" with ID ${tabGroup}`);
      } catch (error) {
        console.error(`Failed to create group "${group.name}":`, error);
        // Fallback to just moving tabs together
        console.log('Falling back to moving tabs together...');
        for (const tabId of realTabIds) {
          try {
            await chrome.tabs.move(tabId, { index: -1 });
          } catch (moveError) {
            console.warn(`Failed to move tab ${tabId}:`, moveError);
          }
        }
      }
    }

    return { success: true, groupsApplied: grouping.groups.length };
  } catch (error) {
    console.error('Error applying debug grouping:', error);
    throw error;
  }
}

function getGroupColor(groupName) {
  // Assign colors based on group name keywords
  const name = groupName.toLowerCase();
  
  if (name.includes('work') || name.includes('communication') || name.includes('email')) {
    return 'blue';
  } else if (name.includes('development') || name.includes('technical') || name.includes('code')) {
    return 'green';
  } else if (name.includes('meeting') || name.includes('calendar')) {
    return 'yellow';
  } else if (name.includes('cloud') || name.includes('platform') || name.includes('logs')) {
    return 'orange';
  } else if (name.includes('research') || name.includes('documentation') || name.includes('docs')) {
    return 'purple';
  } else if (name.includes('personal') || name.includes('misc')) {
    return 'pink';
  } else if (name.includes('browser') || name.includes('extension')) {
    return 'cyan';
  } else {
    return 'grey';
  }
}