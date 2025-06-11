from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import uuid
import asyncio
from playwright.async_api import async_playwright
import json
from openai import OpenAI
from dotenv import load_dotenv
import logging

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Website Reverse Engineering Tool", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB setup
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(MONGO_URL)
db = client.website_analyzer

# OpenRouter client setup
openrouter_client = None

# Live session storage
live_sessions = {}
websocket_connections = []

class LiveSessionEvent(BaseModel):
    sessionId: str
    url: str
    hostname: str
    event: Dict[str, Any]

class AIInsightRequest(BaseModel):
    sessionId: str
    openrouter_api_key: str
    events: List[Dict[str, Any]]

class AnalysisRequest(BaseModel):
    url: HttpUrl
    openrouter_api_key: str
    depth: Optional[str] = "medium"  # light, medium, deep

class NetworkRequest(BaseModel):
    url: str
    method: str
    status: Optional[int] = 0
    response_type: Optional[str] = ""
    headers: Optional[Dict[str, Any]] = {}
    response_size: Optional[int] = 0

class AnalysisResult(BaseModel):
    id: str
    url: str
    timestamp: datetime
    network_requests: List[NetworkRequest]
    console_logs: List[str]
    page_info: Dict[str, Any]
    tech_stack: List[str]
    api_endpoints: List[str]
    ai_analysis: str
    security_observations: List[str]

@app.post("/api/live-session")
async def handle_live_session(request: LiveSessionEvent):
    """Handle live monitoring data from Chrome extension"""
    try:
        session_id = request.sessionId
        
        # Get or create session
        if session_id not in live_sessions:
            live_sessions[session_id] = {
                "id": str(uuid.uuid4()),
                "sessionId": session_id,
                "url": request.url,
                "hostname": request.hostname,
                "startTime": datetime.utcnow(),
                "events": [],
                "status": "active"
            }
        
        # Add event to session
        live_sessions[session_id]["events"].append(request.event)
        
        # Store in database
        await db.live_sessions.update_one(
            {"sessionId": session_id},
            {
                "$set": {
                    "id": live_sessions[session_id]["id"],
                    "sessionId": session_id,
                    "url": request.url,
                    "hostname": request.hostname,
                    "startTime": live_sessions[session_id]["startTime"],
                    "status": "active",
                    "lastUpdate": datetime.utcnow()
                },
                "$push": {"events": request.event}
            },
            upsert=True
        )
        
        # Broadcast to connected websockets
        await broadcast_to_websockets({
            "type": "live_event",
            "sessionId": session_id,
            "event": request.event
        })
        
        return {"status": "success", "sessionId": session_id}
        
    except Exception as e:
        logger.error(f"Live session error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Live session error: {str(e)}")

@app.post("/api/ai-insight")
async def get_ai_insight(request: AIInsightRequest):
    """Get AI insights for live monitoring events"""
    try:
        # Initialize OpenRouter client
        openrouter_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=request.openrouter_api_key
        )
        
        # Analyze recent events
        events_summary = analyze_events_for_ai(request.events)
        
        insight_prompt = f"""
You are a web development debugging assistant. Analyze these recent events from a live monitoring session:

{json.dumps(events_summary, indent=2)}

Provide a brief, actionable insight (max 100 words) focusing on:
1. What might be wrong
2. Quick debugging tip
3. Potential impact

Be concise and practical for a developer actively testing their application.
"""

        response = openrouter_client.chat.completions.create(
            model="google/gemini-2.5-flash-preview-05-20",
            messages=[{"role": "user", "content": insight_prompt}],
            max_tokens=150,
            temperature=0.7
        )
        
        insight = response.choices[0].message.content
        
        return {
            "sessionId": request.sessionId,
            "message": insight,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"AI insight error: {str(e)}")
        return {
            "sessionId": request.sessionId,
            "message": f"AI analysis failed: {str(e)}",
            "timestamp": datetime.utcnow().isoformat()
        }

