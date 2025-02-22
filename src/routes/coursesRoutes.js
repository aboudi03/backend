const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

/**
 * 🔹 GET: Fetch all courses with tutor details
 */
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;

    let sql = `
      SELECT c.id, c.title, c.description, c.price, c.category, c.created_at, 
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
    `;

    let values = [];
    
    if (category && category !== "all") {
      sql += " WHERE c.category = ?";
      values.push(category);
    }

    console.log("📡 Fetching courses. Category:", category || "All Courses");
    
    const [courses] = await db.query(sql, values);

    if (courses.length === 0) {
      console.warn("⚠️ No courses found.");
    } else {
      console.log("✅ Courses found:", courses);
    }

    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});




/**
 * 🔹 POST: Add a new course (Tutors Only)
 */
router.post("/", authenticate, ensureTutor, async (req, res) => {
  try {
    const { title, description, price , category } = req.body;
    const userId = req.user.id;

    console.log("🟡 Received course data:", { title, description, price, category, userId });



    // ✅ Validate required fields
    if (!title || !description || !price || !category) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // ✅ Validate price
    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ message: "Invalid price. It must be a positive number." });
    }

    // ✅ Ensure tutor exists
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    if (tutor.length === 0) {
      return res.status(403).json({ message: "You are not a registered tutor." });
    }

    const tutorId = tutor[0].id;

    console.log("🟢 Tutor found with ID:", tutorId);

    // ✅ Check if course title already exists for this tutor
    const [existingCourse] = await db.query(
      "SELECT id FROM courses WHERE title = ? AND tutor_id = ?",
      [title, tutorId]
    );

    if (existingCourse.length > 0) {
      return res.status(400).json({ message: "A course with this title already exists." });
    }

    const validCategories = ["web-development", "data-science", "ai-ml", "cybersecurity", "mobile-development", "software-engineering"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ message: "Invalid category." });
    }

    // Insert into database
    const [result] = await db.query(
      "INSERT INTO courses (title, description, tutor_id, price, category) VALUES (?, ?, ?, ?, ?)",
      [title, description, tutorId, parseFloat(price), category.trim().toLowerCase()]
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

/**
 * 🔹 PUT: Update an existing course (Tutors Only)
 */
router.put("/:courseId", authenticate, ensureTutor, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, price } = req.body;
    const userId = req.user.id;

    // ✅ Validate input
    if (!title || !description || !price) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ message: "Invalid price. It must be a positive number." });
    }

    // ✅ Ensure tutor exists
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    if (tutor.length === 0) {
      return res.status(403).json({ message: "You are not a registered tutor." });
    }

    const tutorId = tutor[0].id;

    // ✅ Ensure course exists and belongs to this tutor
    const [course] = await db.query("SELECT * FROM courses WHERE id = ? AND tutor_id = ?", [courseId, tutorId]);
    if (course.length === 0) {
      return res.status(404).json({ message: "Course not found or unauthorized." });
    }

    // ✅ Update course
    await db.query(
      "UPDATE courses SET title = ?, description = ?, price = ? WHERE id = ?",
      [title, description, priceValue, courseId]
    );

    res.status(200).json({ message: "Course updated successfully!" });
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 🔹 DELETE: Remove a course (Tutors Only)
 */
router.delete("/:courseId", authenticate, ensureTutor, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // ✅ Ensure tutor exists
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    if (tutor.length === 0) {
      return res.status(403).json({ message: "You are not a registered tutor." });
    }

    const tutorId = tutor[0].id;

    // ✅ Ensure course exists and belongs to this tutor
    const [course] = await db.query("SELECT * FROM courses WHERE id = ? AND tutor_id = ?", [courseId, tutorId]);
    if (course.length === 0) {
      return res.status(404).json({ message: "Course not found or unauthorized." });
    }

    // ✅ Delete course
    await db.query("DELETE FROM courses WHERE id = ?", [courseId]);

    res.status(200).json({ message: "Course deleted successfully!" });
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
