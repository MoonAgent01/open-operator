"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import WebUIToggle from "../components/WebUIToggle";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <Link 
            href="/" 
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
          >
            Back to Home
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="max-w-lg mx-auto">
            <WebUIToggle />
            
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-medium text-blue-800 mb-2">About WebUI Integration</h3>
              <p className="text-sm text-blue-600">
                This integration allows Open Operator to connect to a running WebUI instance.
                Make sure you have WebUI running (port 7788) and the Bridge Server running (port 7789).
              </p>
              <div className="mt-3 text-sm">
                <h4 className="font-medium text-blue-700">Required Components:</h4>
                <ul className="list-disc pl-5 text-blue-600 mt-1">
                  <li>WebUI running on port 7788</li>
                  <li>Bridge Server running on port 7789</li>
                  <li>.env.local with NEXT_PUBLIC_API_URL set to the bridge server URL</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
