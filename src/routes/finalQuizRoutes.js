const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

// ✅ GET all final quiz questions for a course
router.get("/:courseId", authenticate, async (req, res) => {
  const { courseId } = req.params;
  try {
    const [questions] = await db.query(
      "SELECT id, question, options FROM final_quiz_questions WHERE course_id = ?",
      [courseId]
    );
    res.json(questions);
  } catch (err) {
    console.error("❌ Error fetching final quiz questions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ POST multiple final quiz questions at once
router.post(
  "/tutor/add-final-questions",
  authenticate,
  ensureTutor,
  async (req, res) => {
    const { course_id, questions } = req.body;

    if (!course_id || !Array.isArray(questions) || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "course_id and questions[] required." });
    }

    // Validate each question
    for (const q of questions) {
      if (
        !q.question_text?.trim() ||
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.some((o) => typeof o !== "string" || !o.trim()) ||
        !q.correct_option?.trim() ||
        !q.options.includes(q.correct_option)
      ) {
        return res.status(400).json({
          message:
            "Each question must have text, ≥2 options, and a valid correct_option.",
        });
      }
    }

    try {
      const values = questions.map((q) => [
        course_id,
        q.question_text.trim(),
        JSON.stringify(q.options),
        q.correct_option.trim(),
      ]);

      await db.query(
        `INSERT INTO final_quiz_questions (course_id, question, options, correct_answer)
         VALUES ?`,
        [values]
      );

      res.status(201).json({ message: "Final quiz questions saved." });
    } catch (err) {
      console.error("❌ Final quiz insert error:", err);
      res
        .status(500)
        .json({ message: "Server error while adding final quiz questions." });
    }
  }
);

router.post("/:courseId/submit", authenticate, async (req, res) => {
    const studentId = req.user.id;
    const courseId = req.params.courseId;
    const { answers } = req.body;
  
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "Invalid submission payload." });
    }
  
    try {
      const [questions] = await db.query(
        "SELECT id, correct_answer FROM final_quiz_questions WHERE course_id = ?",
        [courseId]
      );
  
      let correct = 0;
      const total = questions.length;
  
      for (const q of questions) {
        const studentAnswer = answers.find((a) => a.questionId === q.id);
        if (studentAnswer?.selectedOption === q.correct_answer) {
          correct++;
        }
      }
  
      const score = (correct / total) * 100;
      const passed = score >= 60;
  
      await db.query(
        `INSERT INTO final_quiz_submissions (student_id, course_id, score, passed)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), passed = VALUES(passed), submitted_at = NOW()`,
        [studentId, courseId, score, passed ? 1 : 0]
      );
  
      if (passed) {
        // ✅ Issue certificate
        await db.query(
          `INSERT IGNORE INTO certificates (student_id, course_id, issued_at)
           VALUES (?, ?, NOW())`,
          [studentId, courseId]
        );
  
        // ✅ Set progress to 100%
        await db.query(
          `UPDATE enrollments SET progress = 100 WHERE student_id = ? AND course_id = ?`,
          [studentId, courseId]
        );
      }
  
      res.json({ score, passed });
    } catch (err) {
      console.error("❌ Final quiz submission error:", err);
      res.status(500).json({ message: "Server error during quiz submission." });
    }
  });
  
  // GET /api/final-quiz/:courseId/status
router.get("/:courseId/status", authenticate, async (req, res) => {
    const { courseId } = req.params;
    const studentId = req.user.id;
  
    try {
      const [results] = await db.query(
        `SELECT passed FROM final_quiz_submissions 
         WHERE course_id = ? AND student_id = ? ORDER BY submitted_at DESC LIMIT 1`,
        [courseId, studentId]
      );
  
      const passed = results.length > 0 && results[0].passed === 1;
      res.json({ passed });
    } catch (err) {
      console.error("❌ Final quiz status check error:", err);
      res.status(500).json({ passed: false });
    }
  });
  

  

module.exports = router;
