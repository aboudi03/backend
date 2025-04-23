const bcrypt = require('bcryptjs');
const db = require('../db/db'); // Ensure this path is correct
const crypto = require("crypto");
const { sendVerificationEmail } = require("../utils/email");

const registerTutor = async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      education,
      certifications,
      experience,
      subjects,
      otherSubjects,
      availability,
    } = req.body;
  
    if (
      !firstName || !lastName || !email || !phone || !password || !education || !experience ||
      !Array.isArray(subjects) || subjects.length === 0 ||
      !availability || !availability.days || !availability.startTime || !availability.endTime
    ) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const [userResult] = await db.query(
        `INSERT INTO users (first_name, last_name, email, phone_number, password_hash, user_type)
         VALUES (?, ?, ?, ?, ?, 'tutor')`,
        [firstName, lastName, email, phone, hashedPassword]
      );
  
      const userId = userResult.insertId;
  
      await db.query(
        `INSERT INTO tutors (user_id, education, certifications, experience, subjects, other_subjects, availability)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          education,
          certifications,
          experience,
          JSON.stringify(subjects),
          otherSubjects,
          JSON.stringify(availability),
        ]
      );
  
      // 🔐 Generate token and send verification email
      const token = crypto.randomBytes(32).toString("hex");
  
      await db.query(
        "UPDATE users SET verification_token = ?, is_verified = 0 WHERE id = ?",
        [token, userId]
      );
  
      await sendVerificationEmail(email, token);
  
      res.status(201).json({ message: "Tutor registered successfully! Please check your email to verify your account." });
    } catch (error) {
      console.error('Error during tutor registration:', error.sqlMessage || error.message);
      res.status(500).json({ message: 'An error occurred during tutor registration.' });
    }
  };
  

module.exports = { registerTutor };
