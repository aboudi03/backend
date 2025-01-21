const bcrypt = require('bcrypt');
const db = require('../db/db');

const registerTutor = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    education,
    certifications,
    experience,
    subjects,
    otherSubjects,
    availability,
  } = req.body;

  console.log('Incoming request body:', req.body);

  // 1. Validate all required fields (including password and tutor-specific fields)
  if (
    !firstName ||
    !lastName ||
    !email ||
    !phoneNumber ||
    !password ||
    !education ||
    !experience ||
    !subjects ||
    !availability ||
    !availability.days ||
    !availability.startTime ||
    !availability.endTime
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
      VALUES (?, ?, ?, ?, ?, 'tutor')
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
    console.log('User inserted with ID:', userId);

    // 5. Insert tutor-specific data into `tutors` table
    const tutorSql = `
      INSERT INTO tutors (user_id, education, certifications, experience, subjects, other_subjects, availability)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.promise().query(tutorSql, [
      userId,
      education,
      certifications || null, // optional field
      experience,
      JSON.stringify(subjects), // store array as JSON
      otherSubjects || null, // optional field
      JSON.stringify(availability), // store availability as JSON
    ]);

    console.log('Tutor inserted successfully');
    res.status(201).send('Tutor registered successfully!');
  } catch (error) {
    console.error('Error:', error.sqlMessage || error.message);
    res.status(500).send('An error occurred during registration.');
  }
};

module.exports = { registerTutor };
