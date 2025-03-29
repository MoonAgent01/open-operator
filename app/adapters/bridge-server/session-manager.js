/**
 * Session Manager for Open Operator and WebUI integration
 * Manages browser sessions between Open Operator and WebUI
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Store active sessions
const activeSessions = new Map();
const tmpDir = path.join(os.tmpdir(), 'open-operator-sessions');

// Ensure temp directory exists
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

/**
 * Create a new session
 * @param {string} sessionId - Session ID
 * @param {object} options - Session options
 * @returns {object} - Session object
 */
function createSession(sessionId, options = {}) {
  const session = {
    id: sessionId,
    contextId: options.contextId || '',
    createdAt: new Date(),
    useOpenOperatorBrowser: options.useOpenOperatorBrowser || false,
    browserInfo: options.browserInfo || null,
    lastActive: Date.now(),
    completedTasks: new Set(), // Track completed tasks to prevent loops
    taskCount: 0, // Counter to prevent infinite loops
    lastTaskTime: Date.now()
  };
  
  activeSessions.set(sessionId, session);
  
  // Write session info to tmp file for other processes
  try {
    const sessionFile = path.join(tmpDir, `${sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  } catch (error) {
    console.error(`[Session Manager] Error writing session file: ${error.message}`);
  }
  
  return session;
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {object|null} - Session object or null if not found
 */
function getSession(sessionId) {
  // First check active sessions map
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.lastActive = Date.now();
    return session;
  }
  
  // If not found, check temp files
  try {
    const sessionFile = path.join(tmpDir, `${sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      activeSessions.set(sessionId, sessionData);
      sessionData.lastActive = Date.now();
      return sessionData;
    }
  } catch (error) {
    console.error(`[Session Manager] Error reading session file: ${error.message}`);
  }
  
  return null;
}

/**
 * Update a session
 * @param {string} sessionId - Session ID
 * @param {object} updates - Session updates
 * @returns {object|null} - Updated session or null if not found
 */
function updateSession(sessionId, updates = {}) {
  const session = getSession(sessionId);
  if (!session) return null;
  
  const updatedSession = { ...session, ...updates, lastActive: Date.now() };
  activeSessions.set(sessionId, updatedSession);
  
  // Write updated session to temp file
  try {
    const sessionFile = path.join(tmpDir, `${sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(updatedSession, null, 2));
  } catch (error) {
    console.error(`[Session Manager] Error updating session file: ${error.message}`);
  }
  
  return updatedSession;
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 * @returns {boolean} - True if session was deleted, false otherwise
 */
function deleteSession(sessionId) {
  activeSessions.delete(sessionId);
  
  try {
    const sessionFile = path.join(tmpDir, `${sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
    return true;
  } catch (error) {
    console.error(`[Session Manager] Error deleting session file: ${error.message}`);
    return false;
  }
}

/**
 * List all active sessions
 * @returns {Array} - Array of session objects
 */
function listSessions() {
  return Array.from(activeSessions.values());
}

/**
 * Clean up inactive sessions
 * @param {number} maxAge - Maximum age of sessions in ms (default: 1 hour)
 */
function cleanupSessions(maxAge = 3600000) {
  const now = Date.now();
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActive > maxAge) {
      deleteSession(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupSessions, 600000);

/**
 * Mark a task as completed for a session
 * @param {string} sessionId - Session ID
 * @param {string} taskHash - Hash or description of completed task
 * @returns {boolean} - True if marked as completed, false otherwise
 */
function markTaskCompleted(sessionId, taskHash) {
  const session = getSession(sessionId);
  if (!session) return false;
  
  // Add to completed tasks
  if (!session.completedTasks) {
    session.completedTasks = new Set();
  }
  
  session.completedTasks.add(taskHash);
  session.taskCount++;
  session.lastTaskTime = Date.now();
  
  updateSession(sessionId, {
    completedTasks: session.completedTasks,
    taskCount: session.taskCount,
    lastTaskTime: session.lastTaskTime
  });
  
  return true;
}

/**
 * Check if a task has already been completed for a session
 * @param {string} sessionId - Session ID
 * @param {string} taskHash - Hash or description of task
 * @returns {boolean} - True if already completed, false otherwise
 */
function isTaskCompleted(sessionId, taskHash) {
  const session = getSession(sessionId);
  if (!session || !session.completedTasks) return false;
  
  return session.completedTasks.has(taskHash);
}

/**
 * Add a task history entry for a session
 * @param {string} sessionId - Session ID
 * @param {object} task - Task data to record
 * @returns {boolean} - True if added successfully, false otherwise
 */
function addTaskHistory(sessionId, task) {
  const session = getSession(sessionId);
  if (!session) return false;
  
  // Initialize task history if it doesn't exist
  if (!session.taskHistory) {
    session.taskHistory = [];
  }
  
  // Add to task history (limit to last 10 tasks)
  session.taskHistory.push({
    tool: task.tool,
    args: task.args || {},
    timestamp: Date.now()
  });
  
  // Keep only the last 10 tasks
  if (session.taskHistory.length > 10) {
    session.taskHistory = session.taskHistory.slice(-10);
  }
  
  // Update session
  updateSession(sessionId, {
    taskHistory: session.taskHistory,
    taskCount: (session.taskCount || 0) + 1,
    lastTaskTime: Date.now()
  });
  
  return true;
}

/**
 * Check if a session might be in an infinite loop
 * @param {string} sessionId - Session ID
 * @returns {boolean} - True if potential loop detected
 */
function isLoopDetected(sessionId) {
  const session = getSession(sessionId);
  if (!session) return false;
  
  // Time-based loop detection
  const TIME_WINDOW = 30000; // 30 seconds (reduced from 60s)
  const MAX_TASKS = 5; // Reduced threshold from 10
  
  const timeBasedLoop = (
    session.taskCount > MAX_TASKS && 
    (Date.now() - session.lastTaskTime) < TIME_WINDOW
  );
  
  // Pattern-based loop detection
  let patternBasedLoop = false;
  
  if (session.taskHistory && session.taskHistory.length >= 3) {
    // Check for 3 identical consecutive tasks (same tool and target)
    const lastThreeTasks = session.taskHistory.slice(-3);
    
    // Check if all three tasks use the same tool
    const sameTool = lastThreeTasks.every(task => task.tool === lastThreeTasks[0].tool);
    
    // For navigation tasks, check if they go to the same URL
    if (sameTool && lastThreeTasks[0].tool.toUpperCase() === 'NAVIGATE') {
      const sameUrl = lastThreeTasks.every(task => 
        task.args && task.args.url && task.args.url === lastThreeTasks[0].args.url
      );
      
      patternBasedLoop = sameUrl;
    } 
    // For other tasks, just check if the tool is the same (could be enhanced for other tools)
    else {
      patternBasedLoop = sameTool;
    }
  }
  
  return timeBasedLoop || patternBasedLoop;
}

/**
 * Reset task counter for a session
 * @param {string} sessionId - Session ID
 */
function resetTaskCounter(sessionId) {
  const session = getSession(sessionId);
  if (!session) return;
  
  session.taskCount = 0;
  session.lastTaskTime = Date.now();
  
  updateSession(sessionId, {
    taskCount: 0,
    lastTaskTime: Date.now()
  });
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  cleanupSessions,
  markTaskCompleted,
  isTaskCompleted,
  isLoopDetected,
  resetTaskCounter,
  addTaskHistory
};
