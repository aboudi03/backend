const jwt = require("jsonwebtoken");

const authenticate = async (req, res, next) => {
  console.log("🔍 Cookies received in request:", req.cookies); // Debugging

  const token = req.cookies.token; // Read token from cookie

  if (!token) {
    console.error("❌ No token found in cookies");
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    console.log("🔑 Token received:", token); // Debugging log
    const decoded = jwt.verify(token, "mySuperSecretKey"); // Ensure secret is correct
    req.user = decoded;
    console.log("✅ Authenticated user:", req.user);
    next();
  } catch (error) {
    console.error("❌ Invalid token:", error);
    return res.status(401).json({ message: "Invalid token." });
  }
};

module.exports = { authenticate };
