const bcrypt = require('bcrypt');
const db = require('../db/db');

const registerStudent = async (req, res) => {
  console.log("Incoming request body:", req.body);
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    educationLevel,
    school,
    subjects,
    goals,
  } = req.body;

  console.log('Incoming request body:', req.body);

  // 1. Validate all required fields (including password)
  if (
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !password ||
    !educationLevel ||
    !school ||
    !subjects ||
    !goals
  ) {
    console.error('Missing required fields');
    return res.status(400).send('All required fields must be provided.');
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
      phone,
      hashedPassword,
    ]);

    // 4. Retrieve the new user ID
    const userId = userResult.insertId;
    console.log('User inserted with ID:', userId);

    // 5. Insert student-specific data into `students` table
    const studentSql = `
      INSERT INTO students (user_id, education_level, school, subjects, goals)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.promise().query(studentSql, [
      userId,
      educationLevel,
      school,
      JSON.stringify(subjects), // store array as JSON
      goals,
    ]);

    console.log('Student inserted successfully');
    res.status(201).send('Student registered successfully!');
  } catch (error) {
    console.error('Error:', error.sqlMessage || error.message);
    res.status(500).send('An error occurred during registration.');
  }
};

module.exports = { registerStudent };
