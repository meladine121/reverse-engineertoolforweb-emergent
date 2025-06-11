// Background service worker for WebAnalyzer Live Monitor Extension

class BackgroundService {
  constructor() {
    this.backendUrl = 'http://localhost:8001'; // Default backend URL
    this.settings = {
      apiKey: '',
      aiEnabled: true,
      notificationsEnabled: true
    };
    
    this.sessionData = new Map();
    this.init();
  }
  
  init() {
    this.setupMessageListeners();
    this.loadSettings();
    
    console.log('WebAnalyzer Background Service initialized');
  }
  
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'apiKey',
        'aiEnabled',
        'notificationsEnabled',
        'backendUrl'
      ]);
      
      this.settings = {
        apiKey: result.apiKey || '',
        aiEnabled: result.aiEnabled !== undefined ? result.aiEnabled : true,
        notificationsEnabled: result.notificationsEnabled !== undefined ? result.notificationsEnabled : true
      };
      
      if (result.backendUrl) {
        this.backendUrl = result.backendUrl;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'monitoringData':
          this.handleMonitoringData(message.data, sender.tab);
          break;
        case 'activity':
          this.handleActivity(message.data);
          break;
        case 'statsUpdate':
          this.handleStatsUpdate(message.data);
          break;
        case 'settingsUpdate':
          this.handleSettingsUpdate(message.data);
          break;
      }
    });
    
    // Handle tab updates to maintain session continuity
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.checkAndStartMonitoring(tabId);
      }
    });
  }
  
  async checkAndStartMonitoring(tabId) {
    try {
      const result = await chrome.storage.local.get(['isMonitoring']);
      if (result.isMonitoring) {
        chrome.tabs.sendMessage(tabId, {type: 'startMonitoring'});
      }
    } catch (error) {
      // Tab might not be ready for messages yet
    }
  }
  
  async handleMonitoringData(data, tab) {
    try {
      // Store data locally
      if (!this.sessionData.has(data.sessionId)) {
        this.sessionData.set(data.sessionId, {
          sessionId: data.sessionId,
          startTime: Date.now(),
          url: tab.url,
          hostname: data.hostname,
          events: []
        });
      }
      
      const session = this.sessionData.get(data.sessionId);
      session.events.push(data);
      
      // Send to backend
      await this.sendToBackend(data, session);
      
      // Trigger AI analysis if enabled and conditions are met
      if (this.settings.aiEnabled && this.shouldTriggerAI(data)) {
        await this.triggerAIAnalysis(session);
      }
      
      // Show notification if needed
      if (this.settings.notificationsEnabled && this.shouldNotify(data)) {
        this.showNotification(data);
      }
      
    } catch (error) {
      console.error('Error handling monitoring data:', error);
    }
  }
  
  async sendToBackend(data, session) {
    try {
      const response = await fetch(`${this.backendUrl}/api/live-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          url: session.url,
          hostname: session.hostname,
          event: data,
          openrouter_api_key: this.settings.apiKey
        })
      });
      
      if (!response.ok) {
        console.warn('Failed to send data to backend:', response.statusText);
      }
    } catch (error) {
      console.error('Backend communication error:', error);
    }
  }
  
  shouldTriggerAI(data) {
    // Trigger AI analysis for errors, slow requests, or security issues
    return (
      data.type === 'error' ||
      (data.type === 'network' && data.status >= 400) ||
      (data.type === 'network' && data.duration > 5000) ||
      (data.type === 'console' && data.level === 'error')
    );
  }
  
  async triggerAIAnalysis(session) {
    try {
      const recentEvents = session.events.slice(-10); // Last 10 events
      
      const response = await fetch(`${this.backendUrl}/api/ai-insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          events: recentEvents,
          openrouter_api_key: this.settings.apiKey
        })
      });
      
      if (response.ok) {
        const insight = await response.json();
        
        // Show AI insight as notification
        if (this.settings.notificationsEnabled && insight.message) {
          this.showNotification({
            type: 'info',
            message: `AI Insight: ${insight.message}`,
            title: 'WebAnalyzer AI'
          });
        }
      }
    } catch (error) {
      console.error('AI analysis error:', error);
    }
  }
  
  shouldNotify(data) {
    // Notify for errors, warnings, and significant events
    return (
      data.type === 'error' ||
      (data.type === 'network' && data.status >= 400) ||
      (data.type === 'network' && data.duration > 3000) ||
      (data.type === 'console' && ['error', 'warn'].includes(data.level))
    );
  }
  
  showNotification(data) {
    let title = 'WebAnalyzer Monitor';
    let message = data.message;
    let iconUrl = 'icons/icon48.png';
    
    switch (data.type) {
      case 'error':
        title = '🚨 Error Detected';
        iconUrl = 'icons/icon48.png';
        break;
      case 'network':
        if (data.status >= 400) {
          title = '🌐 Network Error';
          message = `${data.method} ${data.url} failed (${data.status})`;
        } else if (data.duration > 3000) {
          title = '⏱️ Slow Request';
          message = `${data.method} ${data.url} took ${data.duration}ms`;
        }
        break;
      case 'console':
        if (data.level === 'error') {
          title = '🐛 Console Error';
        } else if (data.level === 'warn') {
          title = '⚠️ Console Warning';
        }
        break;
      case 'info':
        title = data.title || '💡 AI Insight';
        break;
    }
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message.length > 100 ? message.substring(0, 97) + '...' : message
    });
  }
  
  handleActivity(activity) {
    // Forward activity to popup if open
    this.broadcastToPopup({
      type: 'activityUpdate',
      data: activity
    });
  }
  
  handleStatsUpdate(stats) {
    // Forward stats to popup if open
    this.broadcastToPopup({
      type: 'statsUpdate',
      data: stats
    });
  }
  
  handleSettingsUpdate(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('Settings updated:', this.settings);
  }
  
  broadcastToPopup(message) {
    // Try to send message to popup (will fail silently if popup is closed)
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup is not open, ignore
    });
  }
}

// Initialize background service
const backgroundService = new BackgroundService();