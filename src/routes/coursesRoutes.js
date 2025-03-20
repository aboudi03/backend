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
      SELECT c.id, c.title, c.description, c.price, c.category, c.file_id, 
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
    `;

    const [courses] = await db.query(sql);

    console.log("✅ Courses retrieved:", courses);
    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Error fetching courses:", error);
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

/**
 * 🔹 POST: Add a new course (Tutors Only) - Stores fileId in MySQL
 */
router.post("/", authenticate, ensureTutor, async (req, res) => {
  try {
    console.log("📄 Data received in backend:", req.body);
    const { title, description, price, category, fileId } = req.body;

    if (!title || !description || !price || !category || !fileId) {
      console.error("❌ Missing required fields:", { title, description, price, category, fileId });
      return res.status(400).json({ message: "All fields, including file upload, are required." });
    }

    const userId = req.user.id;
    console.log("🟢 Authenticated tutor ID:", userId);

    // Ensure tutor exists
    const [tutor] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    if (tutor.length === 0) {
      console.error("❌ Tutor not found in database.");
      return res.status(403).json({ message: "You are not a registered tutor." });
    }

    const tutorId = tutor[0].id;
    console.log("✅ Tutor ID:", tutorId);

    // Insert course into MySQL
    const [result] = await db.query(
      "INSERT INTO courses (title, description, tutor_id, price, category, file_id) VALUES (?, ?, ?, ?, ?, ?)",
      [title, description, tutorId, parseFloat(price), category.trim().toLowerCase(), fileId]
    );

    console.log("✅ Course inserted into MySQL. Course ID:", result.insertId);
    res.status(201).json({
      message: "Course added successfully!",
      courseId: result.insertId,
    });

  } catch (error) {
    console.error("❌ MySQL Insert Error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

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

module.exports = router;
