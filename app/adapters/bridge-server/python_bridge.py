#!/usr/bin/env python3
"""
Python Bridge for Open Operator

This script provides a bridge between the Node.js server and the Web UI Python backend.
It handles commands passed from the bridge server and communicates with Web UI.
"""

import sys
import json
import argparse
import http.client
import urllib.parse
import os

WEBUI_PORT = os.environ.get('WEBUI_PORT', '7788')

def send_webui_request(path, data=None, method="GET"):
    """Send a request to the Web UI backend."""
    conn = http.client.HTTPConnection(f"localhost:{WEBUI_PORT}")
    headers = {"Content-Type": "application/json"}
    
    if method == "GET" and data:
        path = f"{path}?{urllib.parse.urlencode(data)}"
        conn.request(method, path, headers=headers)
    else:
        conn.request(method, path, json.dumps(data) if data else None, headers=headers)
    
    try:
        response = conn.getresponse()
        result = response.read().decode()
        return json.loads(result) if result else {}
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

def health_check():
    """Check if Web UI is running and return health status."""
    try:
        result = send_webui_request("/health")
        return {
            "success": True,
            "status": "active" if result.get("status") == "ok" else "inactive",
            "message": "Web UI is running"
        }
    except Exception as e:
        return {
            "success": False,
            "status": "inactive",
            "error": str(e),
            "message": "Web UI is not running"
        }

def run_agent(args):
    """Run an agent task in Web UI."""
    try:
        data = {
            "task": args.get("task", ""),
            "sessionId": args.get("sessionId", "")
        }
        result = send_webui_request("/api/run_agent", data, "POST")
        
        if "error" in result:
            return {
                "success": False,
                "error": result["error"]
            }
        
        return {
            "success": True,
            "result": result.get("result", ""),
            "output": result.get("output", ""),
            "thinking": result.get("thinking", "")
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def execute_step(args):
    """Execute a browser step using gradio_bridge.py and the Gradio client."""
    try:
        step = args.get("step", {})
        task = args.get("task", "")
        
        # Import subprocess to run gradio_bridge.py
        import subprocess
        import os
        
        # Path to gradio_bridge.py
        gradio_bridge_path = os.path.join(os.path.dirname(__file__), "gradio_bridge.py")
        
        # Run gradio_bridge.py with 'execute_step' command
        command = [
            sys.executable,  # Use the same Python interpreter
            gradio_bridge_path,
            "execute_step",
            json.dumps({
                "tool": step.get("tool", ""),
                "args": step.get("args", {}),
                "text": step.get("text", ""),
                "task": task
            })
        ]
        
        # Execute the command
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False
        )
        
        # Parse the output
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": f"Failed to parse gradio_bridge.py output: {result.stdout}",
                "stderr": result.stderr
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    parser = argparse.ArgumentParser(description="Python Bridge for Open Operator")
    parser.add_argument("command", help="Command to execute")
    parser.add_argument("args", nargs="?", default="{}", help="JSON arguments for the command")
    
    args = parser.parse_args()
    command = args.command
    arguments = json.loads(args.args)
    
    # Execute command
    if command == "health":
        result = health_check()
    elif command == "run_agent":
        result = run_agent(arguments)
    elif command == "execute_step":
        result = execute_step(arguments)
    else:
        result = {
            "success": False,
            "error": f"Unknown command: {command}"
        }
    
    # Output result as JSON
    print(json.dumps(result))

if __name__ == "__main__":
    main()
