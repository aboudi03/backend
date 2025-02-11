// src/controllers/authController.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../db/db");

// Hardcoded secret key (not recommended for production!)
const JWT_SECRET_KEY = "mySuperSecretKey"; // Remove or secure this properly in real deployments

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, userType: user.user_type },
      "mySuperSecretKey", 
      { expiresIn: "1h" }
    );
    
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // Set to true if using HTTPS
      sameSite: "Lax", // Change from "Strict" if requests are from different origins
      maxAge: 60 * 60 * 1000, // 1 hour
    });
    
    // Log Set-Cookie header for debugging
    console.log("Set-Cookie Header:", res.getHeader("Set-Cookie"));
    
    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    return res.status(500).json({ message: "An error occurred during login." });
  }
};


const logout = (req, res) => {
  // Clear the cookie by setting an immediate expiration
  res.cookie("token", "", {
    httpOnly: true,
    secure: false, // or true if using HTTPS
    sameSite: "Strict",
    expires: new Date(0)
  });

  return res.status(200).json({ message: "Logout successful." });
};

module.exports = { login, logout };
