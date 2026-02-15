# Tab Organizer Chrome Extension

An AI-powered Chrome extension that automatically organizes your browser tabs into logical groups using Claude AI.

## Features

- 🤖 **AI-Powered Organization**: Uses Claude AI to intelligently group tabs by topic, purpose, or domain
- ⚙️ **Customizable Prompts**: Configure your own prompt template for tab organization
- 🔐 **Secure**: API tokens are stored locally and never shared
- 🎯 **Simple Interface**: Clean, easy-to-use popup interface
- 📊 **Multiple Models**: Support for Claude 3.5 Sonnet and Claude 3 Haiku

## Installation

1. **Get an Anthropic API Key**
   - Visit [console.anthropic.com](https://console.anthropic.com)
   - Create an account and generate an API key

2. **Install the Extension**
   - Download or clone this repository
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked" and select the extension directory

3. **Configure the Extension**
   - Click the extension icon in your Chrome toolbar
   - Enter your Anthropic API token
   - Customize the prompt template if desired
   - Select your preferred AI model

## Usage

1. Open multiple tabs you want to organize
2. Click the Tab Organizer extension icon
3. Click "Organize Tabs with AI"
4. Wait for the AI to analyze and group your tabs
5. Your tabs will be automatically reorganized by the AI's groupings

## Configuration Options

- **AI Model**: Choose between Claude 3.5 Sonnet (more capable) or Claude 3 Haiku (faster)
- **API Token**: Your Anthropic API key (stored securely in local storage)
- **Prompt Template**: Customize how the AI should organize your tabs

## Default Prompt

The extension uses this default prompt template:

```
You are a helpful assistant that organizes browser tabs into logical groups. Please analyze the following tabs and group them by topic, purpose, or domain. Create meaningful group names that clearly describe the content.
```

## Privacy & Security

- Your API token is stored locally in Chrome's storage and never transmitted anywhere except to Anthropic's API
- Tab information (titles and URLs) is only sent to the AI for organization purposes
- No data is collected or stored by this extension beyond your configuration

## File Structure

```
tab-organizer/
├── manifest.json          # Extension manifest
├── popup.html             # Extension popup interface
├── popup.js              # Popup logic and UI handling
├── background.js         # Background script for tab management
├── icon16.png           # Extension icon (16x16)
├── icon48.png           # Extension icon (48x48)
├── icon128.png          # Extension icon (128x128)
└── README.md            # This file
```

## Development

To modify or extend the extension:

1. Make changes to the relevant files
2. Reload the extension in `chrome://extensions/`
3. Test your changes

## API Response Format

The extension expects the AI to respond with JSON in this format:

```json
{
  "groups": [
    {
      "name": "Work Documents",
      "tabs": [1, 3, 5]
    },
    {
      "name": "Social Media",
      "tabs": [2, 4]
    }
  ]
}
```

## Troubleshooting

- **Extension not working**: Check that you've enabled it in `chrome://extensions/`
- **API errors**: Verify your API token is correct and has sufficient credits
- **Tabs not organizing**: Ensure you have multiple tabs open in the current window
- **Permission issues**: The extension requires "tabs" and "storage" permissions

## License

MIT License - feel free to modify and distribute.