def analyze_events_for_ai(events):
    """Analyze events to create a summary for AI"""
    summary = {
        "total_events": len(events),
        "event_types": {},
        "errors": [],
        "slow_requests": [],
        "recent_patterns": []
    }
    
    for event in events[-10:]:  # Last 10 events
        event_type = event.get("type", "unknown")
        summary["event_types"][event_type] = summary["event_types"].get(event_type, 0) + 1
        
        if event_type == "error":
            summary["errors"].append({
                "message": event.get("message", ""),
                "timestamp": event.get("timestamp")
            })
        elif event_type == "network" and event.get("status", 0) >= 400:
            summary["errors"].append({
                "message": f"HTTP {event.get('status')} on {event.get('url')}",
                "timestamp": event.get("timestamp")
            })
        elif event_type == "network" and event.get("duration", 0) > 3000:
            summary["slow_requests"].append({
                "url": event.get("url"),
                "duration": event.get("duration"),
                "timestamp": event.get("timestamp")
            })
    
    return summary

@app.get("/api/live-sessions")
async def get_live_sessions():
    """Get all active live sessions"""
    try:
        sessions = await db.live_sessions.find({"status": "active"}).sort("startTime", -1).to_list(50)
        serialized_sessions = [serialize_mongo_doc(session) for session in sessions]
        return serialized_sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch live sessions: {str(e)}")

