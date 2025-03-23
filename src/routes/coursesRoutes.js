const express = require("express");
const mongoose = require("mongoose");
const db = require("../db/db");
const { mongoConnection } = require("../db/mongo");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
require("dotenv").config();

const router = express.Router();

// ✅ Initialize GridFSBucket
let gfsBucket;
mongoConnection.once("open", () => {
  gfsBucket = new GridFSBucket(mongoConnection.db, { bucketName: "uploads" });
  console.log("✅ GridFSBucket initialized.");
});

// ✅ Multer Storage Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * 🔹 GET: Fetch all courses from MySQL, with `file_id` for PDF preview
 */
router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT c.id, c.title, c.description, c.price, c.category,
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
    `;

    const [courses] = await db.query(sql);

    // Get PDFs per course
    const courseWithPDFs = await Promise.all(
      courses.map(async (course) => {
        const [files] = await db.query(
          "SELECT file_id FROM course_files WHERE course_id = ? AND type = 'pdf'",
          [course.id]
        );

        const pdfs = files.map((f) => `http://localhost:5003/api/courses/file/${f.file_id}`);

        return {
          ...course,
          pdfs,
        };
      })
    );

    res.status(200).json(courseWithPDFs);
  } catch (error) {
    console.error("❌ Error fetching courses with PDFs:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});



/**
 * 🔹 Upload PDF/Video File and Return fileId
 */
router.post("/upload", authenticate, ensureTutor, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const uploadStream = gfsBucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
      console.log("📂 File uploaded to MongoDB:", uploadStream.id);
      res.status(201).json({
        message: "File uploaded successfully.",
        fileId: uploadStream.id.toString(),
      });
    });

  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ message: "Error uploading file." });
  }
});

router.post(
  "/",
  authenticate,
  ensureTutor,
  upload.array("files"), // <-- handles multiple files
  async (req, res) => {
    try {
      const { title, description, price, category, types } = req.body;

      if (!title || !description || !price || !category || !req.files || req.files.length === 0) {
        return res.status(400).json({ message: "All fields including files are required." });
      }

      const userId = req.user.id;
      const [tutorRows] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
      if (tutorRows.length === 0) {
        return res.status(403).json({ message: "Tutor not found." });
      }

      const tutorId = tutorRows[0].id;

      // 1. Create the course
      const [courseResult] = await db.query(
        "INSERT INTO courses (title, description, tutor_id, price, category) VALUES (?, ?, ?, ?, ?)",
        [title, description, tutorId, parseFloat(price), category.trim().toLowerCase()]
      );

      const courseId = courseResult.insertId;

      // 2. Store files + link to course_files
      const files = req.files; // from multer
      const fileTypes = JSON.parse(types); // array of type per file, e.g. ['pdf', 'video']

      const uploadPromises = files.map((file, index) => {
        return new Promise((resolve, reject) => {
          const uploadStream = gfsBucket.openUploadStream(file.originalname, {
            contentType: file.mimetype,
          });

          uploadStream.end(file.buffer);

          uploadStream.on("finish", async () => {
            const fileId = uploadStream.id.toString();
            const fileType = fileTypes[index] || "pdf"; // default to pdf

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



/**
 * 🔹 GET: Fetch file (PDF/Video) from MongoDB
 */
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


router.get("/:id", async (req, res) => {
  const courseId = req.params.id;

  try {
    // Get course basic info
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

    // Get all files linked to this course from course_files table
    const [files] = await db.query(
      `SELECT file_id, type FROM course_files WHERE course_id = ?`,
      [courseId]
    );

    const pdfs = files
      .filter(file => file.type === "pdf")
      .map(file => `http://localhost:5003/api/courses/file/${file.file_id}`);

    const videos = files
      .filter(file => file.type === "video")
      .map(file => `http://localhost:5003/api/courses/file/${file.file_id}`);

    res.status(200).json({
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      category: course.category,
      tutor: `${course.first_name} ${course.last_name}`,
      pdfs,
      videos, // Optional — use in frontend if needed
      playlistUrl: null // You can replace this later if you add a column
    });
  } catch (error) {
    console.error("❌ Error fetching course detail:", error);
    res.status(500).json({ message: "Failed to fetch course details." });
  }
});



module.exports = router;
