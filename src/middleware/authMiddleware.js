const jwt = require("jsonwebtoken");
const db = require("../db/db");

const authenticate = async (req, res, next) => {
  console.log("🔍 Cookies received in request:", req.cookies);

  const token = req.cookies.token;

  if (!token) {
    console.error("❌ No token found in cookies");
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    console.log("🔑 Token received:", token);
    const decoded = jwt.verify(token, "mySuperSecretKey");

    // 🔍 Fetch tutor_id if user is a tutor
    if (decoded.userType === "tutor") {
      const [[tutor]] = await db.query(
        "SELECT id FROM tutors WHERE user_id = ?",
        [decoded.id]
      );

      if (!tutor) {
        return res.status(403).json({ message: "Tutor not found." });
      }

      decoded.tutor_id = tutor.id; // Add to token payload
    }

    req.user = decoded;
    console.log("✅ Authenticated user:", req.user);
    next();
  } catch (error) {
    console.error("❌ Invalid token:", error);
    return res.status(401).json({ message: "Invalid token." });
  }
};

module.exports = { authenticate };
