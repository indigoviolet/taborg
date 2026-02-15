// Popup script for Tab Organizer extension

document.addEventListener('DOMContentLoaded', function() {
  const organizeBtn = document.getElementById('organizeBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const loading = document.getElementById('loading');
  const status = document.getElementById('status');
  const configStatus = document.getElementById('configStatus');
  
  // Load and check configuration
  checkConfiguration();
  
  // Event listeners
  organizeBtn.addEventListener('click', handleOrganize);
  settingsBtn.addEventListener('click', openOptions);

  async function checkConfiguration() {
    try {
      const result = await chrome.storage.local.get(['provider', 'model', 'apiToken', 'promptText']);
      
      if (result.model && result.apiToken && result.promptText) {
        const provider = result.provider || 'anthropic';
        let providerName = 'Anthropic';
        if (provider === 'openai') {
          providerName = 'OpenAI';
        } else if (provider === 'gemini') {
          providerName = 'Google';
        }
        configStatus.innerHTML = `✅ Configured with ${providerName} ${result.model}`;
        configStatus.style.backgroundColor = '#d4edda';
        configStatus.style.color = '#155724';
        organizeBtn.disabled = false;
      } else {
        configStatus.innerHTML = '⚠️ Please configure API settings first';
        configStatus.style.backgroundColor = '#fff3cd';
        configStatus.style.color = '#856404';
        organizeBtn.disabled = true;
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      configStatus.innerHTML = '❌ Configuration error';
      configStatus.style.backgroundColor = '#f8d7da';
      configStatus.style.color = '#721c24';
      organizeBtn.disabled = true;
    }
  }

  async function handleOrganize() {
    // Get current configuration
    const result = await chrome.storage.local.get(['provider', 'model', 'apiToken', 'promptText', 'maxTokens']);
    
    const config = {
      provider: result.provider || 'anthropic',
      model: result.model,
      apiToken: result.apiToken,
      promptText: result.promptText,
      maxTokens: result.maxTokens || 1024
    };

    // Validate configuration
    if (!config.model || !config.apiToken || !config.promptText) {
      showStatus('Please configure your settings first', 'error');
      return;
    }

    // Show loading state
    organizeBtn.disabled = true;
    loading.style.display = 'block';
    status.innerHTML = '';

    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        action: 'organizeTabsWithAI',
        config: config
      });

      if (response.success) {
        showStatus(`Successfully organized tabs into ${response.result.grouping.groups.length} groups`, 'success');
        
        // Show group names after a delay
        const groupNames = response.result.grouping.groups.map(g => g.name).join(', ');
        setTimeout(() => {
          showStatus(`Groups: ${groupNames}`, 'success');
        }, 2000);
        
        // Close popup after success
        setTimeout(() => {
          window.close();
        }, 4000);
      } else {
        showStatus(`Error: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Error organizing tabs:', error);
      showStatus('Failed to organize tabs. Check your configuration.', 'error');
    } finally {
      // Hide loading state
      organizeBtn.disabled = false;
      loading.style.display = 'none';
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  function showStatus(message, type) {
    status.innerHTML = message;
    status.className = `status ${type}`;
    
    // Auto-hide messages
    if (type === 'success') {
      setTimeout(() => {
        status.innerHTML = '';
        status.className = '';
      }, 5000);
    }
  }
});