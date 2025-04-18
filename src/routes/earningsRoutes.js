const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

router.get("/earnings", authenticate, ensureTutor, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get tutor ID
    const [[tutor]] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    const tutorId = tutor?.id;

    // Total earnings
    const [[{ total_earned }]] = await db.query(`
      SELECT SUM(c.price) AS total_earned
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.tutor_id = ?
    `, [tutorId]);

    // Recent enrollments
    const [transactions] = await db.query(`
      SELECT e.enrolled_at, c.title AS course_title, c.price, u.first_name, u.last_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN students s ON e.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE c.tutor_id = ?
      ORDER BY e.enrolled_at DESC
      LIMIT 5
    `, [tutorId]);

    res.json({
      total: total_earned || 0,
      transactions
    });
  } catch (err) {
    console.error("Earnings fetch error:", err);
    res.status(500).json({ message: "Failed to fetch earnings." });
  }
});

module.exports = router;
