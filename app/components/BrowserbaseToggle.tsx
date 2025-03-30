"use client";

import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { useBrowserbaseAtom } from "../atoms";

export default function BrowserbaseToggle() {
  const [useBrowserbase, setUseBrowserbase] = useAtom(useBrowserbaseAtom);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if Browserbase is available
    const checkBrowserbase = async () => {
      try {
        setIsChecking(true);
        
        try {
          // Check if Browserbase is available through the bridge server
          const response = await fetch("http://localhost:7789/browserbase/health", {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          });
          
          if (response.ok) {
            // Process the Browserbase health response
            const data = await response.json();
            setIsAvailable(data.available);
            console.log("Browserbase availability check:", data);
          } else {
            console.log("Browserbase health endpoint not available, checking adapter existence");
            
            // Fallback: Just check if the bridge server is running
            const bridgeResponse = await fetch("http://localhost:7789/health");
            
            if (bridgeResponse.ok) {
              console.log("Bridge server is available, assuming Browserbase might be available");
              setIsAvailable(true);
            } else {
              console.log("Bridge server is not available");
              setIsAvailable(false);
            }
          }
        } catch (error) {
          console.log("Error checking availability, assuming Browserbase is not available");
          setIsAvailable(false);
        }
      } catch (error) {
        console.error("Failed to check Browserbase availability:", error);
        setIsAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkBrowserbase();
    
    // Load saved preferences from localStorage
    const savedUseBrowserbase = localStorage.getItem("use_browserbase");
    if (savedUseBrowserbase !== null) {
      setUseBrowserbase(savedUseBrowserbase === "true");
    }
  }, [setUseBrowserbase]);

  const toggleBrowserbase = () => {
    const newValue = !useBrowserbase;
    setUseBrowserbase(newValue);
    localStorage.setItem("use_browserbase", String(newValue));
  };

  return (
    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
      <h2 className="text-lg font-medium mb-4">Browserbase Integration</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Browserbase Status:</span>
          {isChecking ? (
            <span className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-800">
              Checking...
            </span>
          ) : (
            <span 
              className={`px-2 py-1 rounded text-sm ${
                isAvailable ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {isAvailable ? "Available" : "Not Available"}
            </span>
          )}
        </div>

        <div className="flex items-center mt-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={useBrowserbase}
              onChange={toggleBrowserbase}
              disabled={!isAvailable || isChecking}
            />
            <div className={`relative w-11 h-6 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 
                           rounded-full peer ${useBrowserbase ? 'bg-blue-600' : 'bg-gray-200'} 
                           peer-disabled:bg-gray-300 peer-disabled:cursor-not-allowed
                           after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                           after:bg-white after:border-gray-300 after:border after:rounded-full 
                           after:h-5 after:w-5 after:transition-all ${useBrowserbase ? 'after:translate-x-full' : ''}`}>
            </div>
            <span className="ml-3 text-sm font-medium text-gray-900">
              Use Browserbase
            </span>
          </label>
        </div>

        {useBrowserbase && isAvailable && (
          <div className="mt-2 text-sm text-gray-600">
            <p>Using Browserbase for browser operations. This provides enhanced stealth mode and CAPTCHA solving capabilities.</p>
          </div>
        )}

        {!isAvailable && (
          <div className="mt-2 text-sm text-amber-600">
            <p>Browserbase adapter not found. Make sure the adapter is installed and the bridge server is running.</p>
          </div>
        )}
      </div>
    </div>
  );
}
