const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/roadmap - Fetch roadmap based on the student's selected tracks  
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Retrieve the student's subjects (tracks) from the students table.
    const [[student]] = await db.query(
      "SELECT subjects FROM students WHERE user_id = ?",
      [userId]
    );

    if (!student || !student.subjects) {
      return res.status(400).json({ message: "No subjects found for student." });
    }

    // Ensure subjects is an array. If it's stored as a JSON string, parse it.
    let subjects = student.subjects;
    if (typeof subjects === "string") {
      try {
        subjects = JSON.parse(subjects);
      } catch (e) {
        // Fallback: assume comma-separated string
        subjects = subjects.split(",").map(s => s.trim());
      }
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: "No valid subjects selected." });
    }

    console.log("Parsed subjects:", subjects);

    // Build dynamic placeholders for the SQL IN clause.
    const placeholders = subjects.map(() => "?").join(", ");
    const sql = `
      SELECT 
        r.id,
        r.track,
        r.step_title,
        r.step_description,
        r.order_index,
        c.id AS course_id,
        c.title AS course_title,
        c.description AS course_description,
        c.tutor_id,
        c.price,
        IFNULL(rp.completed, false) AS completed
      FROM track_roadmap r
      LEFT JOIN courses c 
        ON c.category = r.track AND c.title LIKE CONCAT('%', r.step_title, '%')
      LEFT JOIN roadmap_progress rp 
        ON rp.roadmap_step_id = r.id AND rp.student_id = ?
      WHERE r.track IN (${placeholders})
      ORDER BY r.track, r.order_index ASC;
    `;
    // The query parameters: first the studentId for the join, then each subject.
    const [rows] = await db.query(sql, [userId, ...subjects]);

    console.log("Fetched rows:", rows);

    const roadmap = rows.map(row => ({
      id: row.id,
      label: row.step_title,
      description: row.step_description,
      order_index: row.order_index,
      course_title: row.course_title,
      completed: !!row.completed,
      track: row.track,
    }));

    res.status(200).json(roadmap);
  } catch (err) {
    console.error("❌ Error fetching roadmap:", err);
    res.status(500).json({ message: "Failed to load roadmap" });
  }
});

// POST /api/roadmap/progress - Update roadmap progress for a step  
router.post("/progress", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const { roadmap_step_id, completed } = req.body; // expecting roadmap_step_id now

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
