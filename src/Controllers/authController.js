const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db/db");

const JWT_SECRET_KEY = "mySuperSecretKey"; // move to .env in production

// ─────────────────────────────
// LOGIN for admin, tutor, student
// ─────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // 1️⃣ Admin login
    const [adminRows] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);

    if (adminRows.length > 0) {
      const admin = adminRows[0];

      if (admin.password === password) {
        const token = jwt.sign(
          { id: admin.id, email: admin.email, userType: "admin" },
          JWT_SECRET_KEY,
          { expiresIn: "1h" }
        );

        res.cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
          maxAge: 60 * 60 * 1000,
        });

        console.log(`✅ Admin logged in: ${admin.email}`);
        return res.status(200).json({
          message: "Login successful",
          userType: "admin",
          user: {
            id: admin.id,
            email: admin.email,
            userType: "admin",
          },
        });
      } else {
        return res.status(401).json({ message: "Invalid email or password" });
      }
    }

    // 2️⃣ Student/tutor login
    const [userRows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (userRows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = userRows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_verified) {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, userType: user.user_type },
      JWT_SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: 60 * 60 * 1000,
    });

    console.log(`✅ ${user.user_type} logged in: ${user.email}`);
    return res.status(200).json({
      message: "Login successful",
      userType: user.user_type,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    return res.status(500).json({ message: "An error occurred during login." });
  }
};

// ─────────────────────────────
// LOGOUT (clear cookie)
// ─────────────────────────────
const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  });

  return res.status(200).json({ message: "Logout successful." });
};

// ─────────────────────────────
// VERIFY EMAIL
// ─────────────────────────────
const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Missing verification token.");
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE verification_token = ?", [token]);

    if (rows.length === 0) {
      return res.status(400).send("Invalid or expired verification link.");
    }

    await db.query("UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?", [token]);

    return res.status(200).send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding-top:40px;">
          <h1>Email Verified 🎉</h1>
          <p>You can now <a href="http://localhost:3000/login">log in</a>.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Email verification error:", err.message);
    return res.status(500).send("Server error during verification.");
  }
};

module.exports = {
  login,
  logout,
  verifyEmail,
};
