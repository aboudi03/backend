// src/middleware/authTutor.js

// This middleware should run AFTER authenticate, which sets req.user
function ensureTutor(req, res, next) {
    // If user data isn't set, they're not authenticated
    if (!req.user) {
      return res.status(401).json({ message: "No user payload found. Please log in." });
    }
  
    // If the user's role is not tutor, deny access
    if (req.user.userType !== "tutor") {
      return res.status(403).json({ message: "Access denied. Tutors only." });
    }
  
    // Otherwise, continue to the next middleware or route handler
    next();
  }
  
  module.exports = { ensureTutor };
  