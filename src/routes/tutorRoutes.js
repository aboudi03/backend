
const express = require('express');
const { registerTutor } = require('../Controllers/tutorController');
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔹 POST: Register a new tutor
router.post('/', registerTutor);
console.log("📁 tutorRoutes.js loaded");


// 🔹 GET: Get all tutors and their profile info
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id as userId, u.first_name, u.last_name, u.email,
        t.education, t.experience, t.subjects, t.other_subjects, t.certifications
      FROM tutors t
      JOIN users u ON t.user_id = u.id
    `);

    const tutors = rows.map((row) => {
      const tutor = { ...row };
      try {
        if (typeof tutor.subjects === 'string') tutor.subjects = JSON.parse(tutor.subjects);
        if (typeof tutor.other_subjects === 'string') tutor.other_subjects = JSON.parse(tutor.other_subjects);
        if (typeof tutor.certifications === 'string') tutor.certifications = JSON.parse(tutor.certifications);
      } catch (err) {
        console.error("JSON parse error:", err);
      }
      return tutor;
    });

    res.json(tutors);
  } catch (error) {
    console.error("Error fetching tutors:", error);
    res.status(500).json({ message: "Failed to fetch tutors" });
  }
});

router.get("/dashboard-stats", authenticate, async (req, res) => {
  try {
    const tutorId = req.user.tutor_id;

    const [[{ totalCourses }]] = await db.query(
      `SELECT COUNT(*) AS totalCourses FROM courses WHERE tutor_id = ?`,
      [tutorId]
    );

    const [[{ totalStudents }]] = await db.query(
      `SELECT COUNT(DISTINCT e.student_id) AS totalStudents
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE c.tutor_id = ?`,
      [tutorId]
    );

    const [[{ totalEnrollments }]] = await db.query(
      `SELECT COUNT(*) AS totalEnrollments
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE c.tutor_id = ?`,
      [tutorId]
    );

    const [[topCourse]] = await db.query(
      `SELECT c.title, COUNT(*) AS count
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE c.tutor_id = ?
       GROUP BY c.id
       ORDER BY count DESC
       LIMIT 1`,
      [tutorId]
    );

    res.json({
      totalCourses,
      totalStudents,
      totalEnrollments,
      popularCourse: topCourse?.title || "N/A",
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});


router.get("/dashboard-activity", authenticate, async (req, res) => {
  try {
    const tutorId = req.user.tutor_id;

    const [recentCourses] = await db.query(
      `SELECT title, created_at FROM courses WHERE tutor_id = ? ORDER BY created_at DESC LIMIT 5`,
      [tutorId]
    );

    const [recentEnrollments] = await db.query(
      `SELECT e.enrolled_at AS enrolledAt, c.title FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE c.tutor_id = ?
       ORDER BY e.enrolled_at DESC LIMIT 5`,
      [tutorId]
    );

    const [recentSessions] = await db.query(
      `SELECT title, scheduled_at FROM course_sessions 
       WHERE tutor_id = ? 
       ORDER BY scheduled_at DESC LIMIT 5`,
      [tutorId]
    );

    res.json({
      courses: recentCourses,
      enrollments: recentEnrollments,
      sessions: recentSessions,
    });
  } catch (error) {
    console.error("❌ Error fetching recent activity:", error);
    res.status(500).json({ message: "Failed to fetch recent activity." });
  }
});

module.exports = router;
