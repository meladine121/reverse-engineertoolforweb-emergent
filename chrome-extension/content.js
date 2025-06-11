// Content script for WebAnalyzer Live Monitor Extension

class LiveMonitor {
  constructor() {
    this.isMonitoring = false;
    this.sessionId = null;
    this.stats = {
      requests: 0,
      errors: 0,
      warnings: 0,
      consoleEvents: 0
    };
    
    this.originalFetch = null;
    this.originalXHR = null;
    this.originalConsole = {};
    
    this.init();
  }
  
  init() {
    this.setupMessageListeners();
    this.checkMonitoringStatus();
  }
  
  async checkMonitoringStatus() {
    try {
      const result = await chrome.storage.local.get(['isMonitoring', 'sessionId']);
      if (result.isMonitoring) {
        this.sessionId = result.sessionId || this.generateSessionId();
        this.startMonitoring();
      }
    } catch (error) {
      console.log('WebAnalyzer: Could not check monitoring status');
    }
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'startMonitoring':
          this.startMonitoring();
          break;
        case 'stopMonitoring':
          this.stopMonitoring();
          break;
        case 'getStats':
          sendResponse(this.stats);
          break;
      }
    });
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.sessionId = this.generateSessionId();
    
    console.log('🔍 WebAnalyzer Live Monitor started');
    
    // Store session info
    chrome.storage.local.set({
      sessionId: this.sessionId,
      sessionStartTime: Date.now()
    });
    
    this.monitorNetworkRequests();
    this.monitorConsole();
    this.monitorErrors();
    this.monitorPerformance();
    
    this.sendActivity({
      type: 'success',
      message: `Monitoring started on ${window.location.hostname}`,
      timestamp: Date.now()
    });
  }
  
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    console.log('🔍 WebAnalyzer Live Monitor stopped');
    
    this.restoreOriginalMethods();
    
    this.sendActivity({
      type: 'info',
      message: 'Monitoring stopped',
      timestamp: Date.now()
    });
  }
  
  monitorNetworkRequests() {
    // Monitor Fetch API
    this.originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0];
      const options = args[1] || {};
      
      try {
        const response = await this.originalFetch.apply(window, args);
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        
        this.stats.requests++;
        
        const requestData = {
          type: 'network',
          method: options.method || 'GET',
          url: url,
          status: response.status,
          statusText: response.statusText,
          duration: duration,
          timestamp: Date.now(),
          responseType: response.headers.get('content-type') || 'unknown'
        };
        
        this.sendToBackground(requestData);
        
        if (response.status >= 400) {
          this.stats.errors++;
          this.sendActivity({
            type: 'error',
            message: `${options.method || 'GET'} ${url} failed (${response.status})`,
            timestamp: Date.now()
          });
        } else if (duration > 3000) {
          this.stats.warnings++;
          this.sendActivity({
            type: 'warning',
            message: `Slow request: ${duration}ms for ${url}`,
            timestamp: Date.now()
          });
        }
        
        this.updateStats();
        return response;
      } catch (error) {
        this.stats.errors++;
        this.sendActivity({
          type: 'error',
          message: `Network error: ${error.message}`,
          timestamp: Date.now()
        });
        this.updateStats();
        throw error;
      }
    };
    
    // Monitor XMLHttpRequest
    this.originalXHR = window.XMLHttpRequest;
    const self = this;
    
    window.XMLHttpRequest = function() {
      const xhr = new self.originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      
      let method, url, startTime;
      
      xhr.open = function(m, u, ...args) {
        method = m;
        url = u;
        return originalOpen.apply(this, [m, u, ...args]);
      };
      
      xhr.send = function(...args) {
        startTime = performance.now();
        
        xhr.addEventListener('loadend', () => {
          if (!self.isMonitoring) return;
          
          const endTime = performance.now();
          const duration = Math.round(endTime - startTime);
          
          self.stats.requests++;
          
          const requestData = {
            type: 'network',
            method: method,
            url: url,
            status: xhr.status,
            statusText: xhr.statusText,
            duration: duration,
            timestamp: Date.now(),
            responseType: xhr.getResponseHeader('content-type') || 'unknown'
          };
          
          self.sendToBackground(requestData);
          
          if (xhr.status >= 400) {
            self.stats.errors++;
            self.sendActivity({
              type: 'error',
              message: `${method} ${url} failed (${xhr.status})`,
              timestamp: Date.now()
            });
          } else if (duration > 3000) {
            self.stats.warnings++;
            self.sendActivity({
              type: 'warning',
              message: `Slow XHR: ${duration}ms for ${url}`,
              timestamp: Date.now()
            });
          }
          
          self.updateStats();
        });
        
        return originalSend.apply(this, args);
      };
      
      return xhr;
    };
  }
  
  monitorConsole() {
    const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'];
    
    consoleMethods.forEach(method => {
      this.originalConsole[method] = console[method];
      
      console[method] = (...args) => {
        if (this.isMonitoring) {
          this.stats.consoleEvents++;
          
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          
          const logData = {
            type: 'console',
            level: method,
            message: message,
            timestamp: Date.now(),
            url: window.location.href
          };
          
          this.sendToBackground(logData);
          
          if (method === 'error') {
            this.stats.errors++;
            this.sendActivity({
              type: 'error',
              message: `Console error: ${message.substring(0, 50)}...`,
              timestamp: Date.now()
            });
          } else if (method === 'warn') {
            this.stats.warnings++;
            this.sendActivity({
              type: 'warning',
              message: `Console warning: ${message.substring(0, 50)}...`,
              timestamp: Date.now()
            });
          }
          
          this.updateStats();
        }
        
        return this.originalConsole[method].apply(console, args);
      };
    });
  }
  
  monitorErrors() {
    window.addEventListener('error', (event) => {
      if (!this.isMonitoring) return;
      
      this.stats.errors++;
      
      const errorData = {
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: Date.now(),
        url: window.location.href
      };
      
      this.sendToBackground(errorData);
      
      this.sendActivity({
        type: 'error',
        message: `JavaScript error: ${event.message}`,
        timestamp: Date.now()
      });
      
      this.updateStats();
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      if (!this.isMonitoring) return;
      
      this.stats.errors++;
      
      const errorData = {
        type: 'promise_rejection',
        message: event.reason?.message || String(event.reason),
        timestamp: Date.now(),
        url: window.location.href
      };
      
      this.sendToBackground(errorData);
      
      this.sendActivity({
        type: 'error',
        message: `Unhandled promise rejection: ${errorData.message}`,
        timestamp: Date.now()
      });
      
      this.updateStats();
    });
  }
  
  monitorPerformance() {
    // Monitor page load performance
    window.addEventListener('load', () => {
      if (!this.isMonitoring) return;
      
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0];
        
        if (perfData) {
          const performanceData = {
            type: 'performance',
            loadTime: Math.round(perfData.loadEventEnd - perfData.fetchStart),
            domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.fetchStart),
            firstPaint: null,
            timestamp: Date.now(),
            url: window.location.href
          };
          
          // Get First Paint if available
          const paintEntries = performance.getEntriesByType('paint');
          const firstPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint');
          if (firstPaint) {
            performanceData.firstPaint = Math.round(firstPaint.startTime);
          }
          
          this.sendToBackground(performanceData);
          
          if (performanceData.loadTime > 5000) {
            this.stats.warnings++;
            this.sendActivity({
              type: 'warning',
              message: `Slow page load: ${performanceData.loadTime}ms`,
              timestamp: Date.now()
            });
            this.updateStats();
          }
        }
      }, 1000);
    });
  }
  
  restoreOriginalMethods() {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    
    if (this.originalXHR) {
      window.XMLHttpRequest = this.originalXHR;
    }
    
    Object.keys(this.originalConsole).forEach(method => {
      console[method] = this.originalConsole[method];
    });
  }
  
  sendToBackground(data) {
    chrome.runtime.sendMessage({
      type: 'monitoringData',
      data: {
        ...data,
        sessionId: this.sessionId,
        url: window.location.href,
        hostname: window.location.hostname
      }
    });
  }
  
  sendActivity(activity) {
    chrome.runtime.sendMessage({
      type: 'activity',
      data: activity
    });
  }
  
  updateStats() {
    chrome.runtime.sendMessage({
      type: 'statsUpdate',
      data: this.stats
    });
  }
}

// Initialize monitor
const monitor = new LiveMonitor();