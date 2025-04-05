const express = require("express");
const mongoose = require("mongoose");
const db = require("../db/db");
const { mongoConnection } = require("../db/mongo");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const { notifyAllStudents, notifyEnrolledStudents } = require("../utils/notificationHelper"); // 🔔 Import
require("dotenv").config();

const router = express.Router();

// ✅ Initialize GridFSBucket for file uploads (PDFs/Videos)
let gfsBucket;
mongoConnection.once("open", () => {
  gfsBucket = new GridFSBucket(mongoConnection.db, { bucketName: "uploads" });
  console.log("✅ GridFSBucket initialized.");
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 1) GET: Fetch all courses (with PDFs if any)
// ────────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;

    let sql = `
      SELECT c.id, c.title, c.description, c.price, c.category,
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
    `;
    const params = [];

    if (category) {
      sql += " WHERE c.category = ?";
      params.push(category.toLowerCase());
    }

    const [courses] = await db.query(sql, params);

    const courseWithPDFs = await Promise.all(
      courses.map(async (course) => {
        const [files] = await db.query(
          "SELECT file_id FROM course_files WHERE course_id = ? AND type = 'pdf'",
          [course.id]
        );

        const pdfs = files.map(
          (f) => `http://localhost:5003/api/courses/file/${f.file_id}`
        );

        return { ...course, pdfs };
      })
    );

    res.status(200).json(courseWithPDFs);
  } catch (error) {
    console.error("❌ Error fetching courses with PDFs:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});


// ────────────────────────────────────────────────────────────────────────────────
// ✅ 2) GET: Fetch all sessions/announcements (ARRAY of sessions)
// ────────────────────────────────────────────────────────────────────────────────
router.get("/sessions", async (req, res) => {
  try {
    // Query your `course_sessions` table
    const [sessions] = await db.query("SELECT * FROM course_sessions");

    // Return sessions as an array (no wrapping object)
    res.status(200).json(sessions);
  } catch (error) {
    console.error("❌ Error fetching sessions:", error);
    res.status(500).json({ message: "Failed to fetch sessions." });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 3) POST: Upload a single PDF/video to MongoDB (for tutors)
// ────────────────────────────────────────────────────────────────────────────────
router.post(
  "/upload",
  authenticate,
  ensureTutor,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }
    try {
      const uploadStream = gfsBucket.openUploadStream(req.file.originalname, {
        contentType: req.file.mimetype,
      });

      uploadStream.end(req.file.buffer);

      uploadStream.on("finish", () => {
        console.log("📂 File uploaded:", uploadStream.id);
        res.status(201).json({
          message: "File uploaded successfully.",
          fileId: uploadStream.id.toString(),
        });
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({ message: "Error uploading file." });
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 4) POST: Add a new course (+ multiple files) for tutors
// ────────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  ensureTutor,
  upload.array("files"),
  async (req, res) => {
    try {
      const { title, description, price, category, types } = req.body;

      if (
        !title ||
        !description ||
        !price ||
        !category ||
        !req.files ||
        req.files.length === 0
      ) {
        return res
          .status(400)
          .json({ message: "All fields including files are required." });
      }

      const userId = req.user.id;
      const [tutorRows] = await db.query(
        "SELECT id FROM tutors WHERE user_id = ?",
        [userId]
      );
      if (tutorRows.length === 0) {
        return res.status(403).json({ message: "Tutor not found." });
      }

      const tutorId = tutorRows[0].id;

      // Insert course into MySQL
      const [courseResult] = await db.query(
        "INSERT INTO courses (title, description, tutor_id, price, category) VALUES (?, ?, ?, ?, ?)",
        [
          title,
          description,
          tutorId,
          parseFloat(price),
          category.trim().toLowerCase(),
        ]
      );

      const courseId = courseResult.insertId;

      // 🔔 Notify all students
      await notifyAllStudents(`A new course "${title}" has been added.`, "new_course");

      // Handle file uploads
      const files = req.files;
      const fileTypes = JSON.parse(types);

      const uploadPromises = files.map((file, index) => {
        return new Promise((resolve, reject) => {
          const uploadStream = gfsBucket.openUploadStream(file.originalname, {
            contentType: file.mimetype,
          });

          uploadStream.end(file.buffer);

          uploadStream.on("finish", async () => {
            const fileId = uploadStream.id.toString();
            const fileType = fileTypes[index] || "pdf";

            await db.query(
              "INSERT INTO course_files (course_id, file_id, type) VALUES (?, ?, ?)",
              [courseId, fileId, fileType]
            );

            resolve();
          });

          uploadStream.on("error", reject);
        });
      });

      await Promise.all(uploadPromises);

      res.status(201).json({
        message: "Course and all files uploaded successfully",
        courseId,
      });
    } catch (err) {
      console.error("❌ Error adding course with files:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 5) POST: Add a live session or announcement to a course
// ────────────────────────────────────────────────────────────────────────────────
router.post("/:courseId/sessions", authenticate, ensureTutor, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, type, scheduled_at } = req.body;
    const duration = 60; // default if not provided
    const userId = req.user.id;

    if (!title || !type || !scheduled_at) {
      return res
        .status(400)
        .json({ message: "Title, type, and scheduled time are required." });
    }

    // Check ownership
    const [courseCheck] = await db.query(
      "SELECT * FROM courses WHERE id = ? AND tutor_id = (SELECT id FROM tutors WHERE user_id = ?)",
      [courseId, userId]
    );

    if (courseCheck.length === 0) {
      return res
        .status(403)
        .json({ message: "Unauthorized or course not found." });
    }

    // Insert session/announcement
    await db.query(
      `INSERT INTO course_sessions (course_id, tutor_id, title, description, type, scheduled_at, duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [courseId, courseCheck[0].tutor_id, title, description, type, scheduled_at, duration]
    );
       // 🔔 Notify enrolled students
       const sessionMessage =
       type === "announcement"
         ? `New announcement posted: "${title}"`
         : `Live session scheduled: "${title}"`;
 
 
 
    console.log("📢 Calling notifyEnrolledStudents for course:", courseId);
 
 
 
 
     await notifyEnrolledStudents(courseId, sessionMessage, type);

    res.status(201).json({ message: "Session/announcement created successfully!" });
  } catch (err) {
    console.error("❌ Error creating session:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 6) GET: Fetch a single file (PDF/Video) from MongoDB
// ────────────────────────────────────────────────────────────────────────────────
router.get("/file/:fileId", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const downloadStream = gfsBucket.openDownloadStream(fileId);

    res.set("Content-Type", "application/pdf");
    downloadStream.pipe(res);
  } catch (error) {
    console.error("❌ File fetch error:", error);
    res.status(500).json({ message: "Error fetching file." });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 7) GET: Fetch single course detail (+ PDFs/videos) by :id
// ────────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const courseId = req.params.id;
  try {
    const courseSql = `
      SELECT c.id, c.title, c.description, c.price, c.category,
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE c.id = ?
    `;
    const [results] = await db.query(courseSql, [courseId]);
    if (results.length === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    const course = results[0];
    const [files] = await db.query(
      `SELECT file_id, type FROM course_files WHERE course_id = ?`,
      [courseId]
    );

    const pdfs = files
      .filter((file) => file.type === "pdf")
      .map((file) => `http://localhost:5003/api/courses/file/${file.file_id}`);

    const videos = files
      .filter((file) => file.type === "video")
      .map((file) => `http://localhost:5003/api/courses/file/${file.file_id}`);

    res.status(200).json({
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      category: course.category,
      tutor: `${course.first_name} ${course.last_name}`,
      pdfs,
      videos,
      playlistUrl: null,
    });
  } catch (error) {
    console.error("❌ Error fetching course detail:", error);
    res.status(500).json({ message: "Failed to fetch course details." });
  }
});

// ✅ GET: Fetch all sessions or announcements (for calendar display)
router.get("/sessions", async (req, res) => {
  try {
    const [sessions] = await db.query(`
      SELECT id, course_id, tutor_id, title, description, type, scheduled_at, duration_minutes
      FROM course_sessions
      ORDER BY scheduled_at ASC
    `);

    if (!Array.isArray(sessions)) {
      console.error("❌ Expected an array, got:", sessions);
      return res.status(500).json({ message: "Unexpected response format." });
    }

    console.log("✅ Sessions fetched:", sessions.length, "entries");
    res.status(200).json(sessions);
  } catch (error) {
    console.error("❌ Error fetching sessions:", error);
    res.status(500).json({ message: "Failed to fetch sessions from the database." });
  }
});

// 📌 GET: Sessions/Announcements for Enrolled Courses (Student Only)
router.get("/student/schedule", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [sessions] = await db.query(`
      SELECT cs.id, cs.course_id, cs.tutor_id, cs.title, cs.description, cs.type, cs.scheduled_at, cs.duration_minutes
      FROM course_sessions cs
      JOIN enrollments e ON cs.course_id = e.course_id
      WHERE e.student_id = ?
      ORDER BY cs.scheduled_at ASC
    `, [userId]);

    res.status(200).json(sessions);
  } catch (err) {
    console.error("❌ Error fetching student schedule:", err);
    res.status(500).json({ message: "Failed to fetch schedule." });
  }
});
// ✅ DELETE: Remove a course by tutor
router.delete("/:id", authenticate, ensureTutor, async (req, res) => {
  const courseId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if this course belongs to the authenticated tutor
    const [check] = await db.query(
      `SELECT * FROM courses 
       WHERE id = ? AND tutor_id = (SELECT id FROM tutors WHERE user_id = ?)`,
      [courseId, userId]
    );

    if (check.length === 0) {
      return res.status(403).json({ message: "Not authorized or course not found." });
    }

    // Delete course (and cascade to related tables via FK constraints)
    await db.query("DELETE FROM courses WHERE id = ?", [courseId]);

    res.status(200).json({ message: "Course removed successfully." });
  } catch (err) {
    console.error("❌ Error deleting course:", err);
    res.status(500).json({ message: "Failed to delete course." });
  }
});


module.exports = router;
