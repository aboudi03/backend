const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

/**
 * 🔹 GET /:chapterId/questions
 * Fetch all quiz questions for a chapter
 */
router.get("/:chapterId/questions", authenticate, async (req, res) => {
  const chapterId = req.params.chapterId;
  console.log("✅ HIT QUIZ FETCH route with chapterId:", chapterId);

  try {
    const [questions] = await db.query(
      "SELECT id, question_text, options FROM quiz_questions WHERE chapter_id = ?",
      [chapterId]
    );

    const parsed = questions.map((q) => {
      let parsedOptions = [];
      try {
        if (typeof q.options === "string") {
          console.log(`📦 Raw options string for Q${q.id}:`, q.options);
          parsedOptions = JSON.parse(q.options);
        } else {
          parsedOptions = q.options;
        }

        if (!Array.isArray(parsedOptions)) throw new Error("Options is not an array");
      } catch (err) {
        console.warn(`⚠️ Failed to parse options for question ${q.id}:`, err);
        parsedOptions = [];
      }

      return {
        id: q.id,
        question_text: q.question_text,
        options: parsedOptions,
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error("❌ Error fetching quiz questions:", err);
    res.status(500).json({ message: "Failed to load questions" });
  }
});


/**
 * 🔹 POST /:chapterId/submit
 * Student submits a quiz for a chapter (max 2 attempts)
 */
router.post("/:chapterId/submit", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const chapterId = req.params.chapterId;
  const { answers } = req.body;

  try {
    console.log("📨 Received submission:", { studentId, chapterId, answers });

    const [quizRow] = await db.query(
      "SELECT id FROM quizzes WHERE chapter_number = ?",
      [chapterId]
    );

    if (quizRow.length === 0) {
      return res.status(404).json({ message: "Quiz not found for this chapter." });
    }

    const quizId = quizRow[0].id;

    router.get("/:chapterId/attempt", authenticate, async (req, res) => {
      const studentId = req.user.id;
      const chapterId = req.params.chapterId;
    
      try {
        const [quizRow] = await db.query(
          "SELECT id FROM quizzes WHERE chapter_number = ?",
          [chapterId]
        );
        if (!quizRow.length) return res.status(404).json({ message: "Quiz not found." });
    
        const quizId = quizRow[0].id;
    
        const [attempts] = await db.query(
          "SELECT score, passed, submitted_at FROM quiz_submissions WHERE student_id = ? AND quiz_id = ?",
          [studentId, quizId]
        );
    
        if (!attempts.length) {
          return res.json({ attempted: false });
        }
    
        res.json({
          attempted: true,
          score: attempts[0].score,
          passed: attempts[0].passed,
          submittedAt: attempts[0].submitted_at,
        });
      } catch (err) {
        console.error("❌ Error checking attempt:", err);
        res.status(500).json({ message: "Failed to fetch attempt." });
      }
    });
    

    // Check how many submissions student already made
    const [previousAttempts] = await db.query(
      "SELECT * FROM quiz_submissions WHERE student_id = ? AND quiz_id = ?",
      [studentId, quizId]
    );

    const attemptCount = previousAttempts.length;
    if (attemptCount >= 10) {
      return res.status(403).json({ message: "You have reached the maximum number of attempts." });
    }

    // Get correct answers
    const [correctAnswers] = await db.query(
      "SELECT id, correct_option FROM quiz_questions WHERE chapter_id = ?",
      [chapterId]
    );

    let correctCount = 0;
    const evaluation = correctAnswers.map((q) => {
      const studentAnswer = answers.find((a) => a.questionId === q.id);
      const isCorrect = studentAnswer?.selectedOption === q.correct_option;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        correct: isCorrect,
        correctOption: q.correct_option,
        selected: studentAnswer?.selectedOption || null,
      };
    });

    const total = correctAnswers.length;
    const score = total > 0 ? (correctCount / total) * 100 : 0;
    const passed = score >= 60;

    
    await db.query(
      `INSERT INTO quiz_submissions (student_id, quiz_id, score, passed)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score), passed = VALUES(passed), submitted_at = CURRENT_TIMESTAMP`,
      [studentId, quizId, score, passed ? 1 : 0]
    );


    // Save in quiz_results (used for unlocking chapters)
    await db.query(
      `REPLACE INTO quiz_results (student_id, chapter_id, score)
       VALUES (?, ?, ?)`,
      [studentId, chapterId, score]
    );
    console.log("✅ Evaluation complete", { score, passed });

    res.json({
      message: "Quiz submitted",
      score,
      passed,
      correctAnswers: Object.fromEntries(correctAnswers.map(q => [q.id, q.correct_option])),
      attempt: attemptCount + 1,
      retryAvailable: attemptCount + 1 < 10
    });
  } catch (err) {
    console.error("🔥 Full error:", err);

    console.error("❌ Error submitting quiz:", err);
    res.status(500).json({ message: "Error evaluating quiz" });
  }
});

router.get("/:chapterId/status", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const chapterId = req.params.chapterId;

  try {
    const [quizRow] = await db.query(
      "SELECT id FROM quizzes WHERE chapter_number = ?",
      [chapterId]
    );

    if (!quizRow.length) {
      return res.json({ submitted: false });
    }

    const quizId = quizRow[0].id;

    const [attempts] = await db.query(
      `SELECT score, passed FROM quiz_submissions 
       WHERE student_id = ? AND quiz_id = ?
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [studentId, quizId]
    );

    if (!attempts.length) return res.json({ submitted: false });

    const passed = attempts[0].passed === 1;
    const score = Number(attempts[0].score);

    return res.json({
      submitted: true,
      score,
      passed,
      attempt: attempts.length,
      retryAvailable: !passed && attempts.length < 10
    });
  } catch (err) {
    console.error("❌ Quiz status error:", err);
    res.status(500).json({ message: "Server error checking quiz access" });
  }
});



/**
 * 🔹 GET /accessible/:courseId
 * Get accessible chapters based on quiz_results
 */
router.get("/accessible/:courseId", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const courseId = Number(req.params.courseId);

  try {
    const [chapters] = await db.query(
      "SELECT id FROM course_sections WHERE course_id = ? ORDER BY order_index ASC",
      [courseId]
    );

    if (!chapters.length) return res.json({ chapterIds: [] });

    const [results] = await db.query(
      "SELECT chapter_id, score FROM quiz_results WHERE student_id = ?",
      [studentId]
    );

    const scoreMap = Object.fromEntries(results.map(r => [r.chapter_id, r.score]));

    const accessible = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapterId = Number(chapters[i].id);
      if (i === 0 || i === 1 || scoreMap[chapters[i - 1].id] >= 60) {
        accessible.push(chapterId);
      } else {
        break;
      }
    }

    res.json({ chapterIds: accessible });
  } catch (err) {
    console.error("❌ Error getting accessible chapters:", err);
    res.status(500).json({ message: "Failed to get accessible chapters" });
  }
});

/**
 * 🔹 POST /tutor/add-question
 * Tutor adds a quiz question (auto-creates quiz if needed)
 */
router.post("/tutor/add-question", authenticate, ensureTutor, async (req, res) => {
  const { course_id, chapter_id, question_text, options, correct_option } = req.body;
  const tutorUserId = req.user.id;

  if (!course_id || !chapter_id || !question_text || !options || !correct_option) {
    return res.status(400).json({ message: "All fields required." });
  }

  // ✅ Validate options
  if (!Array.isArray(options) || options.some(opt => typeof opt !== "string")) {
    return res.status(400).json({ message: "Options must be an array of strings." });
  }

  try {
    // Make sure tutor owns this course
    const [ownership] = await db.query(
      "SELECT c.id FROM courses c JOIN tutors t ON c.tutor_id = t.id WHERE c.id = ? AND t.user_id = ?",
      [course_id, tutorUserId]
    );

    if (!ownership.length) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    // Check if quiz already exists
    const [quizRows] = await db.query(
      "SELECT id FROM quizzes WHERE course_id = ? AND chapter_number = ?",
      [course_id, chapter_id]
    );

    let quizId;
    if (quizRows.length === 0) {
      const [inserted] = await db.query(
        "INSERT INTO quizzes (course_id, chapter_number, title) VALUES (?, ?, ?)",
        [course_id, chapter_id, `Quiz for Chapter ${chapter_id}`]
      );
      quizId = inserted.insertId;
    } else {
      quizId = quizRows[0].id;
    }

    // Insert quiz question
    await db.query(
      `INSERT INTO quiz_questions (quiz_id, chapter_id, question_text, options, correct_option)
       VALUES (?, ?, ?, ?, ?)`,
      [quizId, chapter_id, question_text, JSON.stringify(options), correct_option]
    );

    res.status(201).json({ message: "Question added successfully." });
  } catch (err) {
    console.error("❌ Add Question Error:", err);
    res.status(500).json({ message: "Server error while adding question." });
  }
});

module.exports = router;
