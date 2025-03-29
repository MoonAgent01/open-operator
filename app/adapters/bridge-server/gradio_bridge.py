import sys
import json
import os
import time
import pickle
import re
import psutil
from gradio_client import Client
from functools import lru_cache
import threading
import multiprocessing
from contextlib import contextmanager

# Global cache for successful paths
_cached_paths = {}
_cache_lock = threading.Lock()

# Redirect logs to stderr instead of stdout
def log(message):
    print(message, file=sys.stderr)

def validate_api_key(key):
    """Validate OpenAI API key format"""
    if not key:
        return False
    # Basic format check for OpenAI API keys - update to include underscores and longer length
    return bool(re.match(r'^sk-[A-Za-z0-9_-]+', key.strip()))

def read_port_file(service, default_port):
    """Read port from environment or port files"""
    env_port = os.environ.get(f"{service.upper()}_PORT")
    if env_port:
        try:
            return int(env_port)
        except:
            pass
    
    port_files = [
        f".{service.lower()}-port",
        os.path.join(os.getcwd(), f".{service.lower()}-port"),
        os.path.join(os.path.expanduser("~"), "tmp", f"{service.lower()}.port")
    ]
    
    for file in port_files:
        try:
            if os.path.exists(file):
                with open(file, 'r') as f:
                    return int(f.read().strip())
        except:
            continue
    
    return default_port

def _read_pickle_worker(path, queue):
    """Worker process for reading pickle files"""
    try:
        with open(path, 'rb') as f:
            result = pickle.load(f)
            queue.put(result)
    except Exception as e:
        queue.put(e)

@contextmanager
def read_pickle_with_timeout(path, timeout=2):
    """Read pickle file with timeout using multiprocessing"""
    queue = multiprocessing.Queue()
    process = multiprocessing.Process(target=_read_pickle_worker, args=(path, queue))
    process.start()
    
    try:
        result = queue.get(timeout=timeout)
        if isinstance(result, Exception):
            raise result
        yield result
    except multiprocessing.TimeoutError:
        raise TimeoutError(f"Pickle load timed out for {path}")
    finally:
        process.terminate()
        process.join()

def get_user_api_key():
    """Look for API key in user-provided locations"""
    # Check for .api-key file
    api_key_file = os.path.join(os.getcwd(), ".api-key")
    if os.path.exists(api_key_file):
        try:
            with open(api_key_file, 'r') as f:
                api_key = f.read().strip()
                if api_key and not api_key.startswith('#'):
                    if validate_api_key(api_key):
                        log("Using API key from .api-key file")
                        return api_key
                    else:
                        log("Invalid API key format in .api-key file")
        except Exception as e:
            log(f"Error reading API key file: {e}")
    
    return None

@lru_cache(maxsize=1)
def search_web_ui_location():
    """Find the Web UI installation location"""
    # Check cache first
    with _cache_lock:
        if 'web_ui_path' in _cached_paths:
            path = _cached_paths['web_ui_path']
            if os.path.exists(path):
                return path
    
    # Start with the most common locations
    possible_paths = [
        # Add the specific paths
        os.path.join("D:", "New folder (2)", "AI Agent", "web-ui"),
        os.path.join("D:", "AI Agent", "AI Agent", "web-ui"),
        os.path.join("D:", "AI Agent", "web-ui"),
        os.path.join(os.getcwd(), "..", "..", "..", "web-ui"),
        os.path.join(os.getcwd(), "..", "..", "web-ui")
    ]
    
    # Add paths from environment variables
    if "WEB_UI_PATH" in os.environ:
        possible_paths.insert(0, os.environ["WEB_UI_PATH"])
    
    # Look for running Python processes with webui.py
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            if 'python' in proc.info['name'].lower():
                cmd = proc.info['cmdline']
                if cmd and any('webui.py' in c for c in cmd):
                    # Extract the directory containing webui.py
                    for arg in cmd:
                        if 'webui.py' in arg:
                            webui_dir = os.path.dirname(arg)
                            if webui_dir:
                                possible_paths.insert(0, webui_dir)
                            break
    except:
        log("Unable to check running processes")
    
    # Check each path
    for path in possible_paths:
        if os.path.exists(path) and os.path.exists(os.path.join(path, "webui.py")):
            log(f"Found Web UI at {path}")
            # Cache successful path
            with _cache_lock:
                _cached_paths['web_ui_path'] = path 
            return path
    
    return None

