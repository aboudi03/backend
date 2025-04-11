const bcrypt = require('bcryptjs');
const db = require('../db/db'); // Ensure this path is correct

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

    console.log('Incoming request body:', req.body);

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !password || // Ensure password is included
      !education ||
      !experience ||
      !Array.isArray(subjects) ||
      subjects.length === 0 ||
      !availability ||
      !availability.days ||
      !availability.startTime ||
      !availability.endTime
    ) {
      console.error("Validation failed. Request body:", req.body); // Log the failing request
      return res.status(400).json({ message: "All required fields must be provided." });
    }
    

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const userSql = `
            INSERT INTO users (first_name, last_name, email, phone_number, password_hash, user_type)
            VALUES (?, ?, ?, ?, ?, 'tutor')
        `;
        const [userResult] = await db.query(userSql, [
            firstName,
            lastName,
            email,
            phone,
            hashedPassword,
        ]);

        const userId = userResult.insertId;
        console.log('User inserted with ID:', userId);

        const tutorSql = `
            INSERT INTO tutors (user_id, education, certifications, experience, subjects, other_subjects, availability)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(tutorSql, [
            userId,
            education,
            certifications,
            experience,
            JSON.stringify(subjects),
            otherSubjects,
            JSON.stringify(availability),
        ]);

        res.status(201).json({ message: 'Tutor registered successfully!', userId, userType: 'tutor' });
    } catch (error) {
        console.error('Error during tutor registration:', error.sqlMessage || error.message);
        res.status(500).json({ message: 'An error occurred during tutor registration.' });
    }
};

module.exports = { registerTutor };
