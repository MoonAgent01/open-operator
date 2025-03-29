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
    lastActive: Date.now()
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

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  cleanupSessions
};