def read_api_key_from_webui_settings():
    """Read API key from the Web UI settings directory"""
    settings_paths = [
        r"D:\AI Agent\AI Agent\web-ui\tmp\webui_settings",
        r"D:\New folder (2)\AI Agent\web-ui\tmp\webui_settings"
    ]
    
    for settings_path in settings_paths:
        if not os.path.exists(settings_path):
            log(f"Settings path does not exist: {settings_path}")
            continue
            
        log(f"Checking settings path: {settings_path}")
        for filename in os.listdir(settings_path):
            filepath = os.path.join(settings_path, filename)
            log(f"Examining file: {filepath}")
            
            try:
                with open(filepath, 'rb') as f:
                    try:
                        data = pickle.load(f)
                        if isinstance(data, dict):
                            log(f"File contains dictionary with keys: {list(data.keys())}")
                            if 'llm_api_key' in data:
                                api_key = data['llm_api_key']
                                log(f"API key found! First 5 chars: {api_key[:5]}")
                                return api_key
                    except Exception as e:
                        log(f"Could not load as pickle: {str(e)}")
            except Exception as e:
                log(f"Could not open file: {str(e)}")
    
    log("No API key found in Web UI settings")
    return None

def find_api_key_in_tmp_settings():
    """Look for API key in the tmp/webui_settings directory"""
    # Check both potential web-ui paths
    possible_paths = [
        os.path.join("D:", "AI Agent", "AI Agent", "web-ui", "tmp", "webui_settings"),
        os.path.join("D:", "New folder (2)", "AI Agent", "web-ui", "tmp", "webui_settings"),
        os.path.join("D:", "AI Agent", "web-ui", "tmp", "webui_settings")
    ]
    
    # Also check if we found the web-ui path
    web_ui_path = search_web_ui_location()
    if web_ui_path:
        possible_paths.append(os.path.join(web_ui_path, "tmp", "webui_settings"))
    
    for path in possible_paths:
        if os.path.exists(path):
            log(f"Found tmp settings directory: {path}")
            # Check all files in the directory
            for file in os.listdir(path):
                file_path = os.path.join(path, file)
                try:
                    # Try to read as pickle first with timeout
                    try:
                        log(f"Trying to read {file_path} as pickle")
                        with read_pickle_with_timeout(file_path) as config:
                            if isinstance(config, dict) and 'llm_api_key' in config:
                                api_key = config['llm_api_key']
                                if validate_api_key(api_key):
                                    log(f"Found valid API key in {file_path}: {api_key[:4]}...{api_key[-4:]}")
                                    return api_key
                    except Exception as e:
                        # Try as text file
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                if 'llm_api_key' in content:
                                    log(f"Found potential API key in {file_path}")
                                    # Extract using regex
                                    match = re.search(r'llm_api_key"[^\w]+(sk-[A-Za-z0-9]{48})', content)
                                    if match:
                                        api_key = match.group(1)
                                        if validate_api_key(api_key):
                                            log(f"Found valid API key in text: {api_key[:4]}...{api_key[-4:]}")
                                            return api_key
                        except Exception as inner_e:
                            pass
                except Exception as e:
                    log(f"Error reading {file_path}: {e}")
    
    return None

