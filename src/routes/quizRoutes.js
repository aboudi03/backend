const express          = require("express");
const db               = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor }  = require("../middleware/authTutor");

const router        = express.Router();
const MAX_ATTEMPTS  = 2;      // 1st try + 1 retry
const PASS_MARK     = 60;     // %

/* ────────────────────────────────────────────────────────────── */
/* 1. All questions for a chapter                                */
/* ────────────────────────────────────────────────────────────── */
router.get("/:chapterId/questions", authenticate, async (req, res) => {
  const chapterId = Number(req.params.chapterId);

  try {
    const [rows] = await db.query(
      "SELECT id, question_text, options FROM quiz_questions WHERE chapter_id = ?",
      [chapterId]
    );

    const questions = rows.map((q) => {
      let opts = q.options;
      if (typeof opts === "string") {
        try { opts = JSON.parse(opts); } catch { opts = []; }
      }
      if (!Array.isArray(opts)) opts = [];

      return { id: q.id, question_text: q.question_text, options: opts };
    });

    res.json(questions);
  } catch (err) {
    console.error("❌ /questions:", err);
    res.status(500).json({ message: "Failed to load questions" });
  }
});

/* ────────────────────────────────────────────────────────────── */
/* 2. Submit answers                                             */
/* ────────────────────────────────────────────────────────────── */
router.post("/:chapterId/submit", authenticate, async (req, res) => {
  const studentId  = req.user.id;
  const chapterId  = Number(req.params.chapterId);
  const { answers } = req.body; /* [{questionId, selectedOption}] */

  try {
    /* quiz id */
    const [[quiz]] = await db.query(
      "SELECT id FROM quizzes WHERE chapter_number = ?",
      [chapterId]
    );
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });
    const quizId = quiz.id;

    /* attempt count */
    const [[{ cnt }]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM quiz_submissions WHERE student_id = ? AND quiz_id = ?",
      [studentId, quizId]
    );
    if (cnt >= MAX_ATTEMPTS)
      return res.status(403).json({ message: "You have reached the maximum number of attempts." });

    /* mark answers */
    const [corr] = await db.query(
      "SELECT id, correct_option FROM quiz_questions WHERE chapter_id = ?",
      [chapterId]
    );

    let correctTotal = 0;
    const evaluation = corr.map((q) => {
      const stud = answers.find((a) => a.questionId === q.id);
      const ok   = stud?.selectedOption === q.correct_option;
      if (ok) correctTotal++;
      return { questionId: q.id, selected: stud?.selectedOption ?? null, correctOption: q.correct_option, correct: ok };
    });

    const score  = corr.length ? (correctTotal / corr.length) * 100 : 0;
    const passed = score >= PASS_MARK;

    await db.query(
      `INSERT INTO quiz_submissions (student_id, quiz_id, score, passed)
           VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE score = VALUES(score),
                                passed = VALUES(passed),
                                submitted_at = CURRENT_TIMESTAMP`,
      [studentId, quizId, score, passed ? 1 : 0]
    );

    const correctMap = Object.fromEntries(corr.map((q) => [q.id, q.correct_option]));

    res.json({
      message:        "Quiz submitted",
      score,
      passed,
      evaluation,
      correctAnswers: correctMap,
      attempt:        cnt + 1,
      retryAvailable: cnt + 1 < MAX_ATTEMPTS,
    });
  } catch (err) {
    console.error("❌ /submit:", err);
    res.status(500).json({ message: "Error evaluating quiz" });
  }
});

