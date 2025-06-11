#!/usr/bin/env python3
import requests
import json
import time
import sys

# Backend URL
BACKEND_URL = "http://localhost:8001"

# OpenRouter API key
OPENROUTER_API_KEY = "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"

# Test URL for analysis
TEST_URL = "https://httpbin.org/get"

def test_health_check():
    """Test the health check endpoint"""
    print("\n=== Testing Health Check Endpoint ===")
    try:
        response = requests.get(f"{BACKEND_URL}/api/health")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        assert response.status_code == 200, "Health check failed with non-200 status code"
        assert response.json().get("status") == "healthy", "Health check did not return 'healthy' status"
        
        print("✅ Health check test passed")
        return True
    except Exception as e:
        print(f"❌ Health check test failed: {str(e)}")
        return False

def test_analyze_endpoint():
    """Test the analyze endpoint with a valid URL"""
    print("\n=== Testing Analyze Endpoint ===")
    try:
        payload = {
            "url": TEST_URL,
            "openrouter_api_key": OPENROUTER_API_KEY,
            "depth": "light"  # Using light depth for faster testing
        }
        
        print(f"Sending request to analyze {TEST_URL}...")
        response = requests.post(f"{BACKEND_URL}/api/analyze", json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Analysis ID: {result.get('id')}")
            print(f"URL Analyzed: {result.get('url')}")
            print(f"Network Requests Captured: {len(result.get('network_requests', []))}")
            print(f"Console Logs Captured: {len(result.get('console_logs', []))}")
            print(f"Tech Stack Detected: {result.get('tech_stack', [])}")
            print(f"API Endpoints Discovered: {result.get('api_endpoints', [])}")
            
            # Verify the response structure
            assert 'id' in result, "Response missing 'id' field"
            assert 'url' in result, "Response missing 'url' field"
            assert 'network_requests' in result, "Response missing 'network_requests' field"
            assert 'console_logs' in result, "Response missing 'console_logs' field"
            assert 'tech_stack' in result, "Response missing 'tech_stack' field"
            assert 'api_endpoints' in result, "Response missing 'api_endpoints' field"
            assert 'ai_analysis' in result, "Response missing 'ai_analysis' field"
            
            print("✅ Analyze endpoint test passed")
            return True
        else:
            print(f"❌ Analyze endpoint test failed with status code {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Analyze endpoint test failed: {str(e)}")
        return False

def test_get_analyses():
    """Test the get analyses endpoint"""
    print("\n=== Testing Get Analyses Endpoint ===")
    try:
        response = requests.get(f"{BACKEND_URL}/api/analyses")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            analyses = response.json()
            print(f"Number of analyses retrieved: {len(analyses)}")
            
            if len(analyses) > 0:
                print(f"Most recent analysis ID: {analyses[0].get('id')}")
                print(f"Most recent analysis URL: {analyses[0].get('url')}")
            
            print("✅ Get analyses test passed")
            return True
        else:
            print(f"❌ Get analyses test failed with status code {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Get analyses test failed: {str(e)}")
        return False

def test_error_handling():
    """Test error handling with invalid data"""
    print("\n=== Testing Error Handling ===")
    
    # Test with invalid URL
    try:
        print("Testing with invalid URL...")
        payload = {
            "url": "not-a-valid-url",
            "openrouter_api_key": OPENROUTER_API_KEY,
            "depth": "light"
        }
        
        response = requests.post(f"{BACKEND_URL}/api/analyze", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        assert response.status_code != 200, "Server accepted invalid URL"
        print("✅ Invalid URL test passed")
    except Exception as e:
        print(f"❌ Invalid URL test failed: {str(e)}")
        return False
    
    # Test with missing API key
    try:
        print("\nTesting with missing API key...")
        payload = {
            "url": TEST_URL,
            "openrouter_api_key": "",
            "depth": "light"
        }
        
        response = requests.post(f"{BACKEND_URL}/api/analyze", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        assert response.status_code != 200, "Server accepted empty API key"
        print("✅ Missing API key test passed")
        return True
    except Exception as e:
        print(f"❌ Missing API key test failed: {str(e)}")
        return False

def run_all_tests():
    """Run all tests and return overall result"""
    print("Starting backend API tests...")
    
    tests = [
        ("Health Check", test_health_check),
        ("Analyze Endpoint", test_analyze_endpoint),
        ("Get Analyses", test_get_analyses),
        ("Error Handling", test_error_handling)
    ]
    
    results = {}
    all_passed = True
    
    for name, test_func in tests:
        print(f"\n{'=' * 50}")
        print(f"Running {name} Test")
        print(f"{'=' * 50}")
        
        result = test_func()
        results[name] = result
        if not result:
            all_passed = False
    
    print("\n\n=== TEST SUMMARY ===")
    for name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{name}: {status}")
    
    if all_passed:
        print("\n🎉 All tests passed successfully!")
        return 0
    else:
        print("\n❌ Some tests failed. See details above.")
        return 1

if __name__ == "__main__":
    sys.exit(run_all_tests())