def find_api_key_in_web_ui():
    """Find API key in Web UI config files and environment"""
    # First, locate the Web UI installation
    web_ui_path = search_web_ui_location()
    if not web_ui_path:
        log("Could not locate Web UI installation")
        return None
    
    # Check for config.yaml in the Web UI directory
    config_yaml = os.path.join(web_ui_path, "config.yaml")
    if os.path.exists(config_yaml):
        try:
            import yaml
            with open(config_yaml, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
                if config and isinstance(config, dict) and 'llm_api_key' in config:
                    api_key = config['llm_api_key']
                    if validate_api_key(api_key):
                        log(f"Found valid API key in {config_yaml}")
                        return api_key
                    else:
                        log("Invalid API key format in config.yaml")
        except Exception as e:
            log(f"Error reading {config_yaml}: {e}")
    
    # Check for .env file in Web UI directory
    env_file = os.path.join(web_ui_path, ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        api_key = line.split('=', 1)[1].strip()
                        if validate_api_key(api_key):
                            log(f"Found valid API key in {env_file}")
                            return api_key
                        else:
                            log("Invalid API key format in .env file")
        except Exception as e:
            log(f"Error reading {env_file}: {e}")
    
    return None

def get_config():
    """Read the saved config file from Web UI"""
    # First try to get API key from webui settings
    api_key = read_api_key_from_webui_settings()
    
    # If not found, try tmp settings
    if not api_key:
        api_key = find_api_key_in_tmp_settings()
    
    # If not found, check user-provided file
    if not api_key:
        api_key = get_user_api_key()
    
    # If not found, check environment variable
    if not api_key:
        api_key = os.environ.get('OPENAI_API_KEY', '')
        if api_key:
            if validate_api_key(api_key):
                log("Using API key from environment variable")
            else:
                log("Invalid API key format in environment variable")
                api_key = None
    
    # If still not found, try Web UI config
    if not api_key:
        api_key = find_api_key_in_web_ui()
        if api_key:
            log(f"Using API key found in Web UI config: {api_key[:4]}...{api_key[-4:]}")
    
    # Look for config files for other settings
    config_paths = [
        os.path.join(os.getcwd(), "config.yaml"),
        os.path.join(os.getcwd(), "config.pkl"),
        os.path.join(os.getcwd(), "..", "..", "web-ui", "config.yaml"),
        os.path.join(os.path.expanduser("~"), ".webui", "config")
    ]
    
    # Check if a config path was provided via command line
    for i, arg in enumerate(sys.argv):
        if arg == "--config" and i < len(sys.argv) - 1:
            config_paths.insert(0, sys.argv[i + 1])
    
    config = {}
    for config_path in config_paths:
        if not os.path.exists(config_path):
            continue
        
        try:
            # Try pickle first with timeout
            if config_path.endswith('.pkl'):
                try:
                    with read_pickle_with_timeout(config_path) as loaded_config:
                        if isinstance(loaded_config, dict):
                            config.update(loaded_config)
                except:
                    pass
            else:
                # Try YAML
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        import yaml
                        loaded_config = yaml.safe_load(f)
                        if isinstance(loaded_config, dict):
                            config.update(loaded_config)
                except:
                    pass
        except Exception as e:
            log(f"Error loading config from {config_path}: {e}")
    
    # Set defaults
    final_config = {
        'llm_provider': config.get('llm_provider', 'openai'),
        'llm_model_name': config.get('llm_model_name', 'gpt-4o'),
        'llm_temperature': config.get('llm_temperature', 0.7),
        'llm_base_url': config.get('llm_base_url', ''),
        'llm_api_key': api_key
    }
    
    return final_config

def main():
    try:
        # Read command line arguments
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "error": "No action specified"}))
            return
        
        # Get the webui port
        webui_port = read_port_file('WEBUI', 7788)
        webui_url = f"http://localhost:{webui_port}"
        log(f"Web UI URL: {webui_url}")
        
        # Load config
        config = get_config()
        api_key = config['llm_api_key']
        llm_provider = config['llm_provider']
        llm_model_name = config['llm_model_name']
        llm_temperature = config['llm_temperature']
        llm_base_url = config['llm_base_url']
        
        log(f"Using LLM provider: {llm_provider}, model: {llm_model_name}")
        if api_key:
            log(f"API key loaded: {api_key[:4]}...{api_key[-4:]}")
        else:
            log("Warning: No API key found")
        
        action = sys.argv[1]
        
        if action == "health":
            try:
                # Check if Web UI is installed and accessible
                web_ui_path = search_web_ui_location()
                
                # Try to connect to Web UI
                client = Client(webui_url, verbose=False)
                endpoints = client.endpoints
                
                print(json.dumps({
                    "success": True,
                    "status": "ok",
                    "endpoints": list(endpoints.keys()) if endpoints else [],
                    "config": {
                        "llm_provider": llm_provider,
                        "llm_model_name": llm_model_name,
                        "has_api_key": bool(api_key),
                        "web_ui_path": web_ui_path
                    }
                }))
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "status": "error",
                    "error": str(e)
                }))
                
        elif action == "create_session":
            args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
            
            # Extract settings
            browser_settings = args.get('browserSettings', {})
            context_id = args.get('contextId', 'open-operator-session')
            window_w = browser_settings.get('windowSize', {}).get('width', 1366)
            window_h = browser_settings.get('windowSize', {}).get('height', 768)
            
            # Override config with args if provided
            api_key = args.get('apiKey', api_key)
            
            if not api_key:
                print(json.dumps({
                    "success": False,
                    "error": "No API key found in config, environment, or arguments"
                }))
                return
            
            try:
                client = Client(webui_url, verbose=False)
                
                # Call the run_with_stream endpoint
                log(f"Creating session with API key: {api_key[:4]}...{api_key[-4:]}")
                log(f"Using browser settings: {browser_settings}")
                
                result = client.predict(
                    "custom",                                    # agent_type
                    llm_provider,                                # llm_provider
                    llm_model_name,                              # llm_model_name
                    llm_temperature,                             # llm_temperature
                    llm_base_url,                                # llm_base_url
                    api_key,                                     # llm_api_key
                    False,                                       # use_own_browser - FALSE to use a separate browser
                    browser_settings.get('keepBrowserOpen', True),    # keep_browser_open
                    False,                                       # headless - FALSE to show the browser window
                    False,                                       # disable_security - DON'T disable security features
                    window_w,                                    # window_w
                    window_h,                                    # window_h
                    "./tmp/record_videos",                       # save_recording_path
                    "./tmp/agent_history",                       # save_agent_history_path
                    "./tmp/traces",                              # save_trace_path
                    False,                                       # enable_recording
                    f"Initialize browser for {context_id}",      # task
                    "",                                          # add_infos - EMPTY STRING
                    1,                                           # max_steps
                    True,                                        # use_vision
                    1,                                           # max_actions_per_step
                    "auto",                                      # tool_calling_method
                    api_name="/run_with_stream"                  # api_name
                )
                
                # Process result
                browser_view = result[0] if len(result) > 0 else ""
                final_result = result[1] if len(result) > 1 else ""
                errors = result[2] if len(result) > 2 else ""
                
                log(f"Session creation result: {'SUCCESS' if not errors else 'ERROR: ' + errors}")
                
                # Generate session ID
                session_id = f"session-{int(time.time())}"
                
                print(json.dumps({
                    "success": True,
                    "sessionId": session_id,
                    "contextId": context_id,
                    "browserView": browser_view,
                    "finalResult": final_result,
                    "errors": errors
                }))
                
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": str(e)
                }))
                
        elif action == "execute_step":
            args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
            
            tool = args.get('tool', 'THINK')
            step_args = args.get('args', {})
            text = args.get('text', '')
            task = args.get('task', '')
            
            if not api_key:
                print(json.dumps({
                    "success": False,
                    "error": "No API key found in config or environment"
                }))
                return
            
            try:
                client = Client(webui_url, verbose=False)
                
                # Call the run_with_stream endpoint
                # Get the use_own_browser flag from args, defaulting to True
                use_own_browser = args.get('use_own_browser', True)
                
                result = client.predict(
                    "custom",                      # agent_type
                    llm_provider,                  # llm_provider
                    llm_model_name,                # llm_model_name
                    llm_temperature,               # llm_temperature
                    llm_base_url,                  # llm_base_url
                    api_key,                       # llm_api_key
                    use_own_browser,               # use_own_browser - TRUE to use Open Operator's browser
                    True,                          # keep_browser_open
                    False,                         # headless - FALSE to show the browser window
                    False,                         # disable_security - DON'T disable security features
                    1366,                          # window_w
                    768,                           # window_h
                    "./tmp/record_videos",         # save_recording_path
                    "./tmp/agent_history",         # save_agent_history_path
                    "./tmp/traces",                # save_trace_path
                    False,                         # enable_recording
                    task,                          # task
                    "",                            # add_infos - EMPTY STRING
                    1,                             # max_steps
                    True,                          # use_vision
                    1,                             # max_actions_per_step
                    "auto",                        # tool_calling_method
                    api_name="/run_with_stream"    # api_name
                )
                
                # Process result
                browser_view = result[0] if len(result) > 0 else ""
                final_result = result[1] if len(result) > 1 else ""
                errors = result[2] if len(result) > 2 else ""
                model_actions = result[3] if len(result) > 3 else ""
                model_thoughts = result[4] if len(result) > 4 else ""
                
                print(json.dumps({
                    "success": True,
                    "browserView": browser_view,
                    "finalResult": final_result,
                    "extraction": final_result,
                    "errors": errors,
                    "actions": model_actions,
                    "thoughts": model_thoughts
                }))
                
            except Exception as e:
                log(f"Error executing step with Gradio client: {e}")
                print(json.dumps({
                    "success": False,
                    "error": str(e)
                }))
                
        elif action == "close_browser":
            try:
                client = Client(webui_url, verbose=False)
                result = client.predict(api_name="/close_global_browser")
                print(json.dumps({
                    "success": True,
                    "result": "Browser closed successfully"
                }))
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": str(e)
                }))
                
        elif action == "get_screenshot":
            try:
                client = Client(webui_url, verbose=False)
                result = client.predict(api_name="/get_screenshot")
                if result and len(result) > 0:
                    screenshot_data = result[0]
                    print(json.dumps({
                        "success": True,
                        "screenshot": screenshot_data
                    }))
                else:
                    print(json.dumps({
                        "success": False,
                        "error": "No screenshot returned"
                    }))
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": str(e)
                }))
                
        elif action == "show_api_key_locations":
            web_ui_path = search_web_ui_location()
            locations = {
                "possible_locations": {
                    "user_file": os.path.join(os.getcwd(), ".api-key"),
                    "web_ui_config": os.path.join(web_ui_path, "config.yaml") if web_ui_path else None,
                    "web_ui_env": os.path.join(web_ui_path, ".env") if web_ui_path else None,
                    "user_config": os.path.join(os.path.expanduser("~"), ".webui", "config"),
                    "web_ui_tmp_settings": os.path.join(web_ui_path, "tmp", "webui_settings") if web_ui_path else None
                },
                "environment_variables": ["OPENAI_API_KEY", "API_KEY", "OPENAI_KEY"],
                "web_ui_path": web_ui_path
            }
            print(json.dumps({
                "success": True,
                "locations": locations
            }))
                
        else:
            print(json.dumps({
                "success": False,
                "error": f"Unknown action: {action}"
            }))
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Script error: {str(e)}"
        }))

if __name__ == "__main__":
    # Initialize multiprocessing for Windows
    multiprocessing.freeze_support()
    main()
