/**
 * Session Manager for the Open Operator Bridge
 * Tracks active sessions and loop detection
 */

// In-memory storage for sessions
const sessions = {};
const taskHistory = {};
const completedTasks = {};

// Thresholds for detecting infinite loops (tweak as needed)
const MAX_REPETITIONS = 3;  // Max number of identical actions in sequence
const MAX_PATTERN_LENGTH = 5;  // Max pattern length to detect

const sessionManager = {
  /**
   * Create a new session
   */
  createSession(sessionId, options = {}) {
    const session = {
      id: sessionId,
      contextId: options.contextId || '',
      useBrowserbase: options.useBrowserbase || false,
      createdAt: new Date(),
      lastActivity: new Date(),
      // Additional metadata can be added here
    };
    
    sessions[sessionId] = session;
    taskHistory[sessionId] = [];
    return session;
  },
  
  /**
   * Get a session by ID
   */
  getSession(sessionId) {
    return sessions[sessionId];
  },
  
  /**
   * List all active sessions
   */
  listSessions() {
    return Object.values(sessions);
  },
  
  /**
   * Delete a session
   */
  deleteSession(sessionId) {
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      delete taskHistory[sessionId];
      delete completedTasks[sessionId];
      return true;
    }
    return false;
  },
  
  /**
   * Add a task to the history for a session
   */
  addTaskHistory(sessionId, task) {
    if (!taskHistory[sessionId]) {
      taskHistory[sessionId] = [];
    }
    
    // Update the session's last activity time
    if (sessions[sessionId]) {
      sessions[sessionId].lastActivity = new Date();
    }
    
    // Add the task to the history
    taskHistory[sessionId].push({
      tool: task.tool,
      args: task.args || {},
      timestamp: new Date()
    });
    
    // Limit history size
    if (taskHistory[sessionId].length > 50) {
      taskHistory[sessionId] = taskHistory[sessionId].slice(-50);
    }
  },
  
  /**
   * Reset task counter for a session (call when detecting loops)
   */
  resetTaskCounter(sessionId) {
    if (taskHistory[sessionId]) {
      taskHistory[sessionId] = [];
    }
  },
  
  /**
   * Mark a task as completed for a session
   */
  markTaskCompleted(sessionId, taskHash) {
    if (!completedTasks[sessionId]) {
      completedTasks[sessionId] = {};
    }
    completedTasks[sessionId][taskHash] = new Date();
  },
  
  /**
   * Check if a task has already been completed for a session
   */
  isTaskCompleted(sessionId, taskHash) {
    if (!completedTasks[sessionId]) {
      return false;
    }
    return !!completedTasks[sessionId][taskHash];
  },
  
  /**
   * Check if a session has gotten into an infinite loop
   * Uses pattern detection to identify repetitive behavior
   */
  isLoopDetected(sessionId) {
    if (!taskHistory[sessionId] || taskHistory[sessionId].length < MAX_REPETITIONS) {
      return false;
    }
    
    const history = taskHistory[sessionId];
    
    // 1. Simple repetition detection (same action repeated)
    const lastAction = history[history.length - 1];
    let repetitionCount = 1;
    
    // Count consecutive repetitions of the same action
    for (let i = history.length - 2; i >= 0; i--) {
      const action = history[i];
      if (action.tool === lastAction.tool && 
          JSON.stringify(action.args) === JSON.stringify(lastAction.args)) {
        repetitionCount++;
      } else {
        break;
      }
    }
    
    if (repetitionCount >= MAX_REPETITIONS) {
      return true;
    }
    
    // 2. Pattern detection (repeating sequences)
    const historyStr = history.map(h => h.tool).join(',');
    
    // Check for repeating patterns of various lengths
    for (let patternLength = 2; patternLength <= MAX_PATTERN_LENGTH; patternLength++) {
      // Only check for patterns if we have enough history
      if (history.length >= patternLength * 2) {
        // Extract the most recent potential pattern
        const potentialPattern = historyStr.slice(-patternLength * 2, -patternLength);
        const recentActivity = historyStr.slice(-patternLength);
        
        // If the pattern repeats
        if (potentialPattern.endsWith(recentActivity)) {
          return true;
        }
      }
    }
    
    return false;
  },
  
  /**
   * Update session settings
   */
  updateSession(sessionId, updates) {
    if (sessions[sessionId]) {
      sessions[sessionId] = {
        ...sessions[sessionId],
        ...updates,
        lastActivity: new Date()
      };
      return sessions[sessionId];
    }
    return null;
  }
};

module.exports = sessionManager;
