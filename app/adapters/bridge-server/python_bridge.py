import os
import sys
import json
import requests

def health():
    """Check WebUI health"""
    try:
        response = requests.get("http://localhost:7788/health_check")
        response.raise_for_status()
        webui_data = response.json()
        
        print("Web UI URL: http://localhost:7788", file=sys.stderr)
        
        # Check for settings
        settings_path = os.path.join("D:\\AI Agent\\AI Agent\\web-ui\\tmp\\webui_settings")
        print(f"Checking settings path: {settings_path}", file=sys.stderr)
        
        model_info = {}
        api_key = None
        
        # Look for settings files
        if os.path.exists(settings_path):
            import pickle
            for filename in os.listdir(settings_path):
                if filename.endswith(".pkl"):
                    filepath = os.path.join(settings_path, filename)
                    print(f"Examining file: {filepath}", file=sys.stderr)
                    try:
                        with open(filepath, 'rb') as f:
                            data = pickle.load(f)
                            if isinstance(data, dict):
                                print(f"File contains dictionary with keys: {list(data.keys())}", file=sys.stderr)
                                if 'llm_api_key' in data:
                                    api_key = data['llm_api_key']
                                    if api_key:
                                        print(f"API key found! First 5 chars: {api_key[:5]}", file=sys.stderr)
                                
                                if 'llm_provider' in data and 'llm_model_name' in data:
                                    model_info = {
                                        'llm_provider': data['llm_provider'],
                                        'llm_model_name': data['llm_model_name']
                                    }
                                    print(f"Using LLM provider: {model_info['llm_provider']}, model: {model_info['llm_model_name']}", file=sys.stderr)
                            break
                    except Exception as e:
                        print(f"Error loading settings: {e}", file=sys.stderr)
        
        if api_key:
            print(f"API key loaded: {api_key[:5]}...{api_key[-4:]}", file=sys.stderr)
        
        return {
            "success": True,
            "status": "ok",
            "endpoints": list(range(11)),
            "config": {
                "llm_provider": model_info.get('llm_provider', 'openai'),
                "llm_model_name": model_info.get('llm_model_name', 'gpt-4o'),
                "has_api_key": bool(api_key),
                "web_ui_path": None
            }
        }
    except Exception as e:
        print(f"Error checking WebUI health: {e}", file=sys.stderr)
        return {"success": False, "error": str(e)}

def create_session(context_id, browser_settings=None):
    """Create a new browser session in WebUI"""
    try:
        # Load settings to get API key
        settings_path = os.path.join("D:\\AI Agent\\AI Agent\\web-ui\\tmp\\webui_settings")
        api_key = None
        
        # Look for settings files
        if os.path.exists(settings_path):
            import pickle
            for filename in os.listdir(settings_path):
                if filename.endswith(".pkl"):
                    filepath = os.path.join(settings_path, filename)
                    try:
                        with open(filepath, 'rb') as f:
                            data = pickle.load(f)
                            if isinstance(data, dict) and 'llm_api_key' in data:
                                api_key = data['llm_api_key']
                                break
                    except Exception as e:
                        print(f"Error loading settings: {e}", file=sys.stderr)
        
        if not api_key:
            return {"error": "No API key found"}
        
        print(f"Creating session with API key: {api_key[:5]}...{api_key[-4:]}", file=sys.stderr)
        
        if browser_settings:
            print(f"Using browser settings: {browser_settings}", file=sys.stderr)
        
        # Try to initialize the browser
        try:
            response = requests.post(
                "http://localhost:7788/api/agent/run",
                json={
                    "task": f"Initialize browser for {context_id}",
                    "agent_type": "custom",
                    "llm_provider": "openai",
                    "llm_model_name": "gpt-4o",
                    "llm_api_key": api_key,
                    "use_own_browser": True,
                    "keep_browser_open": True,
                    "headless": False,
                    "disable_security": False
                }
            )
            
            result = response.json()
            if "error" in result:
                print(f"Session creation result: ERROR: {result['error']}", file=sys.stderr)
                return {"error": result["error"]}
            
        except Exception as e:
            print(f"Session creation result: ERROR: [{str(e)}]", file=sys.stderr)
            return {"error": str(e)}
        
        return {"success": True}
        
    except Exception as e:
        print(f"Error creating session: {e}", file=sys.stderr)
        return {"error": str(e)}

def run_agent(task, session_id=None):
    """Run an agent task"""
    try:
        # Load settings to get API key
        settings_path = os.path.join("D:\\AI Agent\\AI Agent\\web-ui\\tmp\\webui_settings")
        api_key = None
        
        # Look for settings files
        if os.path.exists(settings_path):
            import pickle
            for filename in os.listdir(settings_path):
                if filename.endswith(".pkl"):
                    filepath = os.path.join(settings_path, filename)
                    try:
                        with open(filepath, 'rb') as f:
                            data = pickle.load(f)
                            if isinstance(data, dict) and 'llm_api_key' in data:
                                api_key = data['llm_api_key']
                                break
                    except Exception as e:
                        print(f"Error loading settings: {e}", file=sys.stderr)
        
        if not api_key:
            return {"error": "No API key found"}
        
        # Run the agent task through the WebUI API
        response = requests.post(
            "http://localhost:7788/api/agent/run",
            json={
                "task": task,
                "agent_type": "custom",
                "llm_provider": "openai",
                "llm_model_name": "gpt-4o",
                "llm_api_key": api_key,
                "use_own_browser": True,
                "keep_browser_open": True,
                "headless": False,
                "disable_security": False
            }
        )
        
        result = response.json()
        return result
        
    except Exception as e:
        print(f"Error running agent task: {e}", file=sys.stderr)
        return {"error": str(e)}

# Main handler
if __name__ == "__main__":
    command = sys.argv[1]
    args = {}
    
    if len(sys.argv) > 2:
        args = json.loads(sys.argv[2])
    
    result = None
    if command == "health":
        result = health()
    elif command == "create_session":
        result = create_session(args.get("contextId", ""), args.get("browserSettings"))
    elif command == "run_agent":
        result = run_agent(args.get("task", ""), args.get("sessionId"))
    
    print(json.dumps(result))
