const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { notifyTutor } = require("../utils/notificationHelper"); // Import notification helper

const router = express.Router();

/**
 * 🔹 POST: Submit a review (Students Only)
 */
router.post("/", authenticate, async (req, res) => {
  try {
    const { course_id, rating, review } = req.body;
    const student_id = req.user.id;

    console.log("🟡 Received Review:", {
      student_id,
      course_id,
      rating,
      review,
    });

    // ✅ Validate inputs
    if (!course_id || !rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Invalid rating or missing fields." });
    }

    // ✅ Ensure student is enrolled in the course
    const [enrollment] = await db.query(
      "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      [student_id, course_id]
    );

    if (enrollment.length === 0) {
      return res
        .status(403)
        .json({ message: "You cannot review a course you haven't taken." });
    }

    // ✅ Fetch `tutor_id` from courses table
    const [course] = await db.query(
      "SELECT tutor_id, title FROM courses WHERE id = ?",
      [course_id]
    );

    if (course.length === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    const tutor_id = course[0].tutor_id;
    const courseTitle = course[0].title;

    console.log("🎯 Submitting review for tutor:", tutor_id);

    // ✅ Insert new review
    await db.query(
      "INSERT INTO reviews (student_id, tutor_id, course_id, rating, review) VALUES (?, ?, ?, ?, ?)",
      [student_id, tutor_id, course_id, rating, review]
    );

    // ✅ Get student name to include in notification
    const [student] = await db.query(
      "SELECT first_name, last_name FROM users WHERE id = ?",
      [student_id]
    );

    if (student.length > 0) {
      const studentName = `${student[0].first_name} ${student[0].last_name}`;
      const message = `${studentName} has submitted a ${rating}-star review for your course "${courseTitle}"`;

      // Send notification to tutor about the new review
      await notifyTutor(course_id, student_id, message, "review");
      console.log("🔔 Notification sent to tutor about new review");
    }

    res.status(201).json({ message: "Review submitted successfully!" });
  } catch (error) {
    console.error("❌ Error submitting review:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 🔹 GET: Fetch all reviews for a specific tutor
 */
router.get("/tutor", authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    console.log("🔍 Fetching tutor info for user_id:", user_id);

    // ✅ Fetch tutor_id from the tutors table
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [
      user_id,
    ]);

    if (tutor.length === 0) {
      console.log("❌ Tutor not found for user_id:", user_id);
      return res.status(404).json({ message: "Tutor not found" });
    }

    const tutorId = tutor[0].id;
    console.log("✅ Found tutor_id:", tutorId);

    // ✅ Fetch reviews (Fix: Get student details from users table)
    const [reviews] = await db.query(
      `SELECT r.rating, r.review, r.created_at, 
                u.first_name AS student_first_name, u.last_name AS student_last_name, 
                c.title AS course_title
         FROM reviews r
         JOIN students s ON r.student_id = s.id
         JOIN users u ON s.user_id = u.id  -- Fix: Fetch student names from users table
         JOIN courses c ON r.course_id = c.id
         WHERE r.tutor_id = ?`,
      [tutorId]
    );

    console.log("📤 Sending Reviews:", reviews);
    res.status(200).json(reviews);
  } catch (error) {
    console.error("❌ Error fetching tutor reviews:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 🔹 GET: Fetch all reviews written by a specific student
 */
router.get("/student", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;

    const [reviews] = await db.query(
      `SELECT r.rating, r.review, r.created_at, 
              u.first_name AS tutor_first_name, u.last_name AS tutor_last_name, 
              c.title AS course_title
       FROM reviews r
       JOIN tutors t ON r.tutor_id = t.id
       JOIN users u ON t.user_id = u.id  -- Fix: Fetch tutor names from users table
       JOIN courses c ON r.course_id = c.ida
       WHERE r.student_id = ?`,
      [student_id]
    );

    res.status(200).json(reviews);
  } catch (error) {
    console.error("❌ Error fetching student reviews:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 🔹 GET: Fetch student's completed courses (For Review Page)
 */
router.get("/student/courses", authenticate, async (req, res) => {
  try {
    const student_id = req.user.id;
    const [courses] = await db.query(
      `SELECT c.id, c.title, c.tutor_id, u.first_name, u.last_name 
       FROM courses c 
       JOIN enrollments e ON c.id = e.course_id 
       JOIN tutors t ON c.tutor_id = t.id 
       JOIN users u ON t.user_id = u.id  -- Fix: Fetch tutor names from users table
       WHERE e.student_id = ?`,
      [student_id]
    );

    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Error fetching student courses:", error);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * 🔹 DELETE: Allow student to delete their own review
 */
router.delete("/:reviewId", authenticate, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const student_id = req.user.id;

    // ✅ Ensure the review belongs to the student
    const [review] = await db.query(
      "SELECT * FROM reviews WHERE id = ? AND student_id = ?",
      [reviewId, student_id]
    );

    if (review.length === 0) {
      return res
        .status(404)
        .json({ message: "Review not found or unauthorized." });
    }

    // ✅ Delete the review
    await db.query("DELETE FROM reviews WHERE id = ?", [reviewId]);

    res.status(200).json({ message: "Review deleted successfully!" });
  } catch (error) {
    console.error("❌ Error deleting review:", error);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
