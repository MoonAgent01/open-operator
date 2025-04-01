"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useWindowSize } from "usehooks-ts";
import Image from "next/image";
import { useAtom } from "jotai/react";
// Import BrowserType and browserTypeAtom
import { contextIdAtom, BrowserType, browserTypeAtom } from "../atoms";
import posthog from "posthog-js";
interface ChatFeedProps {
  initialMessage?: string;
  onClose: () => void;
  url?: string;
}

export interface BrowserStep {
  text: string;
  reasoning: string;
  tool: "GOTO" | "ACT" | "EXTRACT" | "OBSERVE" | "CLOSE" | "WAIT" | "NAVBACK";
  instruction: string;
  stepNumber?: number;
}

interface AgentState {
  sessionId: string | null;
  sessionUrl: string | null;
  steps: BrowserStep[];
  isLoading: boolean;
}

export default function ChatFeed({ initialMessage, onClose }: ChatFeedProps) {
  const [isLoading, setIsLoading] = useState(false);
  // Add state for initialization errors
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;
  const initializationRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAgentFinished, setIsAgentFinished] = useState(false);
  const [contextId, setContextId] = useAtom(contextIdAtom);
  // Use browserTypeAtom
  const [browserType] = useAtom(browserTypeAtom);
  const agentStateRef = useRef<AgentState>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
    isLoading: false,
  });

  const [uiState, setUiState] = useState<{
    sessionId: string | null;
    sessionUrl: string | null;
    steps: BrowserStep[];
  }>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
  });

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (
      uiState.steps.length > 0 &&
      uiState.steps[uiState.steps.length - 1].tool === "CLOSE"
    ) {
      setIsAgentFinished(true);
      fetch("/api/session", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: uiState.sessionId,
        }),
      });
    }
  }, [uiState.sessionId, uiState.steps]);

  useEffect(() => {
    scrollToBottom();
  }, [uiState.steps, scrollToBottom]);

  // Add browserType, contextId, setContextId to dependency array
  useEffect(() => {
    console.log("[ChatFeed] useEffect triggered. Initializing session..."); // Add log
    const initializeSession = async () => {
      // Prevent double initialization
      if (initializationRef.current) {
        console.log("[ChatFeed] Initialization already attempted."); // Add log
        return;
      }
      initializationRef.current = true;
      console.log(`[ChatFeed] Initial message: ${initialMessage}, Current session ID: ${agentStateRef.current.sessionId}`); // Add log

      if (initialMessage && !agentStateRef.current.sessionId) {
        console.log("[ChatFeed] Conditions met for session creation."); // Add log
        // Determine browser type from atom
        // const useBrowserbase = browserType === BrowserType.Browserbase;
        // Note: We send browserType directly now to the API route

        setIsLoading(true);
        try {
              console.log(`[ChatFeed] Creating session with browser type: ${browserType}`);
              console.log("[ChatFeed] Sending request to /api/session...");
              const sessionResponse = await fetch("/api/session", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  contextId: contextId,
                  browserType: browserType,
                  settings: {
                    useBrowserbase: browserType === BrowserType.Browserbase,
                    browserType: browserType, // Pass the actual enum value for logging
                    browserSettings: {
                      headless: false,
                      useExistingBrowser: false,
                      keepBrowserOpen: true,
                      keepBrowserOpenBetweenTasks: true,
                      windowSize: { width: 1366, height: 768 },
                      showBrowser: true
                    }
                  }
                }),
              });
          const sessionData = await sessionResponse.json();
          console.log("[ChatFeed] Received response from /api/session:", sessionData); // Add log

          if (!sessionData.success) {
            console.error("[ChatFeed] /api/session call failed:", sessionData.error); // Add log
            throw new Error(sessionData.error || "Failed to create session");
          }

          setContextId(sessionData.contextId);

          agentStateRef.current = {
            ...agentStateRef.current,
            sessionId: sessionData.sessionId,
            sessionUrl: sessionData.sessionUrl.replace(
              "https://www.browserbase.com/devtools-fullscreen/inspector.html",
              "https://www.browserbase.com/devtools-internal-compiled/index.html"
            ),
          };

          setUiState({
            sessionId: sessionData.sessionId,
            sessionUrl: sessionData.sessionUrl.replace(
              "https://www.browserbase.com/devtools-fullscreen/inspector.html",
              "https://www.browserbase.com/devtools-internal-compiled/index.html"
            ),
            steps: [],
          });

          const response = await fetch("/api/agent", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              goal: initialMessage,
              sessionId: sessionData.sessionId,
              action: "START",
            }),
          });

          const data = await response.json();
          console.log("[ChatFeed] Agent response:", data);

          if (!data.success) {
            throw new Error(data.error || "Agent request failed");
          }
          posthog.capture("agent_start", {
            goal: initialMessage,
            sessionId: sessionData.sessionId,
            contextId: sessionData.contextId,
          });

          if (data.success) {
            const newStep = {
              text: data.result.text,
              reasoning: data.result.reasoning,
              tool: data.result.tool,
              instruction: data.result.instruction,
              stepNumber: 1,
            };

            agentStateRef.current = {
              ...agentStateRef.current,
              steps: [newStep],
            };

            setUiState((prev) => ({
              ...prev,
              steps: [newStep],
            }));

            // Set a hard limit on maximum steps to prevent infinite loops
            const MAX_STEPS = 15;
            let stepCount = 0;
            
            // Continue with subsequent steps (with hard limits)
            while (stepCount < MAX_STEPS) {
              stepCount++;
              console.log(`Executing step ${stepCount}/${MAX_STEPS}`);
              
              // Get next step from LLM
              const nextStepResponse = await fetch("/api/agent", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  goal: initialMessage,
                  sessionId: sessionData.sessionId,
                  previousSteps: agentStateRef.current.steps,
                  action: "GET_NEXT_STEP",
                }),
              });

              const nextStepData = await nextStepResponse.json();

              if (!nextStepData.success) {
                console.error("Failed to get next step:", nextStepData.error || "Unknown error");
                
                // Add error as a step instead of throwing
                const errorStep = {
                  text: "Error occurred",
                  reasoning: `Failed to get next step: ${nextStepData.error || "Unknown error"}`,
                  tool: "CLOSE" as const,
                  instruction: "Ending session due to error",
                  stepNumber: agentStateRef.current.steps.length + 1,
                };
                
                agentStateRef.current = {
                  ...agentStateRef.current,
                  steps: [...agentStateRef.current.steps, errorStep],
                };
                
                setUiState((prev) => ({
                  ...prev,
                  steps: agentStateRef.current.steps,
                }));
                
                break;
              }

              // Add the next step to UI immediately after receiving it
              const nextStep = {
                ...nextStepData.result,
                stepNumber: agentStateRef.current.steps.length + 1,
              };

              agentStateRef.current = {
                ...agentStateRef.current,
                steps: [...agentStateRef.current.steps, nextStep],
              };

              setUiState((prev) => ({
                ...prev,
                steps: agentStateRef.current.steps,
              }));

              // Break after adding the CLOSE step to UI or when task is marked as done
              if (nextStepData.done || 
                  nextStepData.result.tool === "CLOSE" || 
                  (nextStepData.result.text && (
                    nextStepData.result.text.toLowerCase().includes('complet') ||
                    nextStepData.result.text.toLowerCase().includes('already')
                  ))) {
                console.log("Task completed, breaking execution loop");
                
                // If the step doesn't have tool=CLOSE, add a proper CLOSE step to ensure UI shows completion
                if (nextStepData.result.tool !== "CLOSE") {
                  const closeStep = {
                    text: "Task completed successfully",
                    reasoning: "All requested operations have been completed",
                    tool: "CLOSE" as const, 
                    instruction: "Session is now closed",
                    stepNumber: agentStateRef.current.steps.length + 1,
                  };
                  
                  agentStateRef.current = {
                    ...agentStateRef.current,
                    steps: [...agentStateRef.current.steps, closeStep],
                  };
                  
                  setUiState((prev) => ({
                    ...prev,
                    steps: agentStateRef.current.steps,
                  }));
                }
                
                break;
              }

              // Execute the step
              const executeResponse = await fetch("/api/agent", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  sessionId: sessionData.sessionId,
                  step: nextStepData.result,
                  action: "EXECUTE_STEP",
                }),
              });

              const executeData = await executeResponse.json();

              posthog.capture("agent_execute_step", {
                goal: initialMessage,
                sessionId: sessionData.sessionId,
                contextId: sessionData.contextId,
                step: nextStepData.result,
              });

              if (!executeData.success) {
                throw new Error("Failed to execute step");
              }

              if (executeData.done) {
                break;
              }
            }
          }
        } catch (error: any) { // Catch specific error
          console.error("Session initialization error:", error);
          // Set the error state
          setInitializationError(`Failed to initialize session: ${error.message}`);
        } finally {
          setIsLoading(false);
        }
      }
    };

    initializeSession();
    // Add dependencies to the array
  }, [initialMessage, browserType, contextId, setContextId]);

  // Spring configuration for smoother animations
  const springConfig = {
    type: "spring",
    stiffness: 350,
    damping: 30,
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        ...springConfig,
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  const messageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div
      className="min-h-screen bg-gray-50 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    exit="exit"
  >
    {/* Display error message if initialization failed */}
    {initializationError && (
       <div className="p-4 m-4 bg-red-100 border border-red-400 text-red-700 rounded">
         <p className="font-bold">Initialization Error</p>
         <p>{initializationError}</p>
         <button
           onClick={onClose}
           className="mt-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
         >
           Close
         </button>
       </div>
    )}

    {/* Only render the rest if no error occurred */}
    {!initializationError && (
      <>
        <motion.nav
          className="flex justify-between items-center px-8 py-4 bg-white border-b border-gray-200 shadow-sm"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <Image
            src="/favicon.svg"
            alt="Open Operator"
            className="w-8 h-8"
            width={32}
            height={32}
          />
          <span className="font-ppneue text-gray-900">Open Operator</span>
        </div>
        <motion.button
          onClick={onClose}
          className="px-4 py-2 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors rounded-md font-ppsupply flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Close
          {!isMobile && (
            <kbd className="px-2 py-1 text-xs bg-gray-100 rounded-md">ESC</kbd>
          )}
        </motion.button>
      </motion.nav>
      <main className="flex-1 flex flex-col items-center p-6">
        <motion.div
          className="w-full max-w-[1280px] bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="w-full h-12 bg-white border-b border-gray-200 flex items-center px-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
          </div>

          {(() => {
            console.log("Session URL:", uiState.sessionUrl);
            return null;
          })()}

          <div className="flex flex-col md:flex-row">
            {uiState.sessionUrl && !isAgentFinished && (
              <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-gray-200 order-first md:order-last">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full aspect-video"
                >
                  <iframe
                    src={uiState.sessionUrl}
                    className="w-full h-full"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    title="Browser Session"
                  />
                </motion.div>
              </div>
            )}

            {isAgentFinished && (
              <div className="flex-1 p-6 border-b md:border-b-0 md:border-l border-gray-200 order-first md:order-last">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full aspect-video"
                >
                  <div className="w-full h-full border border-gray-200 rounded-lg flex items-center justify-center">
                    <p className="text-gray-500 text-center">
                      The agent has completed the task
                      <br />
                      &quot;{initialMessage}&quot;
                    </p>
                  </div>
                </motion.div>
              </div>
            )}

            <div className="md:w-[400px] p-6 min-w-0 md:h-[calc(56.25vw-3rem)] md:max-h-[calc(100vh-12rem)]">
              <div
                ref={chatContainerRef}
                className="h-full overflow-y-auto space-y-4"
              >
                {initialMessage && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 bg-blue-50 rounded-lg font-ppsupply"
                  >
                    <p className="font-semibold">Goal:</p>
                    <p>{initialMessage}</p>
                  </motion.div>
                )}

                {uiState.steps.map((step, index) => (
                  <motion.div
                    key={index}
                    variants={messageVariants}
                    className="p-4 bg-white border border-gray-200 rounded-lg font-ppsupply space-y-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">
                        Step {step.stepNumber}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {step.tool}
                      </span>
                    </div>
                    <p className="font-medium">{step.text}</p>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Reasoning: </span>
                      {step.reasoning}
                    </p>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 bg-gray-50 rounded-lg font-ppsupply animate-pulse"
                  >
                    Processing...
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
      {/* Remove the extra closing main tag */}
      </>
    )}
    </motion.div>
  );
}
