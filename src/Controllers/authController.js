const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../db/db");

const JWT_SECRET_KEY = "mySuperSecretKey";

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

    // Generate the token with iat and jti for uniqueness
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        iat: Math.floor(Date.now() / 1000),
        jti: Math.random().toString(36).substring(2),
      },
      JWT_SECRET_KEY,
      { expiresIn: "1h" }
    );

    // Log the token to the terminal
    console.log(`🔑 Generated JWT Token: ${token}`);

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      userType: user.user_type, // <-- Added this line
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name,
      }
    });
    
  } catch (error) {
    console.error("Error during login:", error.message);
    return res.status(500).json({ message: "An error occurred during login." });
  }
};

const logout = (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
    expires: new Date(0),
  });

  return res.status(200).json({ message: "Logout successful." });
};

module.exports = { login, logout };
