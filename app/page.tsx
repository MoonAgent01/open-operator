"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import ChatFeed from "./components/ChatFeed";
import AnimatedButton from "./components/AnimatedButton";
import Image from "next/image";
import posthog from "posthog-js";
import { useAtom } from "jotai";
// Import the correct atom and enum
import { browserTypeAtom, BrowserType } from "./atoms";

const Tooltip = ({ children, text }: { children: React.ReactNode; text: string }) => {
  return (
    <div className="relative group">
      {children}
      <span className="absolute hidden group-hover:block w-auto px-3 py-2 min-w-max left-1/2 -translate-x-1/2 translate-y-3 bg-gray-900 text-white text-xs rounded-md font-ppsupply">
        {text}
      </span>
    </div>
  );
};

export default function Home() {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  // Use the correct atom
  const [browserType, setBrowserType] = useAtom(browserTypeAtom);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const form = document.querySelector("form") as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        }
      }

      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector(
          'input[name="message"]'
        ) as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }

      if (isChatVisible && e.key === "Escape") {
        e.preventDefault();
        setIsChatVisible(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChatVisible]);

  const startChat = useCallback(
    (finalMessage: string) => {
      setInitialMessage(finalMessage);
      setIsChatVisible(true);

      try {
        posthog.capture("submit_message", {
          message: finalMessage,
        });
      } catch (e) {
        console.error(e);
      }
    },
    [setInitialMessage, setIsChatVisible]
  );

  return (
    <AnimatePresence mode="wait">
      {!isChatVisible ? (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <nav className="flex justify-between items-center px-8 py-4 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon.svg"
                alt="Open Operator"
                className="w-8 h-8"
                width={32}
                height={32}
              />
              <span className="font-ppsupply text-gray-900">Open Operator</span>
            </div>
            <div className="flex items-center gap-4">
              {/* Restore the original dropdown selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-ppsupply text-gray-500">Browser:</span>
                <select
                  className="ml-2 px-3 py-1.5 text-sm font-ppsupply text-gray-700 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF3B00] focus:border-transparent"
                  value={browserType} // Use browserType state
                  onChange={(e) => setBrowserType(e.target.value as BrowserType)} // Update browserType state
                >
                  {/* Use enum members for values */}
                  <option value={BrowserType.Browserbase}>Browserbase</option>
                  <option value={BrowserType.Native}>Native Browser</option>
                </select>
              </div>

              <a
                href="https://github.com/browserbase/open-operator"
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700"
              >
                <Image
                  src="/github.svg"
                  alt="GitHub"
                  width={20}
                  height={20}
                />
              </a>
            </div>
          </nav>

          <main className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-[640px] bg-white border border-gray-200 shadow-sm">
              <div className="w-full h-12 bg-white border-b border-gray-200 flex items-center px-4">
                <div className="flex items-center gap-2">
                  <Tooltip text="why would you want to close this?">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                  </Tooltip>
                  <Tooltip text="s/o to the 🅱️rowserbase devs">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  </Tooltip>
                  <Tooltip text="@pk_iv was here">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </Tooltip>
                </div>
              </div>

              <div className="p-8 flex flex-col items-center gap-8">
                <div className="flex flex-col items-center gap-3">
                  <h1 className="text-2xl font-ppneue text-gray-900 text-center">
                    Open Operator
                  </h1>
                  <p className="text-base font-ppsupply text-gray-500 text-center">
                    Hit run to watch AI browse the web.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const input = e.currentTarget.querySelector(
                          'input[name="message"]'
                        ) as HTMLInputElement;
                        const message = (formData.get("message") as string).trim();
                        const finalMessage = message || input.placeholder;

                        // No need to manually set sessionStorage, atomWithStorage handles it
                        // sessionStorage.setItem("browserType", browserType);

                        startChat(finalMessage);
                  }}
                  className="w-full max-w-[720px] flex flex-col items-center gap-3"
                >
                  <div className="relative w-full">
                    <input
                      name="message"
                      type="text"
                      placeholder="What's the price of NVIDIA stock?"
                      className="w-full px-4 py-3 pr-[100px] border border-gray-200 text-gray-9
00 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF3B00] focus:border-transparent font-ppsupply"
                    />
                    <AnimatedButton type="submit">Run</AnimatedButton>
                  </div>
                </form>
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    onClick={() =>
                      startChat(
                        "Who is the top GitHub contributor to Stagehand by Browserbase?"
                      )
                    }
                    className="p-3 text-sm text-gray-600 border border-gray-200 hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply text-left"
                  >
                    Who is the top contributor to Stagehand?
                  </button>
                  <button
                    onClick={() =>
                      startChat("How many wins do the 49ers have?")
                    }
                    className="p-3 text-sm text-gray-600 border border-gray-200 hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply text-left"
                  >
                    How many wins do the 49ers have?
                  </button>
                  <button
                    onClick={() => startChat("What is Stephen Curry's PPG?")}
                    className="p-3 text-sm text-gray-600 border border-gray-200 hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply text-left"
                  >
                    What is Stephen Curry's PPG?
                  </button>
                  <button
                    onClick={() => startChat("How much is NVIDIA stock?")}
                    className="p-3 text-sm text-gray-600 border border-gray-200 hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply text-left"
                  >
                    How much is NVIDIA stock?
                  </button>
                </div>
              </div>
            </div>
            <p className="text-base font-ppsupply text-center mt-8">
              Powered by{" "}
              <a
                href="https://stagehand.dev"
                className="text-yellow-600 hover:underline"
              >
                🤘 Stagehand
              </a>{" "}
              on{" "}
              <a
                href="https://browserbase.com"
                className="text-[#FF3B00] hover:underline"
              >
                🅱️ Browserbase
              </a>
              .
            </p>
          </main>
        </div>
      ) : (
        <ChatFeed
          initialMessage={initialMessage}
          onClose={() => setIsChatVisible(false)}
        />
      )}
    </AnimatePresence>
  );
}
