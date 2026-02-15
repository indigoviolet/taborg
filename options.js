// Options page script for Tab Organizer extension

document.addEventListener('DOMContentLoaded', function() {
  const providerSelect = document.getElementById('provider');
  const modelInput = document.getElementById('model');
  const modelLabel = document.getElementById('modelLabel');
  const modelHelpText = document.getElementById('modelHelpText');
  const apiTokenInput = document.getElementById('apiToken');
  const tokenLabel = document.getElementById('tokenLabel');
  const tokenHelpText = document.getElementById('tokenHelpText');
  const promptTextInput = document.getElementById('promptText');
  const maxTokensInput = document.getElementById('maxTokens');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const testBtn = document.getElementById('testBtn');
  const testLoading = document.getElementById('testLoading');
  const testResult = document.getElementById('testResult');
  const status = document.getElementById('status');

  // Debug tab elements
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const debugLoadTabsBtn = document.getElementById('debugLoadTabsBtn');
  const debugUseSampleBtn = document.getElementById('debugUseSampleBtn');
  const debugTabsData = document.getElementById('debugTabsData');
  const debugPrompt = document.getElementById('debugPrompt');
  const debugResponse = document.getElementById('debugResponse');
  const debugGeneratePromptBtn = document.getElementById('debugGeneratePromptBtn');
  const debugSendPromptBtn = document.getElementById('debugSendPromptBtn');
  const debugApplyResponseBtn = document.getElementById('debugApplyResponseBtn');
  const debugLoading = document.getElementById('debugLoading');
  const debugStatus = document.getElementById('debugStatus');

  let currentTabs = [];

  // Load saved configuration
  loadConfiguration();

  // Event listeners
  saveBtn.addEventListener('click', saveConfiguration);
  resetBtn.addEventListener('click', resetToDefaults);
  testBtn.addEventListener('click', testConnection);
  providerSelect.addEventListener('change', handleProviderChange);

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });


  // Debug tab event listeners
  debugLoadTabsBtn.addEventListener('click', loadCurrentTabs);
  debugUseSampleBtn.addEventListener('click', loadSampleTabs);
  debugGeneratePromptBtn.addEventListener('click', generatePrompt);
  debugSendPromptBtn.addEventListener('click', sendPromptToAI);
  debugApplyResponseBtn.addEventListener('click', applyGrouping);

  async function loadConfiguration() {
    try {
      const result = await chrome.storage.local.get([
        'provider',
        'model', 
        'apiToken', 
        'promptText', 
        'maxTokens'
      ]);
      
      if (result.provider) {
        providerSelect.value = result.provider;
        handleProviderChange(); // Update UI based on provider
      }
      
      if (result.model) {
        modelInput.value = result.model;
      }
      
      if (result.apiToken) {
        apiTokenInput.value = result.apiToken;
      }
      
      if (result.promptText) {
        promptTextInput.value = result.promptText;
      }

      if (result.maxTokens) {
        maxTokensInput.value = result.maxTokens;
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      showStatus('Error loading saved configuration', 'error');
    }
  }

  async function saveConfiguration() {
    try {
      const config = {
        provider: providerSelect.value,
        model: modelInput.value.trim(),
        apiToken: apiTokenInput.value.trim(),
        promptText: promptTextInput.value.trim(),
        maxTokens: parseInt(maxTokensInput.value) || 1024
      };

      // Validate inputs
      if (!config.model) {
        showStatus('Please enter a model ID', 'error');
        return;
      }

      if (!config.apiToken) {
        showStatus('Please enter your API token', 'error');
        return;
      }

      if (!config.promptText) {
        showStatus('Please enter a prompt template', 'error');
        return;
      }

      await chrome.storage.local.set(config);
      showStatus('Configuration saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving configuration:', error);
      showStatus('Error saving configuration', 'error');
    }
  }

  function handleProviderChange() {
    const provider = providerSelect.value;
    
    if (provider === 'openai') {
      // Update UI for OpenAI
      modelLabel.textContent = 'OpenAI Model:';
      modelInput.placeholder = 'gpt-4-turbo-preview';
      modelInput.value = 'gpt-4-turbo-preview';
      modelHelpText.innerHTML = 'Enter any valid OpenAI model ID. Examples: gpt-4-turbo-preview, gpt-4o, gpt-3.5-turbo, o1-preview, o1-mini';
      
      tokenLabel.textContent = 'OpenAI API Key:';
      apiTokenInput.placeholder = 'sk-...';
      tokenHelpText.innerHTML = 'Your API key is stored securely in your browser and never shared. Get one at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>';
    } else if (provider === 'gemini') {
      // Update UI for Gemini
      modelLabel.textContent = 'Gemini Model:';
      modelInput.placeholder = 'gemini-2.0-flash';
      modelInput.value = 'gemini-2.0-flash';
      modelHelpText.innerHTML = 'Enter any valid Gemini model ID. Examples: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro';
      
      tokenLabel.textContent = 'Google AI API Key:';
      apiTokenInput.placeholder = 'AIza...';
      tokenHelpText.innerHTML = 'Your API key is stored securely in your browser and never shared. Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>';
    } else {
      // Update UI for Anthropic
      modelLabel.textContent = 'Model ID:';
      modelInput.placeholder = 'claude-3-5-sonnet-20241022';
      modelInput.value = 'claude-3-5-sonnet-20241022';
      modelHelpText.innerHTML = 'Enter any valid Anthropic model ID. Examples: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-sonnet-20240229. For Claude Sonnet 4, use: claude-sonnet-4-20250514';
      
      tokenLabel.textContent = 'Anthropic API Token:';
      apiTokenInput.placeholder = 'sk-ant-api03-...';
      tokenHelpText.innerHTML = 'Your API token is stored securely in your browser and never shared. Get one at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>';
    }
  }

  function resetToDefaults() {
    providerSelect.value = 'anthropic';
    handleProviderChange(); // This will set the correct model and placeholders
    apiTokenInput.value = '';
    promptTextInput.value = `You are a helpful assistant that organizes browser tabs into logical groups. Please analyze the following tabs and group them by topic, purpose, or domain. Create meaningful group names that clearly describe the content.

Focus on:
- Grouping related content together
- Creating clear, descriptive group names
- Keeping groups reasonably sized (2-8 tabs per group)
- Prioritizing user productivity and workflow`;
    maxTokensInput.value = 1024;

    showStatus('Configuration reset to defaults', 'success');
  }

  async function testConnection() {
    const provider = providerSelect.value;
    const model = modelInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    const promptText = promptTextInput.value.trim();
    const maxTokens = parseInt(maxTokensInput.value) || 1024;

    if (!model || !apiToken || !promptText) {
      showStatus('Please fill in all required fields before testing', 'error');
      return;
    }

    testBtn.disabled = true;
    testLoading.style.display = 'block';
    testResult.innerHTML = '';

    try {
      // Test with sample tab data
      const sampleTabs = [
        { title: 'GitHub - Tab Organizer Repository', url: 'https://github.com/user/tab-organizer' },
        { title: 'Anthropic Console', url: 'https://console.anthropic.com' },
        { title: 'Gmail', url: 'https://mail.google.com' },
        { title: 'Google Docs - Project Plan', url: 'https://docs.google.com/document/d/123' }
      ];

      const testPrompt = `${promptText}

Here are the current browser tabs:
${sampleTabs.map((tab, i) => `${i + 1}. ${tab.title} - ${tab.url}`).join('\n')}

Please respond with a JSON object in this exact format:
{
  "groups": [
    {
      "name": "Group Name",
      "tabs": [tab_id1, tab_id2, ...]
    }
  ]
}`;

      const aiResponse = await testAIAPI(provider, { model, apiToken, maxTokens }, testPrompt);
      
      // Try to parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(aiResponse);
      } catch (parseError) {
        throw new Error(`AI response is not valid JSON: ${parseError.message}\n\nResponse: ${aiResponse}`);
      }

      // Validate the response structure
      if (!parsedResponse.groups || !Array.isArray(parsedResponse.groups)) {
        throw new Error('AI response does not contain valid groups array');
      }

      testResult.className = 'test-result success';
      testResult.textContent = `✅ Test successful!\n\nProvider: ${provider}\nModel: ${model}\nResponse: ${JSON.stringify(parsedResponse, null, 2)}`;
      
      showStatus('API connection test successful!', 'success');
    } catch (error) {
      console.error('Test connection error:', error);
      testResult.className = 'test-result error';
      testResult.textContent = `❌ Test failed:\n\n${error.message}`;
      
      showStatus('API connection test failed - check the test result below', 'error');
    } finally {
      testBtn.disabled = false;
      testLoading.style.display = 'none';
    }
  }

  async function testAIAPI(provider, config, prompt) {
    if (provider === 'openai') {
      return await testOpenAIAPI(config, prompt);
    } else if (provider === 'gemini') {
      return await testGeminiAPI(config, prompt);
    } else {
      return await testAnthropicAPI(config, prompt);
    }
  }

  async function testAnthropicAPI(config, prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiToken,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
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

  async function testOpenAIAPI(config, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiToken}`
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
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

  async function testGeminiAPI(config, prompt) {
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
          maxOutputTokens: config.maxTokens,
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

  function showStatus(message, type) {
    status.innerHTML = message;
    status.className = `status ${type}`;
    
    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        status.innerHTML = '';
        status.className = '';
      }, 5000);
    }
  }

  function showDebugStatus(message, type) {
    debugStatus.innerHTML = message;
    debugStatus.className = `status ${type}`;
    
    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        debugStatus.innerHTML = '';
        debugStatus.className = '';
      }, 5000);
    }
  }

  // Debug functions
  async function loadCurrentTabs() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getTabsWithGroupInfo'
      });

      if (response.success) {
        currentTabs = response.tabs;
        displayTabsData(currentTabs);
        showDebugStatus(`Loaded ${currentTabs.length} tabs from current window`, 'success');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error loading current tabs:', error);
      showDebugStatus('Error loading current tabs', 'error');
    }
  }

  function loadSampleTabs() {
    currentTabs = [
      { id: 1, title: 'GitHub - Tab Organizer Repository', url: 'https://github.com/user/tab-organizer', index: 0 },
      { id: 2, title: 'Anthropic Console', url: 'https://console.anthropic.com', index: 1 },
      { id: 3, title: 'Gmail', url: 'https://mail.google.com', index: 2 },
      { id: 4, title: 'Google Docs - Project Plan', url: 'https://docs.google.com/document/d/123', index: 3 },
      { id: 5, title: 'Stack Overflow - Chrome Extension API', url: 'https://stackoverflow.com/questions/chrome-extension', index: 4 },
      { id: 6, title: 'YouTube - JavaScript Tutorials', url: 'https://youtube.com/watch?v=tutorials', index: 5 },
      { id: 7, title: 'Twitter', url: 'https://twitter.com', index: 6 },
      { id: 8, title: 'LinkedIn', url: 'https://linkedin.com', index: 7 }
    ];
    
    displayTabsData(currentTabs);
    showDebugStatus('Loaded sample tab data', 'success');
  }

  function displayTabsData(tabs) {
    const tabsHtml = tabs.map((tab, i) => {
      const groupInfo = tab.currentGroup 
        ? `<br><span style="color: #f92672;">Group:</span> ${tab.currentGroup.name}<br><span style="color: #f92672;">Group color:</span> ${tab.currentGroup.color}`
        : `<br><span style="color: #75715e;">Group:</span> Ungrouped<br><span style="color: #75715e;">Group color:</span> none`;
        
      return `<div style="margin: 5px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
        <strong>Tab ${i + 1} (ID: ${tab.id}):</strong><br>
        <span style="color: #66d9ef;">Title:</span> ${tab.title}<br>
        <span style="color: #66d9ef;">URL:</span> ${tab.url}${groupInfo}
      </div>`;
    }).join('');
    
    debugTabsData.innerHTML = tabsHtml;
  }

  async function generatePrompt() {
    if (currentTabs.length === 0) {
      showDebugStatus('Please load tabs first', 'error');
      return;
    }

    const promptText = promptTextInput.value.trim();
    if (!promptText) {
      showDebugStatus('Please configure your prompt template first', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'generateAIPrompt',
        promptText: promptText,
        tabInfo: currentTabs
      });

      if (response.success) {
        debugPrompt.value = response.prompt;
        showDebugStatus('Generated prompt template', 'success');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      showDebugStatus('Error generating prompt', 'error');
    }
  }

  async function sendPromptToAI() {
    const provider = providerSelect.value;
    const model = modelInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    const maxTokens = parseInt(maxTokensInput.value) || 1024;
    const prompt = debugPrompt.value.trim();

    if (!model || !apiToken) {
      showDebugStatus('Please configure your model and API token first', 'error');
      return;
    }

    if (!prompt) {
      showDebugStatus('Please generate or enter a prompt first', 'error');
      return;
    }

    debugLoading.style.display = 'block';
    debugSendPromptBtn.disabled = true;
    debugResponse.value = '';

    try {
      const aiResponse = await testAIAPI(provider, { model, apiToken, maxTokens }, prompt);
      
      debugResponse.value = aiResponse;
      showDebugStatus('AI response received successfully', 'success');
    } catch (error) {
      console.error('Debug API error:', error);
      debugResponse.value = `Error: ${error.message}`;
      showDebugStatus('Failed to get AI response', 'error');
    } finally {
      debugLoading.style.display = 'none';
      debugSendPromptBtn.disabled = false;
    }
  }

  async function applyGrouping() {
    const responseText = debugResponse.value.trim();
    
    if (!responseText) {
      showDebugStatus('No AI response to apply', 'error');
      return;
    }

    try {
      const grouping = JSON.parse(responseText);
      
      if (!grouping.groups || !Array.isArray(grouping.groups)) {
        throw new Error('Response does not contain valid groups array');
      }

      console.log('Current tabs loaded in debug:', currentTabs.map(t => ({ id: t.id, title: t.title })));
      console.log('AI response grouping:', grouping);

      // Send to background script to apply the grouping
      const response = await chrome.runtime.sendMessage({
        action: 'applyDebugGrouping',
        grouping: grouping,
        tabs: currentTabs
      });

      if (response.success) {
        const groupNames = grouping.groups.map(g => g.name).join(', ');
        showDebugStatus(`✅ Successfully applied ${grouping.groups.length} groups: ${groupNames}`, 'success');
        
        // Show detailed results
        setTimeout(() => {
          const totalTabs = grouping.groups.reduce((sum, g) => sum + g.tabs.length, 0);
          showDebugStatus(`Organized ${totalTabs} tabs into ${grouping.groups.length} groups. Check your browser window!`, 'success');
        }, 2000);
      } else {
        showDebugStatus(`❌ Failed to apply grouping: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Error applying grouping:', error);
      showDebugStatus(`Error parsing or applying response: ${error.message}`, 'error');
    }
  }
});