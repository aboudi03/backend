const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/roadmap - Fetch roadmap steps based on student path
// ─────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get selected subjects (tracks) from student table
    const [[student]] = await db.query(
      "SELECT subjects FROM students WHERE user_id = ?",
      [userId]
    );

    if (!student || !student.subjects) {
      return res.status(400).json({ message: "No subjects found for student." });
    }

    // Parse subjects (stored as JSON string or CSV)
    let subjects = student.subjects;
    if (typeof subjects === "string") {
      try {
        subjects = JSON.parse(subjects);
      } catch {
        subjects = subjects.split(",").map(s => s.trim());
      }
    }

    // Filter allowed subjects only
    const allowedSubjects = [
      "Cybersecurity",
      "AI & Machine Learning",
      "Data Science",
      "Software Engineering",
      "Web Development",
      "Mobile Development"
    ];
    subjects = subjects.filter((s) => allowedSubjects.includes(s));

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: "No valid subjects selected." });
    }

    // Build dynamic placeholders
    const placeholders = subjects.map(() => "?").join(", ");

    const sql = `
      SELECT 
        r.id,
        r.track,
        r.step_title,
        r.step_description,
        r.order_index,
        r.parent_id,
        r.course_id,
        c.title AS course_title,
        IFNULL(rp.completed, false) AS completed
      FROM track_roadmap r
      LEFT JOIN courses c ON c.id = r.course_id
      LEFT JOIN roadmap_progress rp 
        ON rp.roadmap_step_id = r.id AND rp.student_id = ?
      WHERE r.track IN (${placeholders})
      ORDER BY r.track, r.order_index ASC
    `;

    const [rows] = await db.query(sql, [userId, ...subjects]);

    const roadmap = rows.map(row => ({
      id: row.id,
      label: row.step_title,
      description: row.step_description,
      order_index: row.order_index,
      course_id: row.course_id,
      course_title: row.course_title,
      completed: !!row.completed,
      track: row.track,
      parent_id: row.parent_id || null,
    }));

    res.status(200).json(roadmap);
  } catch (err) {
    console.error("❌ Error fetching roadmap:", err);
    res.status(500).json({ message: "Failed to load roadmap" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/roadmap/progress - Update completion for a step
// ─────────────────────────────────────────────────────────────
router.post("/progress", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const { roadmap_step_id, completed } = req.body;

  if (!roadmap_step_id) {
    return res.status(400).json({ message: "Missing roadmap_step_id" });
  }

  try {
    await db.query(
      `INSERT INTO roadmap_progress (student_id, roadmap_step_id, completed)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE completed = ?`,
      [studentId, roadmap_step_id, completed, completed]
    );

    res.status(200).json({ message: "Progress updated" });
  } catch (err) {
    console.error("❌ Error updating progress:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
