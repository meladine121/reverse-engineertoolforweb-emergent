// Popup script for WebAnalyzer Live Monitor Extension

class PopupManager {
  constructor() {
    this.isMonitoring = false;
    this.sessionStartTime = null;
    this.stats = {
      requests: 0,
      errors: 0,
      warnings: 0,
      sessionTime: 0
    };
    
    this.init();
  }
  
  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    this.startStatsUpdater();
    
    // Check if monitoring is active
    const result = await chrome.storage.local.get(['isMonitoring', 'sessionStartTime']);
    this.isMonitoring = result.isMonitoring || false;
    this.sessionStartTime = result.sessionStartTime || null;
    
    this.updateMonitoringStatus();
  }
  
  async loadSettings() {
    const result = await chrome.storage.sync.get([
      'apiKey',
      'aiEnabled',
      'notificationsEnabled'
    ]);
    
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    
    if (result.aiEnabled !== undefined) {
      this.toggleSwitch('aiToggle', result.aiEnabled);
    }
    
    if (result.notificationsEnabled !== undefined) {
      this.toggleSwitch('notificationToggle', result.notificationsEnabled);
    }
  }
  
  setupEventListeners() {
    // Monitor toggle
    document.getElementById('monitorToggle').addEventListener('click', () => {
      this.toggleMonitoring();
    });
    
    // AI toggle
    document.getElementById('aiToggle').addEventListener('click', () => {
      this.toggleSwitch('aiToggle');
    });
    
    // Notifications toggle
    document.getElementById('notificationToggle').addEventListener('click', () => {
      this.toggleSwitch('notificationToggle');
    });
    
    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // Open dashboard
    document.getElementById('openDashboard').addEventListener('click', () => {
      this.openDashboard();
    });
    
    // Clear session
    document.getElementById('clearSession').addEventListener('click', () => {
      this.clearSession();
    });
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'statsUpdate') {
        this.updateStats(message.data);
      } else if (message.type === 'activityUpdate') {
        this.addActivity(message.data);
      }
    });
  }
  
  async toggleMonitoring() {
    this.isMonitoring = !this.isMonitoring;
    
    if (this.isMonitoring) {
      this.sessionStartTime = Date.now();
      await chrome.storage.local.set({
        isMonitoring: true,
        sessionStartTime: this.sessionStartTime
      });
      
      // Start monitoring on current tab
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, {type: 'startMonitoring'});
      
      this.addActivity({
        type: 'success',
        message: 'Monitoring started',
        timestamp: Date.now()
      });
    } else {
      await chrome.storage.local.set({
        isMonitoring: false,
        sessionStartTime: null
      });
      
      // Stop monitoring
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, {type: 'stopMonitoring'});
      
      this.addActivity({
        type: 'info',
        message: 'Monitoring stopped',
        timestamp: Date.now()
      });
      
      this.sessionStartTime = null;
    }
    
    this.updateMonitoringStatus();
  }
  
  updateMonitoringStatus() {
    const toggle = document.getElementById('monitorToggle');
    const status = document.getElementById('status');
    
    if (this.isMonitoring) {
      toggle.classList.add('active');
      status.textContent = 'Monitoring active';
    } else {
      toggle.classList.remove('active');
      status.textContent = 'Ready to monitor';
    }
  }
  
  toggleSwitch(switchId, force = null) {
    const toggle = document.getElementById(switchId);
    
    if (force !== null) {
      if (force) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    } else {
      toggle.classList.toggle('active');
    }
  }
  
  async saveSettings() {
    const apiKey = document.getElementById('apiKey').value;
    const aiEnabled = document.getElementById('aiToggle').classList.contains('active');
    const notificationsEnabled = document.getElementById('notificationToggle').classList.contains('active');
    
    await chrome.storage.sync.set({
      apiKey,
      aiEnabled,
      notificationsEnabled
    });
    
    // Send settings to background script
    chrome.runtime.sendMessage({
      type: 'settingsUpdate',
      data: { apiKey, aiEnabled, notificationsEnabled }
    });
    
    this.addActivity({
      type: 'success',
      message: 'Settings saved',
      timestamp: Date.now()
    });
  }
  
  updateStats(newStats) {
    this.stats = { ...this.stats, ...newStats };
    
    document.getElementById('requestCount').textContent = this.stats.requests;
    document.getElementById('errorCount').textContent = this.stats.errors;
    document.getElementById('warningCount').textContent = this.stats.warnings;
  }
  
  updateSessionTime() {
    if (this.sessionStartTime) {
      const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      if (minutes > 0) {
        document.getElementById('sessionTime').textContent = `${minutes}m ${seconds}s`;
      } else {
        document.getElementById('sessionTime').textContent = `${seconds}s`;
      }
    } else {
      document.getElementById('sessionTime').textContent = '0s';
    }
  }
  
  addActivity(activity) {
    const activityList = document.getElementById('activityList');
    const activityItem = document.createElement('div');
    activityItem.className = `activity-item ${activity.type}`;
    
    const timeAgo = this.getTimeAgo(activity.timestamp);
    
    activityItem.innerHTML = `
      <div>${activity.message}</div>
      <div class="activity-time">${timeAgo}</div>
    `;
    
    activityList.insertBefore(activityItem, activityList.firstChild);
    
    // Keep only last 10 activities
    while (activityList.children.length > 10) {
      activityList.removeChild(activityList.lastChild);
    }
  }
  
  getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  
  async openDashboard() {
    // Get backend URL from storage or use default
    const result = await chrome.storage.sync.get(['backendUrl']);
    const backendUrl = result.backendUrl || 'http://localhost:3000';
    
    chrome.tabs.create({ url: backendUrl });
  }
  
  async clearSession() {
    await chrome.storage.local.clear();
    
    this.stats = {
      requests: 0,
      errors: 0,
      warnings: 0,
      sessionTime: 0
    };
    
    this.updateStats(this.stats);
    
    // Clear activity list
    const activityList = document.getElementById('activityList');
    activityList.innerHTML = `
      <div class="activity-item info">
        <div>Session cleared</div>
        <div class="activity-time">Just now</div>
      </div>
    `;
    
    this.sessionStartTime = null;
    this.isMonitoring = false;
    this.updateMonitoringStatus();
  }
  
  startStatsUpdater() {
    setInterval(() => {
      this.updateSessionTime();
    }, 1000);
  }
  
  updateUI() {
    // Update the interface based on current state
    this.updateStats(this.stats);
    this.updateSessionTime();
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});