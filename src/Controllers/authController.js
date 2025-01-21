const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../db/db");

const login = async (req, res) => {
  const { email, password } = req.body;

  // Validate email and password presence
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // Query for the user in the database by email
    const [rows] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);

    // If no user found, return generic error message
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // Compare the provided password with the stored hashed password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate a JWT token for the authenticated user
    const token = jwt.sign(
      { id: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Send a successful response with the token and user details
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({ message: "An error occurred during login." });
  }
};

module.exports = { login };