@app.get("/api/live-sessions/{session_id}")
async def get_live_session(session_id: str):
    """Get specific live session data"""
    try:
        session = await db.live_sessions.find_one({"sessionId": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return serialize_mongo_doc(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch session: {str(e)}")

@app.websocket("/ws/live-monitoring")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    websocket_connections.append(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle any incoming websocket messages if needed
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)

async def broadcast_to_websockets(message):
    """Broadcast message to all connected websockets"""
    if websocket_connections:
        disconnected = []
        for websocket in websocket_connections:
            try:
                await websocket.send_text(json.dumps(message))
            except:
                disconnected.append(websocket)
        
        # Remove disconnected websockets
        for ws in disconnected:
            if ws in websocket_connections:
                websocket_connections.remove(ws)

@app.post("/api/analyze")
async def analyze_website(request: AnalysisRequest):
    """Main endpoint to analyze a website"""
    try:
        # Initialize OpenRouter client with user's API key
        global openrouter_client
        openrouter_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=request.openrouter_api_key
        )
        
        # Generate unique analysis ID
        analysis_id = str(uuid.uuid4())
        
        # Perform browser automation and data collection
        browser_data = await capture_website_data(str(request.url), request.depth)
        
        # Perform AI analysis
        ai_analysis = await analyze_with_ai(browser_data, str(request.url))
        
        # Process and structure the results
        result = AnalysisResult(
            id=analysis_id,
            url=str(request.url),
            timestamp=datetime.utcnow(),
            network_requests=browser_data["network_requests"],
            console_logs=browser_data["console_logs"],
            page_info=browser_data["page_info"],
            tech_stack=browser_data["tech_stack"],
            api_endpoints=browser_data["api_endpoints"],
            ai_analysis=ai_analysis,
            security_observations=browser_data["security_observations"]
        )
        
        # Store in database
        await db.analyses.insert_one(result.dict())
        
        return result
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

async def capture_website_data(target_url: str, depth: str = "medium") -> Dict[str, Any]:
    """Capture website data using Playwright"""
    network_requests = []
    console_logs = []
    tech_stack = []
    api_endpoints = []
    security_observations = []
    page_info = {}
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Website Analyzer Bot 1.0",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        
        # Capture network requests
        def handle_request(request):
            try:
                network_requests.append({
                    "url": request.url,
                    "method": request.method,
                    "headers": dict(request.headers),
                    "resource_type": request.resource_type,
                    "status": 0,  # Will be updated in response handler
                    "response_type": "",  # Will be updated in response handler
                    "response_size": 0  # Will be updated in response handler
                })
            except Exception as e:
                logger.warning(f"Failed to capture request: {e}")
        
        def handle_response(response):
            try:
                # Look for API endpoints
                if any(api_indicator in response.url.lower() for api_indicator in ['/api/', '/v1/', '/v2/', '.json', '/graphql', '/rest/']):
                    api_endpoints.append({
                        "url": response.url,
                        "status": response.status,
                        "method": response.request.method,
                        "content_type": response.headers.get("content-type", "")
                    })
                
                # Update network requests with response data
                for req in network_requests:
                    if req["url"] == response.url:
                        req.update({
                            "status": response.status,
                            "response_type": response.headers.get("content-type", ""),
                            "response_size": int(response.headers.get("content-length", "0")) if response.headers.get("content-length", "0").isdigit() else 0
                        })
                        break
                        
            except Exception as e:
                logger.warning(f"Failed to capture response: {e}")
        
        # Capture console logs
        def handle_console_log(msg):
            try:
                console_logs.append({
                    "type": msg.type,
                    "text": msg.text,
                    "timestamp": datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to capture console log: {e}")
        
        page.on("request", handle_request)
        page.on("response", handle_response)
        page.on("console", handle_console_log)
        
        try:
            # Navigate to the target URL
            response = await page.goto(target_url, wait_until="networkidle", timeout=30000)
            
            # Basic page info
            page_info = {
                "title": await page.title(),
                "url": page.url,
                "status": response.status if response else 0,
                "load_time": datetime.utcnow().isoformat()
            }
            
            # Wait for dynamic content based on depth
            wait_time = {"light": 2000, "medium": 5000, "deep": 10000}.get(depth, 5000)
            await page.wait_for_timeout(wait_time)
            
            # Analyze tech stack from page content
            tech_stack = await analyze_tech_stack(page)
            
            # Security observations
            security_observations = await analyze_security(page, network_requests)
            
            # If deep analysis, interact with page elements
            if depth == "deep":
                await interact_with_page(page)
                await page.wait_for_timeout(3000)
            
        except Exception as e:
            logger.error(f"Error during page analysis: {e}")
            page_info["error"] = str(e)
        
        await browser.close()
    
    return {
        "network_requests": [
            {
                "url": req.get("url", ""),
                "method": req.get("method", "GET"),
                "status": req.get("status", 0),
                "response_type": req.get("response_type", ""),
                "headers": req.get("headers", {}),
                "response_size": req.get("response_size", 0)
            }
            for req in network_requests 
            if req.get("url") and req.get("method")
        ],
        "console_logs": [log["text"] for log in console_logs[:50]],  # Limit logs
        "page_info": page_info,
        "tech_stack": tech_stack,
        "api_endpoints": [ep["url"] for ep in api_endpoints],
        "security_observations": security_observations
    }

async def analyze_tech_stack(page) -> List[str]:
    """Analyze the technology stack used by the website"""
    tech_stack = []
    
    try:
        # Check for common JavaScript libraries and frameworks
        js_check = await page.evaluate("""
            () => {
                const techs = [];
                
                // Check for popular libraries/frameworks
                if (typeof React !== 'undefined') techs.push('React');
                if (typeof Vue !== 'undefined') techs.push('Vue.js');
                if (typeof angular !== 'undefined') techs.push('Angular');
                if (typeof jQuery !== 'undefined') techs.push('jQuery');
                if (typeof $ !== 'undefined') techs.push('jQuery');
                if (typeof bootstrap !== 'undefined') techs.push('Bootstrap');
                if (window.dataLayer) techs.push('Google Analytics');
                if (window.gtag) techs.push('Google Analytics 4');
                if (window.fbq) techs.push('Facebook Pixel');
                
                // Check meta tags and scripts
                const scripts = Array.from(document.scripts);
                scripts.forEach(script => {
                    if (script.src.includes('react')) techs.push('React');
                    if (script.src.includes('vue')) techs.push('Vue.js');
                    if (script.src.includes('angular')) techs.push('Angular');
                    if (script.src.includes('jquery')) techs.push('jQuery');
                    if (script.src.includes('bootstrap')) techs.push('Bootstrap');
                    if (script.src.includes('stripe')) techs.push('Stripe');
                    if (script.src.includes('paypal')) techs.push('PayPal');
                });
                
                // Check generator meta tag
                const generator = document.querySelector('meta[name="generator"]');
                if (generator) techs.push(generator.content);
                
                return [...new Set(techs)];
            }
        """)
        
        tech_stack.extend(js_check)
        
    except Exception as e:
        logger.warning(f"Failed to analyze tech stack: {e}")
    
    return list(set(tech_stack))

async def analyze_security(page, network_requests) -> List[str]:
    """Analyze security aspects of the website"""
    observations = []
    
    try:
        # Check for HTTPS
        if not page.url.startswith('https://'):
            observations.append("Website not using HTTPS")
        
        # Check for mixed content
        http_requests = [req for req in network_requests if req.get("url", "").startswith("http://")]
        if http_requests and page.url.startswith('https://'):
            observations.append(f"Mixed content detected: {len(http_requests)} HTTP requests on HTTPS page")
        
        # Check for common security headers
        security_headers = ['strict-transport-security', 'content-security-policy', 'x-frame-options']
        # This would require analyzing response headers from network requests
        
    except Exception as e:
        logger.warning(f"Failed to analyze security: {e}")
    
    return observations

async def interact_with_page(page):
    """Interact with page elements for deeper analysis"""
    try:
        # Try to find and click common interactive elements
        interactive_selectors = [
            'button[data-testid]',
            'button[class*="btn"]',
            'a[href*="api"]',
            '[role="button"]'
        ]
        
        for selector in interactive_selectors:
            elements = await page.query_selector_all(selector)
            if elements and len(elements) > 0:
                try:
                    await elements[0].click(timeout=1000)
                    await page.wait_for_timeout(500)
                    break
                except:
                    continue
                    
    except Exception as e:
        logger.warning(f"Failed to interact with page: {e}")

async def analyze_with_ai(browser_data: Dict, target_url: str) -> str:
    """Analyze the captured data using OpenRouter AI"""
    try:
        # Prepare data for AI analysis
        analysis_prompt = f"""
Analyze this website reverse engineering data for: {target_url}

NETWORK REQUESTS ({len(browser_data.get('network_requests', []))} total):
{json.dumps(browser_data.get('network_requests', [])[:10], indent=2)}

API ENDPOINTS DISCOVERED:
{json.dumps(browser_data.get('api_endpoints', []), indent=2)}

TECHNOLOGY STACK:
{json.dumps(browser_data.get('tech_stack', []), indent=2)}

CONSOLE LOGS (sample):
{json.dumps(browser_data.get('console_logs', [])[:5], indent=2)}

PAGE INFO:
{json.dumps(browser_data.get('page_info', {}), indent=2)}

SECURITY OBSERVATIONS:
{json.dumps(browser_data.get('security_observations', []), indent=2)}

Please provide a comprehensive analysis including:
1. **Architecture Overview**: What type of application this appears to be
2. **Technology Stack**: Detailed breakdown of technologies used
3. **API Analysis**: Analysis of discovered API endpoints and their purposes
4. **Data Flow**: How data appears to flow through the application
5. **Security Assessment**: Security posture and potential vulnerabilities
6. **Integration Points**: External services and third-party integrations
7. **Performance Insights**: Notable performance characteristics
8. **Reverse Engineering Summary**: Key insights for developers wanting to understand this application

Keep the analysis technical but accessible, focusing on actionable insights.
"""

        response = openrouter_client.chat.completions.create(
            model="google/gemini-2.5-flash-preview-05-20",
            messages=[{"role": "user", "content": analysis_prompt}],
            max_tokens=2000,
            temperature=0.7
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")
        return f"AI analysis failed: {str(e)}. Raw data analysis shows {len(browser_data.get('network_requests', []))} network requests, {len(browser_data.get('api_endpoints', []))} API endpoints discovered, and {len(browser_data.get('tech_stack', []))} technologies identified."

def serialize_mongo_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    
    # Convert ObjectId to string
    if '_id' in doc:
        doc['_id'] = str(doc['_id'])
    
    # Handle datetime objects
    if 'timestamp' in doc and hasattr(doc['timestamp'], 'isoformat'):
        doc['timestamp'] = doc['timestamp'].isoformat()
    
    return doc

@app.get("/api/analyses")
async def get_analyses():
    """Get all previous analyses"""
    try:
        analyses = await db.analyses.find().sort("timestamp", -1).limit(50).to_list(50)
        # Serialize all documents
        serialized_analyses = [serialize_mongo_doc(analysis) for analysis in analyses]
        return serialized_analyses
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch analyses: {str(e)}")

@app.get("/api/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Get a specific analysis by ID"""
    try:
        analysis = await db.analyses.find_one({"id": analysis_id})
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return serialize_mongo_doc(analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch analysis: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Website Reverse Engineering Tool",
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)