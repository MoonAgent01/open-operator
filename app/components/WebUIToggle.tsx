"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { webuiClient } from "../lib/webui-client";

export default function WebUIToggle() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [webUIPort, setWebUIPort] = useState("7788");
  const [bridgePort, setBridgePort] = useState("7789");
  const router = useRouter();

  useEffect(() => {
    // Check if already connected on component mount
    const checkConnection = async () => {
      try {
        await webuiClient.healthCheck();
        setIsConnected(true);
        setConnectionError("");
      } catch (error) {
        setIsConnected(false);
      }
    };

    checkConnection();
    
    // Load saved ports from localStorage
    const savedWebUIPort = localStorage.getItem("webui_port");
    if (savedWebUIPort) setWebUIPort(savedWebUIPort);
    
    const savedBridgePort = localStorage.getItem("bridge_port");
    if (savedBridgePort) setBridgePort(savedBridgePort);
  }, []);

  const toggleConnection = async () => {
    if (isConnected) {
      setIsConnected(false);
      return;
    }

    setIsConnecting(true);
    setConnectionError("");

    try {
      localStorage.setItem("webui_port", webUIPort);
      localStorage.setItem("bridge_port", bridgePort);
      
      await webuiClient.healthCheck();
      setIsConnected(true);
    } catch (error) {
      console.error("Connection error:", error);
      setConnectionError("Failed to connect to WebUI. Make sure WebUI and Bridge Server are running.");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <h2 className="text-lg font-medium mb-4">WebUI Integration</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Connection Status:</span>
          <span 
            className={`px-2 py-1 rounded text-sm ${
              isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">
            WebUI Port
            <input
              type="text"
              value={webUIPort}
              onChange={(e) => setWebUIPort(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              disabled={isConnected || isConnecting}
            />
          </label>
          
          <label className="block text-sm">
            Bridge Server Port
            <input
              type="text"
              value={bridgePort}
              onChange={(e) => setBridgePort(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              disabled={isConnected || isConnecting}
            />
          </label>
        </div>

        {connectionError && (
          <div className="text-red-600 text-sm py-1">{connectionError}</div>
        )}

        <button
          onClick={toggleConnection}
          disabled={isConnecting}
          className={`w-full py-2 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isConnected
              ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100 focus:ring-red-500"
              : "border-green-300 text-green-700 bg-green-50 hover:bg-green-100 focus:ring-green-500"
          }`}
        >
          {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect to WebUI"}
        </button>

        {isConnected && (
          <div className="text-xs text-gray-500">
            WebUI is accessible at: http://localhost:{webUIPort}
            <br />
            Bridge Server is running on port: {bridgePort}
          </div>
        )}
      </div>
    </div>
  );
}
