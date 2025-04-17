const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * 📌 POST: Enroll a student in a course (Requires login)
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

    // Check if already enrolled
    const [existing] = await db.query(
      "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      [student_id, course_id]
    );

    if (existing.length > 0) {
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
 * 📌 GET: Fetch all courses a student is enrolled in
 */
router.get("/my-courses", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;

    const [courses] = await db.query(
      `SELECT c.id, c.title, c.description, c.price, c.category, c.created_at,
              t.id AS tutor_id, u.first_name AS tutor_first_name, u.last_name AS tutor_last_name,
              e.progress
       FROM courses c
       JOIN enrollments e ON c.id = e.course_id
       JOIN tutors t ON c.tutor_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE e.student_id = ?`,
      [student_id]
    );

    const coursesWithTutor = courses.map(course => ({
      ...course,
      tutor: `${course.tutor_first_name || ""} ${course.tutor_last_name || ""}`.trim(),
    }));

    res.status(200).json(coursesWithTutor);
  } catch (error) {
    console.error("❌ Error fetching enrolled courses:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});

/**
 * 📌 PATCH: Update course progress
 */
router.patch("/:courseId/progress", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;
    const { courseId } = req.params;
    const { progress } = req.body;

    if (typeof progress !== "number" || progress < 0 || progress > 100) {
      return res.status(400).json({ message: "Progress must be between 0 and 100." });
    }

    const [enrollment] = await db.query(
      "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      [student_id, courseId]
    );

    if (!enrollment.length) {
      return res.status(404).json({ message: "Enrollment not found." });
    }

    await db.query(
      "UPDATE enrollments SET progress = ? WHERE student_id = ? AND course_id = ?",
      [progress, student_id, courseId]
    );

    res.status(200).json({ message: "Progress updated successfully." });
  } catch (error) {
    console.error("❌ Error updating progress:", error);
    res.status(500).json({ message: "Failed to update progress." });
  }
});

/**
 * 📌 GET: Fetch upcoming sessions from courses a student is enrolled in
 */
router.get("/my-schedule", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;

    const [sessions] = await db.query(
      `SELECT cs.*
       FROM course_sessions cs
       JOIN enrollments e ON cs.course_id = e.course_id
       WHERE e.student_id = ?
       ORDER BY cs.scheduled_at ASC`,
      [student_id]
    );

    res.status(200).json(sessions);
  } catch (error) {
    console.error("❌ Error fetching student schedule:", error);
    res.status(500).json({ message: "Failed to fetch schedule." });
  }
});

module.exports = router;
