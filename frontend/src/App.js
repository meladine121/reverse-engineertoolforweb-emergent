import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('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');
  const [depth, setDepth] = useState('medium');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [previousAnalyses, setPreviousAnalyses] = useState([]);
  const [activeView, setActiveView] = useState('analyzer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [liveSessions, setLiveSessions] = useState([]);
  const [selectedLiveSession, setSelectedLiveSession] = useState(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    fetchPreviousAnalyses();
    fetchLiveSessions();
    
    // Set up periodic refresh for live sessions
    const interval = setInterval(fetchLiveSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchPreviousAnalyses = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/analyses`);
      if (response.ok) {
        const data = await response.json();
        setPreviousAnalyses(data);
      }
    } catch (err) {
      console.error('Failed to fetch previous analyses:', err);
    }
  };

  const fetchLiveSessions = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/live-sessions`);
      if (response.ok) {
        const data = await response.json();
        setLiveSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch live sessions:', err);
    }
  };

  const analyzeWebsite = async (e) => {
    e.preventDefault();
    
    if (!url || !apiKey) {
      setError('Please provide both URL and OpenRouter API key');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setAnalysis(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          openrouter_api_key: apiKey,
          depth: depth
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
      setActiveView('results');
      fetchPreviousAnalyses();
    } catch (err) {
      setError(err.message || 'Failed to analyze website');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadPreviousAnalysis = async (analysisId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/analyses/${analysisId}`);
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        setUrl(data.url);
        setActiveView('results');
      }
    } catch (err) {
      setError('Failed to load analysis');
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const clearAnalysis = () => {
    setAnalysis(null);
    setError('');
    setUrl('');
    setActiveView('analyzer');
  };

  const SidebarItem = ({ icon, label, view, isActive, onClick }) => (
    <div
      className={`sidebar-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="sidebar-icon">{icon}</span>
      {!sidebarCollapsed && <span className="sidebar-label">{label}</span>}
    </div>
  );

  const renderAnalyzerView = () => (
    <div className="analyzer-view">
      <div className="page-header">
        <h1 className="page-title">🔍 Website Analyzer</h1>
        <p className="page-subtitle">Reverse engineer websites with AI-powered analysis</p>
      </div>

      <div className="analyzer-form-container">
        <form onSubmit={analyzeWebsite} className="analyzer-form">
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="url" className="form-label">
                <span className="label-icon">🌐</span>
                Target Website URL
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="apiKey" className="form-label">
                <span className="label-icon">🔑</span>
                OpenRouter API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="form-input"
                required
              />
              <p className="form-help">
                Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai</a>
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="depth" className="form-label">
                <span className="label-icon">⚡</span>
                Analysis Depth
              </label>
              <div className="depth-options">
                {[
                  { value: 'light', label: 'Light', time: '2s', desc: 'Quick overview' },
                  { value: 'medium', label: 'Medium', time: '5s', desc: 'Balanced analysis' },
                  { value: 'deep', label: 'Deep', time: '10s', desc: 'Comprehensive scan' }
                ].map(option => (
                  <div
                    key={option.value}
                    className={`depth-option ${depth === option.value ? 'selected' : ''}`}
                    onClick={() => setDepth(option.value)}
                  >
                    <div className="depth-header">
                      <span className="depth-label">{option.label}</span>
                      <span className="depth-time">{option.time}</span>
                    </div>
                    <div className="depth-desc">{option.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="analyze-btn"
            >
              {isAnalyzing ? (
                <>
                  <div className="spinner"></div>
                  Analyzing Website...
                </>
              ) : (
                <>
                  <span className="btn-icon">🚀</span>
                  Start Analysis
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="error-card">
            <div className="error-icon">⚠️</div>
            <div className="error-content">
              <div className="error-title">Analysis Failed</div>
              <div className="error-message">{error}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="history-view">
      <div className="page-header">
        <h1 className="page-title">📈 Analysis History</h1>
        <p className="page-subtitle">Review your previous website analyses</p>
      </div>

      <div className="history-container">
        {previousAnalyses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-title">No Analyses Yet</div>
            <div className="empty-message">Start analyzing websites to see your history here</div>
            <button className="empty-cta" onClick={() => setActiveView('analyzer')}>
              Start Analyzing
            </button>
          </div>
        ) : (
          <div className="history-grid">
            {previousAnalyses.map((prev) => (
              <div
                key={prev.id}
                className="history-card"
                onClick={() => loadPreviousAnalysis(prev.id)}
              >
                <div className="history-header">
                  <div className="history-url">{prev.url}</div>
                  <div className="history-status">✅</div>
                </div>
                <div className="history-meta">
                  <div className="history-time">{formatTimestamp(prev.timestamp)}</div>
                  <div className="history-stats">
                    <span>{prev.network_requests?.length || 0} requests</span>
                    <span>•</span>
                    <span>{prev.tech_stack?.length || 0} technologies</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderResultsView = () => (
    <div className="results-view">
      <div className="results-header">
        <div className="results-title-section">
          <h1 className="page-title">📊 Analysis Results</h1>
          <div className="results-url">{analysis?.url}</div>
        </div>
        <div className="results-actions">
          <button className="secondary-btn" onClick={clearAnalysis}>
            <span className="btn-icon">🔄</span>
            New Analysis
          </button>
          <button className="secondary-btn" onClick={() => setActiveView('history')}>
            <span className="btn-icon">📈</span>
            View History
          </button>
        </div>
      </div>

      <div className="results-grid">
        {/* Overview Card */}
        <div className="result-card overview-card">
          <div className="card-header">
            <h3 className="card-title">
              <span className="card-icon">📋</span>
              Overview
            </h3>
          </div>
          <div className="overview-stats">
            <div className="stat-item">
              <div className="stat-value">{analysis?.network_requests?.length || 0}</div>
              <div className="stat-label">Network Requests</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{analysis?.tech_stack?.length || 0}</div>
              <div className="stat-label">Technologies</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{analysis?.api_endpoints?.length || 0}</div>
              <div className="stat-label">API Endpoints</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{analysis?.page_info?.status || 'N/A'}</div>
              <div className="stat-label">HTTP Status</div>
            </div>
          </div>
        </div>

        {/* AI Analysis Card */}
        <div className="result-card ai-analysis-card">
          <div className="card-header">
            <h3 className="card-title">
              <span className="card-icon">🤖</span>
              AI Analysis
            </h3>
          </div>
          <div className="ai-analysis-content">
            {analysis?.ai_analysis?.split('\n').map((line, index) => (
              <p key={index} className="analysis-line">
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Technology Stack Card */}
        {analysis?.tech_stack && analysis.tech_stack.length > 0 && (
          <div className="result-card tech-stack-card">
            <div className="card-header">
              <h3 className="card-title">
                <span className="card-icon">🛠️</span>
                Technology Stack
              </h3>
            </div>
            <div className="tech-stack-grid">
              {analysis.tech_stack.map((tech, index) => (
                <div key={index} className="tech-tag">
                  {tech}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Endpoints Card */}
        {analysis?.api_endpoints && analysis.api_endpoints.length > 0 && (
          <div className="result-card api-endpoints-card">
            <div className="card-header">
              <h3 className="card-title">
                <span className="card-icon">🔌</span>
                API Endpoints ({analysis.api_endpoints.length})
              </h3>
            </div>
            <div className="api-endpoints-list">
              {analysis.api_endpoints.slice(0, 10).map((endpoint, index) => (
                <div key={index} className="api-endpoint">
                  <code>{endpoint}</code>
                </div>
              ))}
              {analysis.api_endpoints.length > 10 && (
                <div className="api-more">
                  ... and {analysis.api_endpoints.length - 10} more endpoints
                </div>
              )}
            </div>
          </div>
        )}

        {/* Network Activity Card */}
        {analysis?.network_requests && analysis.network_requests.length > 0 && (
          <div className="result-card network-card">
            <div className="card-header">
              <h3 className="card-title">
                <span className="card-icon">🌐</span>
                Network Activity
              </h3>
            </div>
            <div className="network-summary">
              <div className="network-stat">
                <span className="network-stat-value">{analysis.network_requests.length}</span>
                <span className="network-stat-label">Total Requests</span>
              </div>
              <div className="network-stat">
                <span className="network-stat-value">
                  {analysis.network_requests.filter(req => req.status >= 200 && req.status < 300).length}
                </span>
                <span className="network-stat-label">Successful</span>
              </div>
              <div className="network-stat">
                <span className="network-stat-value">
                  {analysis.network_requests.filter(req => req.status >= 400).length}
                </span>
                <span className="network-stat-label">Failed</span>
              </div>
            </div>
            <div className="network-requests-list">
              {analysis.network_requests.slice(0, 5).map((request, index) => (
                <div key={index} className="network-request">
                  <div className="request-method">{request.method}</div>
                  <div className="request-url">{request.url}</div>
                  <div className={`request-status status-${Math.floor(request.status / 100)}`}>
                    {request.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Observations Card */}
        {analysis?.security_observations && analysis.security_observations.length > 0 && (
          <div className="result-card security-card">
            <div className="card-header">
              <h3 className="card-title">
                <span className="card-icon">🔒</span>
                Security Observations
              </h3>
            </div>
            <div className="security-list">
              {analysis.security_observations.map((observation, index) => (
                <div key={index} className="security-item">
                  <span className="security-icon">⚠️</span>
                  <span className="security-text">{observation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderCurrentView = () => {
    switch (activeView) {
      case 'analyzer':
        return renderAnalyzerView();
      case 'history':
        return renderHistoryView();
      case 'results':
        return analysis ? renderResultsView() : renderAnalyzerView();
      default:
        return renderAnalyzerView();
    }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🔍</span>
            {!sidebarCollapsed && <span className="logo-text">WebAnalyzer</span>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <SidebarItem
            icon="🚀"
            label="Analyzer"
            view="analyzer"
            isActive={activeView === 'analyzer'}
            onClick={() => setActiveView('analyzer')}
          />
          <SidebarItem
            icon="📈"
            label="History"
            view="history"
            isActive={activeView === 'history'}
            onClick={() => setActiveView('history')}
          />
          {analysis && (
            <SidebarItem
              icon="📊"
              label="Results"
              view="results"
              isActive={activeView === 'results'}
              onClick={() => setActiveView('results')}
            />
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-item">
            <span className="sidebar-icon">ℹ️</span>
            {!sidebarCollapsed && <span className="sidebar-label">v1.0.0</span>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {renderCurrentView()}
      </div>
    </div>
  );
}

export default App;