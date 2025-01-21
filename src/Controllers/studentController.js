const bcrypt = require('bcrypt');
const db = require('../db/db');

const registerStudent = async (req, res) => {
  console.log("Incoming request body:", req.body);

  const {
    firstName,
    lastName,
    email,
    phoneNumber, // Ensure this matches the frontend payload
    password,
    educationLevel,
    school,
    subjects,
    goals,
  } = req.body;

  // 1. Validate all required fields
  if (
    !firstName ||
    !lastName ||
    !email ||
    !phoneNumber ||
    !password ||
    !educationLevel ||
    !school ||
    !Array.isArray(subjects) || // Ensure subjects is an array
    subjects.length === 0 ||
    !goals
  ) {
    console.error("Validation failed: Missing or invalid fields");
    return res.status(400).json({ message: "All required fields must be provided." });
  }

  try {
    // 2. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insert user data into `users` table
    const userSql = `
      INSERT INTO users (first_name, last_name, email, phone_number, password_hash, user_type)
      VALUES (?, ?, ?, ?, ?, 'student')
    `;
    const [userResult] = await db.promise().query(userSql, [
      firstName,
      lastName,
      email,
      phoneNumber,
      hashedPassword,
    ]);

    // 4. Retrieve the new user ID
    const userId = userResult.insertId;
    console.log("User inserted with ID:", userId);

    // 5. Insert student-specific data into `students` table
    const studentSql = `
      INSERT INTO students (user_id, education_level, school, subjects, goals)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.promise().query(studentSql, [
      userId,
      educationLevel,
      school,
      JSON.stringify(subjects), // Store array as JSON
      goals,
    ]);

    console.log("Student inserted successfully");
    res.status(201).json({ message: "Student registered successfully!" });
  } catch (error) {
    console.error("Error during registration:", error.sqlMessage || error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email or phone number already exists." });
    }

    res.status(500).json({ message: "An error occurred during registration." });
  }
};

module.exports = { registerStudent };