/* ────────────────────────────────────────────────────────────── */
/* 3. Latest attempt status                                      */
/* ────────────────────────────────────────────────────────────── */
router.get("/:chapterId/status", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const chapterId = Number(req.params.chapterId);

  try {
    const [[quiz]] = await db.query(
      "SELECT id FROM quizzes WHERE chapter_number = ?",
      [chapterId]
    );
    if (!quiz) return res.json({ submitted: false });
    const quizId = quiz.id;

    const [[latest]] = await db.query(
      `SELECT score, passed
         FROM quiz_submissions
        WHERE student_id = ? AND quiz_id = ?
     ORDER BY submitted_at DESC LIMIT 1`,
      [studentId, quizId]
    );
    if (!latest) return res.json({ submitted: false });

    const [[{ cnt }]] = await db.query(
      "SELECT COUNT(*) AS cnt FROM quiz_submissions WHERE student_id = ? AND quiz_id = ?",
      [studentId, quizId]
    );

    const [rows] = await db.query(
      "SELECT id, correct_option FROM quiz_questions WHERE chapter_id = ?",
      [chapterId]
    );
    const correctMap = Object.fromEntries(rows.map((r) => [r.id, r.correct_option]));

    res.json({
      submitted: true,
      score:     Number(latest.score),
      passed:    latest.passed === 1,
      attempt:   cnt,
      retryAvailable: latest.passed === 0 && cnt < MAX_ATTEMPTS,
      correctAnswers: correctMap,
    });
  } catch (err) {
    console.error("❌ /status:", err);
    res.status(500).json({ message: "Server error checking quiz status" });
  }
});

/* ────────────────────────────────────────────────────────────── */
/* 4. Chapters the student can open (FIXED unlock logic)         */
/* ────────────────────────────────────────────────────────────── */
router.get("/accessible/:courseId", authenticate, async (req, res) => {
  const studentId = req.user.id;
  const courseId  = Number(req.params.courseId);

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
    const scoreMap = Object.fromEntries(results.map((r) => [r.chapter_id, Number(r.score)]));

    const accessible = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapId        = Number(chapters[i].id);
      const prevChapterId = i > 0 ? Number(chapters[i - 1].id) : null;

      /* first two chapters always open */
      if (i < 2) {
        accessible.push(chapId);
        continue;
      }

      const prevScore = Number(scoreMap[prevChapterId] ?? 0);
      if (prevScore >= PASS_MARK) accessible.push(chapId);
      /* no break – we keep checking the rest */
    }

    res.json({ chapterIds: accessible });
  } catch (err) {
    console.error("❌ /accessible:", err);
    res.status(500).json({ message: "Failed to get accessible chapters" });
  }
});

/* ────────────────────────────────────────────────────────────── */
/* 5. Tutor adds a question (unchanged from your code)           */
/* ────────────────────────────────────────────────────────────── */
router.post("/tutor/add-question", authenticate, ensureTutor, async (req, res) => {
  const { course_id, chapter_id, question_text, options, correct_option } = req.body;
  const tutorUserId = req.user.id;

  if (!course_id || !chapter_id || !question_text || !options || !correct_option)
    return res.status(400).json({ message: "All fields required." });

  if (!Array.isArray(options) || options.some((o) => typeof o !== "string"))
    return res.status(400).json({ message: "Options must be an array of strings." });

  try {
    const [[own]] = await db.query(
      `SELECT c.id
         FROM courses c
         JOIN tutors t ON c.tutor_id = t.id
        WHERE c.id = ? AND t.user_id = ?`,
      [course_id, tutorUserId]
    );
    if (!own) return res.status(403).json({ message: "Unauthorized." });

    /* ensure quiz exists */
    const [[quiz]] = await db.query(
      "SELECT id FROM quizzes WHERE course_id = ? AND chapter_number = ?",
      [course_id, chapter_id]
    );
    const quizId = quiz
      ? quiz.id
      : (await db.query(
          "INSERT INTO quizzes (course_id, chapter_number, title) VALUES (?, ?, ?)",
          [course_id, chapter_id, `Quiz for Chapter ${chapter_id}`]
        ))[0].insertId;

    await db.query(
      `INSERT INTO quiz_questions
         (quiz_id, chapter_id, question_text, options, correct_option)
       VALUES (?, ?, ?, ?, ?)`,
      [quizId, chapter_id, question_text, JSON.stringify(options), correct_option]
    );

    res.status(201).json({ message: "Question added successfully." });
  } catch (err) {
    console.error("❌ add-question:", err);
    res.status(500).json({ message: "Server error while adding question." });
  }
});

module.exports = router;