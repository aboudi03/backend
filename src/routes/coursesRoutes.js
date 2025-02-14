const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [courses] = await db.query(`
      SELECT c.id, c.title, c.description, c.price, c.created_at, 
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
    `);
    
    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});

// ✅ POST: Add a new course (Tutors Only!)
router.post("/", authenticate, ensureTutor, async (req, res) => {
  try {
    const { title, description, price } = req.body;
    const userId = req.user.id; // Extracted from the JWT payload

    if (!title || !description || !price) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // ✅ Ensure the tutor exists before inserting
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    if (tutor.length === 0) {
      return res.status(403).json({ message: "You are not a registered tutor." });
    }

    const tutorId = tutor[0].id;

    // ✅ Insert the new course
    const [result] = await db.query(
      "INSERT INTO courses (title, description, tutor_id, price) VALUES (?, ?, ?, ?)",
      [title, description, tutorId, price]
    );

    res.status(201).json({
      message: "Course added successfully!",
      courseId: result.insertId,
    });
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;