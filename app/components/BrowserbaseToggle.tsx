"use client";

import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { useWebuiBrowserAtom } from "../atoms";

export default function BrowserbaseToggle() {
  const [useWebuiBrowser, setUseWebuiBrowser] = useAtom(useWebuiBrowserAtom);
  const [isWebUIAvailable, setIsWebUIAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isBrowserbaseAvailable, setIsBrowserbaseAvailable] = useState(false);

  useEffect(() => {
    // Check if WebUI and Browserbase are available
    const checkAvailability = async () => {
      try {
        setIsChecking(true);
        
        try {
          // Check if bridge server is running
          const bridgeResponse = await fetch("http://localhost:7789/health", {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          });
          
          if (bridgeResponse.ok) {
            // Bridge server is available, now check WebUI
            try {
              const webuiResponse = await fetch("http://localhost:7788/", {
                method: "GET",
                headers: { "Accept": "text/html" },
                mode: "no-cors" // This might be needed for cross-origin requests
              });
              
              // If we get here, WebUI is likely available
              setIsWebUIAvailable(true);
              console.log("WebUI appears to be available");
              
              // Also check Browserbase availability
              try {
                const browserbaseResponse = await fetch("http://localhost:7789/browserbase/health");
                if (browserbaseResponse.ok) {
                  const data = await browserbaseResponse.json();
                  setIsBrowserbaseAvailable(data.available);
                  console.log("Browserbase availability:", data.available);
                }
              } catch (e) {
                console.log("Could not check Browserbase availability");
                setIsBrowserbaseAvailable(false);
              }
            } catch (e) {
              console.log("WebUI doesn't appear to be available");
              setIsWebUIAvailable(false);
            }
          } else {
            console.log("Bridge server is not available");
            setIsWebUIAvailable(false);
            setIsBrowserbaseAvailable(false);
          }
        } catch (error) {
          console.log("Error checking availability");
          setIsWebUIAvailable(false);
          setIsBrowserbaseAvailable(false);
        }
      } catch (error) {
        console.error("Failed to check availability:", error);
        setIsWebUIAvailable(false);
        setIsBrowserbaseAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAvailability();
    
    // Load saved preferences from sessionStorage
    const savedUseWebUI = sessionStorage.getItem("useWebuiBrowser");
    if (savedUseWebUI !== null) {
      setUseWebuiBrowser(savedUseWebUI === "true");
    }
  }, [setUseWebuiBrowser]);

  const toggleWebUIBrowser = () => {
    const newValue = !useWebuiBrowser;
    setUseWebuiBrowser(newValue);
    sessionStorage.setItem("useWebuiBrowser", String(newValue));
  };

  return (
    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
      <h2 className="text-lg font-medium mb-4">Browser Mode</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>WebUI Browser:</span>
          {isChecking ? (
            <span className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-800">
              Checking...
            </span>
          ) : (
            <span 
              className={`px-2 py-1 rounded text-sm ${
                isWebUIAvailable ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {isWebUIAvailable ? "Available" : "Not Available"}
            </span>
          )}
        </div>

        <div className="flex items-center mt-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={useWebuiBrowser}
              onChange={toggleWebUIBrowser}
              disabled={!isWebUIAvailable || isChecking}
            />
            <div className={`relative w-11 h-6 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 
                           rounded-full peer ${useWebuiBrowser ? 'bg-blue-600' : 'bg-gray-200'} 
                           peer-disabled:bg-gray-300 peer-disabled:cursor-not-allowed
                           after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                           after:bg-white after:border-gray-300 after:border after:rounded-full 
                           after:h-5 after:w-5 after:transition-all ${useWebuiBrowser ? 'after:translate-x-full' : ''}`}>
            </div>
            <span className="ml-3 text-sm font-medium text-gray-900">
              Use WebUI Browser
            </span>
          </label>
        </div>

        {useWebuiBrowser && isWebUIAvailable && (
          <div className="mt-2 text-sm text-gray-600">
            <p>Using WebUI for browser operations. {isBrowserbaseAvailable ? "Enhanced features like stealth mode are available." : ""}</p>
          </div>
        )}

        {!isWebUIAvailable && (
          <div className="mt-2 text-sm text-amber-600">
            <p>WebUI is not available. Make sure it's running on port 7788.</p>
          </div>
        )}
        
        {isBrowserbaseAvailable && (
          <div className="mt-2 text-sm text-green-600">
            <p>Enhanced browser features detected and will be used automatically when WebUI Browser is enabled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
