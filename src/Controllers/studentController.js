const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { sendVerificationEmail } = require("../utils/email");
const crypto = require("crypto");
const registerStudent = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    educationLevel,
    school,
    subjects,
    goals,
  } = req.body;

  if (
    !firstName || !lastName || !email || !phoneNumber || !password ||
    !educationLevel || !school || !Array.isArray(subjects) || subjects.length === 0 || !goals
  ) {
    return res.status(400).json({ message: "All required fields must be provided." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await db.query(
      `INSERT INTO users (first_name, last_name, email, phone_number, password_hash, user_type)
       VALUES (?, ?, ?, ?, ?, 'student')`,
      [firstName, lastName, email, phoneNumber, hashedPassword]
    );

    const userId = userResult.insertId;

    await db.query(
      `INSERT INTO students (user_id, education_level, school, subjects, goals)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, educationLevel, school, JSON.stringify(subjects), goals]
    );

    // 🔐 Generate token and send verification email
    const token = crypto.randomBytes(32).toString("hex");

    await db.query(
      "UPDATE users SET verification_token = ?, is_verified = 0 WHERE id = ?",
      [token, userId]
    );

    await sendVerificationEmail(email, token);

    res.status(201).json({ message: "Student registered successfully! Please check your email to verify your account." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email or phone number already exists." });
    }

    console.error("Error during registration:", error.sqlMessage || error.message);
    res.status(500).json({ message: "An error occurred during registration." });
  }
};


module.exports = { registerStudent };
