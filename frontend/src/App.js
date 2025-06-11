import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [depth, setDepth] = useState('medium');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [previousAnalyses, setPreviousAnalyses] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    fetchPreviousAnalyses();
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
      fetchPreviousAnalyses(); // Refresh history
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
        setShowHistory(false);
      }
    } catch (err) {
      setError('Failed to load analysis');
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="header-content">
            <h1 className="title">
              🔍 Website Reverse Engineer
            </h1>
            <p className="subtitle">
              Discover how websites work under the hood with AI-powered analysis
            </p>
          </div>
        </header>

        {/* Main Content */}
        <main className="main-content">
          {/* Analysis Form */}
          <div className="form-section">
            <form onSubmit={analyzeWebsite} className="analysis-form">
              <div className="form-group">
                <label htmlFor="url" className="form-label">
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
                  Analysis Depth
                </label>
                <select
                  id="depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  className="form-select"
                >
                  <option value="light">Light (2s) - Quick overview</option>
                  <option value="medium">Medium (5s) - Balanced analysis</option>
                  <option value="deep">Deep (10s) - Comprehensive scan</option>
                </select>
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
                      Analyzing...
                    </>
                  ) : (
                    'Analyze Website'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="history-btn"
                >
                  {showHistory ? 'Hide History' : 'Show History'}
                </button>
              </div>
            </form>
          </div>

          {/* Error Display */}
          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Previous Analyses */}
          {showHistory && previousAnalyses.length > 0 && (
            <div className="history-section">
              <h3 className="section-title">Previous Analyses</h3>
              <div className="history-list">
                {previousAnalyses.slice(0, 10).map((prev) => (
                  <div
                    key={prev.id}
                    className="history-item"
                    onClick={() => loadPreviousAnalysis(prev.id)}
                  >
                    <div className="history-url">{prev.url}</div>
                    <div className="history-time">{formatTimestamp(prev.timestamp)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && (
            <div className="results-section">
              <h2 className="section-title">Analysis Results</h2>
              
              {/* Overview */}
              <div className="result-card">
                <h3 className="card-title">📊 Overview</h3>
                <div className="overview-grid">
                  <div className="overview-item">
                    <span className="overview-label">URL:</span>
                    <span className="overview-value">{analysis.url}</span>
                  </div>
                  <div className="overview-item">
                    <span className="overview-label">Page Title:</span>
                    <span className="overview-value">{analysis.page_info?.title || 'N/A'}</span>
                  </div>
                  <div className="overview-item">
                    <span className="overview-label">Status:</span>
                    <span className="overview-value">{analysis.page_info?.status || 'N/A'}</span>
                  </div>
                  <div className="overview-item">
                    <span className="overview-label">Analyzed:</span>
                    <span className="overview-value">{formatTimestamp(analysis.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="result-card">
                <h3 className="card-title">🤖 AI Analysis</h3>
                <div className="ai-analysis">
                  {analysis.ai_analysis.split('\n').map((line, index) => (
                    <p key={index} className="analysis-line">
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              {/* Technology Stack */}
              {analysis.tech_stack && analysis.tech_stack.length > 0 && (
                <div className="result-card">
                  <h3 className="card-title">🛠️ Technology Stack</h3>
                  <div className="tech-stack">
                    {analysis.tech_stack.map((tech, index) => (
                      <span key={index} className="tech-tag">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* API Endpoints */}
              {analysis.api_endpoints && analysis.api_endpoints.length > 0 && (
                <div className="result-card">
                  <h3 className="card-title">🔌 API Endpoints Discovered</h3>
                  <div className="api-list">
                    {analysis.api_endpoints.slice(0, 20).map((endpoint, index) => (
                      <div key={index} className="api-item">
                        <code className="api-url">{endpoint}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Network Requests */}
              {analysis.network_requests && analysis.network_requests.length > 0 && (
                <div className="result-card">
                  <h3 className="card-title">🌐 Network Activity ({analysis.network_requests.length} requests)</h3>
                  <div className="network-stats">
                    <div className="stat-item">
                      <span className="stat-label">Total Requests:</span>
                      <span className="stat-value">{analysis.network_requests.length}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Successful:</span>
                      <span className="stat-value">
                        {analysis.network_requests.filter(req => req.status >= 200 && req.status < 300).length}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Failed:</span>
                      <span className="stat-value">
                        {analysis.network_requests.filter(req => req.status >= 400).length}
                      </span>
                    </div>
                  </div>
                  
                  <div className="network-list">
                    {analysis.network_requests.slice(0, 10).map((request, index) => (
                      <div key={index} className="network-item">
                        <div className="network-method">{request.method}</div>
                        <div className="network-url">{request.url}</div>
                        <div className={`network-status status-${Math.floor(request.status / 100)}`}>
                          {request.status}
                        </div>
                      </div>
                    ))}
                    {analysis.network_requests.length > 10 && (
                      <div className="network-more">
                        ... and {analysis.network_requests.length - 10} more requests
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Security Observations */}
              {analysis.security_observations && analysis.security_observations.length > 0 && (
                <div className="result-card">
                  <h3 className="card-title">🔒 Security Observations</h3>
                  <div className="security-list">
                    {analysis.security_observations.map((observation, index) => (
                      <div key={index} className="security-item">
                        ⚠️ {observation}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Console Logs */}
              {analysis.console_logs && analysis.console_logs.length > 0 && (
                <div className="result-card">
                  <h3 className="card-title">📝 Console Logs (sample)</h3>
                  <div className="console-logs">
                    {analysis.console_logs.slice(0, 10).map((log, index) => (
                      <div key={index} className="console-log">
                        <code>{log}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="footer">
          <p>Built with React, FastAPI, Playwright, and OpenRouter AI</p>
        </footer>
      </div>
    </div>
  );
}

export default App;