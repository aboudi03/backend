const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * 📌 POST: Enroll a student in a course
 */
router.post("/enroll", authenticate, async (req, res) => {
  try {
    const { course_id } = req.body;
    const student_id = req.user.id;

    if (!course_id) {
      return res.status(400).json({ message: "Course ID is required." });
    }

    // Check if course exists
    const [course] = await db.query("SELECT * FROM courses WHERE id = ?", [course_id]);
    if (course.length === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    // Check if the student is already enrolled
    const [existingEnrollment] = await db.query(
      "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      [student_id, course_id]
    );

    if (existingEnrollment.length > 0) {
      return res.status(400).json({ message: "Already enrolled in this course." });
    }

    // Enroll student
    await db.query(
      "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
      [student_id, course_id]
    );

    res.status(200).json({ message: "Enrollment successful!" });
  } catch (error) {
    console.error("❌ Enrollment error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 📌 GET: Fetch enrolled courses for a student
 */
router.get("/my-courses", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;

    const [courses] = await db.query(
      `SELECT c.id, c.title, c.description, c.price, c.category, c.created_at, 
              t.id AS tutor_id, u.first_name AS tutor_first_name, u.last_name AS tutor_last_name
       FROM courses c
       JOIN enrollments e ON c.id = e.course_id
       JOIN tutors t ON c.tutor_id = t.id
       JOIN users u ON t.user_id = u.id  -- 🔹 Fetch tutor name from users table
       WHERE e.student_id = ?`,
      [student_id]
    );

    console.log("📤 Sending Enrolled Courses:", courses);
    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Error fetching enrolled courses:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});



module.exports = router;
