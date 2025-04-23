const express = require("express");
const mongoose = require("mongoose");
const db = require("../db/db");
const { mongoConnection } = require("../db/mongo");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const {
  notifyAllStudents,
  notifyEnrolledStudents,
} = require("../utils/notificationHelper"); // 🔔 Import
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
// ✅ 1) GET: Fetch courses for the LOGGED-IN TUTOR (with PDFs if any)
// ────────────────────────────────────────────────────────────────────────────────
router.get("/", authenticate, ensureTutor, async (req, res) => {
  // Added authenticate and ensureTutor middleware
  try {
    const { category } = req.query;
    const userId = req.user.id; // Get user ID from authenticated session

    // Find the tutor ID associated with the user ID
    const [tutorRows] = await db.query(
      "SELECT id FROM tutors WHERE user_id = ?",
      [userId]
    );

    if (tutorRows.length === 0) {
      return res.status(403).json({ message: "Tutor profile not found." });
    }
    const tutorId = tutorRows[0].id;

    let sql = `
      SELECT c.id, c.title, c.description, c.price, c.category,
             t.user_id AS tutor_id, u.first_name, u.last_name
      FROM courses c
      JOIN tutors t ON c.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE c.tutor_id = ? -- Filter by the logged-in tutor's ID
    `;
    const params = [tutorId]; // Start params with tutorId

    if (category) {
      sql += " AND c.category = ?"; // Add category filter with AND
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
// ✅ 1.1) GET: Fetch public courses (no auth required)
// ────────────────────────────────────────────────────────────────────────────────
router.get("/public", async (req, res) => {
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
    res.status(200).json(courses);
  } catch (error) {
    console.error("❌ Error fetching public courses:", error);
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
// ✅ 4) POST: Add a new course (+ multiple files organized by section) for tutors
// ────────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  ensureTutor,
  upload.any(), // Use upload.any() to accept files with arbitrary field names
  async (req, res) => {
    console.log("--- Add Course Request Start ---"); // Log start
    console.log("Received Body:", req.body); // Log body
    console.log("Received Files:", req.files); // Log files
    try {
      // Destructure basic course info and the new sections structure
      const {
        title,
        description,
        price,
        category,
        sections: sectionsJson,
      } = req.body;
      const files = req.files; // All uploaded files are in req.files

      if (
        !title ||
        !description ||
        !price ||
        !category ||
        !sectionsJson ||
        !files ||
        files.length === 0
      ) {
        return res.status(400).json({
          message:
            "All fields, including section structure and at least one file, are required.",
        });
      }

      let sections;
      try {
        sections = JSON.parse(sectionsJson);
        console.log("Parsed Sections:", sections); // Log parsed sections
        if (!Array.isArray(sections) || sections.length === 0) {
          throw new Error("Invalid sections format.");
        }
      } catch (e) {
        return res.status(400).json({ message: "Invalid sections JSON data." });
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

      // --- Database Transaction --- (Recommended for multi-step operations)
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // 1. Insert course into MySQL
        const [courseResult] = await connection.query(
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

        // 🔔 Notify all students (Consider moving after successful commit)
        // await notifyAllStudents(`A new course "${title}" has been added.`, "new_course");

        // 2. Process sections and files
        // Organize files by section index based on fieldname
        const filesBySection = {};
        for (const file of files) {
          const match = file.fieldname.match(/^section_(\d+)_file_(\d+)$/);
          if (match) {
            const sectionIndex = parseInt(match[1], 10);
            const fileIndex = parseInt(match[2], 10);
            if (!filesBySection[sectionIndex]) {
              filesBySection[sectionIndex] = [];
            }
            // Store file with its original index for ordering
            filesBySection[sectionIndex][fileIndex] = file;
          } else {
            console.warn(
              `Skipping file with unexpected fieldname: ${file.fieldname}`
            );
          }
        }
        console.log("Files Organized by Section:", filesBySection); // Log organized files

        for (const [sectionIndex, sectionData] of sections.entries()) {
          console.log(`Processing Section ${sectionIndex}:`, sectionData); // Log section being processed
          if (!sectionData.name || typeof sectionData.fileCount !== "number") {
            throw new Error(`Invalid data for section ${sectionIndex}.`);
          }

          // Insert section
          const [sectionResult] = await connection.query(
            "INSERT INTO course_sections (course_id, name, order_index) VALUES (?, ?, ?)",
            [courseId, sectionData.name, sectionIndex]
          );
          const sectionId = sectionResult.insertId;

          // Process files for this section using the organized structure
          const sectionFiles = (filesBySection[sectionIndex] || []).filter(
            (f) => f
          ); // Get files for this section, filter out empty slots if any
          console.log(
            `Section ${sectionIndex} - Parsed Files Count: ${sectionFiles.length}, Expected Count (from body): ${sectionData.fileCount}`
          ); // Log counts before check

          if (sectionFiles.length !== sectionData.fileCount) {
            console.error(
              `File count mismatch error for section ${sectionIndex}. Expected ${sectionData.fileCount}, got ${sectionFiles.length}.`
            ); // Log mismatch error
            throw new Error(
              `File count mismatch for section ${sectionIndex}. Expected ${sectionData.fileCount}, got ${sectionFiles.length}. Check backend file parsing logic.`
            );
          }

          // Sort files by their original index to maintain order
          // sectionFiles.sort((a, b) => {
          //   const indexA = parseInt(a.fieldname.match(/_file_(\d+)$/)[1], 10);
          //   const indexB = parseInt(b.fieldname.match(/_file_(\d+)$/)[1], 10);
          //   return indexA - indexB;
          // });

          const uploadPromises = sectionFiles.map((file, fileIndex) => {
            // fileIndex here is the index within the sorted sectionFiles array
            return new Promise((resolve, reject) => {
              const uploadStream = gfsBucket.openUploadStream(
                file.originalname,
                {
                  contentType: file.mimetype,
                }
              );

              uploadStream.end(file.buffer);

              uploadStream.on("finish", async () => {
                try {
                  const fileId = uploadStream.id.toString();
                  // Determine file type (e.e., from mimetype or keep simple 'file')
                  const fileType = file.mimetype.startsWith("video")
                    ? "video"
                    : file.mimetype === "application/pdf"
                    ? "pdf"
                    : "other";
                  console.log(
                    `DB Insert course_files: courseId=${courseId}, sectionId=${sectionId}, fileId=${fileId}, type=${fileType}, order=${fileIndex}, name=${file.originalname}`
                  ); // Log DB insert details

                  // Insert into course_files, linking to the section
                  // You'll need to add `section_id` and `order_index` columns to `course_files` table and make `type` more generic or remove it if storing in sections.
                  // ALTER TABLE course_files ADD COLUMN section_id INT NULL, ADD COLUMN order_index INT NULL, ADD CONSTRAINT fk_section FOREIGN KEY (section_id) REFERENCES course_sections(id);
                  await connection.query(
                    "INSERT INTO course_files (course_id, section_id, file_id, type, order_index, original_name) VALUES (?, ?, ?, ?, ?, ?)",
                    [
                      courseId,
                      sectionId,
                      fileId,
                      fileType,
                      fileIndex,
                      file.originalname,
                    ] // Store original name
                  );
                  resolve();
                } catch (dbError) {
                  console.error(
                    `❌ DB Error inserting file record for ${file.originalname}:`,
                    dbError
                  ); // Log DB error
                  reject(dbError);
                }
              });

              uploadStream.on("error", (uploadError) => {
                console.error(
                  `❌ Error uploading file ${file.originalname} to GridFS:`,
                  uploadError
                );
                reject(uploadError);
              });
            });
          });

          await Promise.all(uploadPromises);
        }

        // Commit transaction
        await connection.commit();
        console.log(`✅ Course ${courseId} committed successfully.`); // Log commit

        // 🔔 Notify after successful commit
        await notifyAllStudents(
          `A new course "${title}" has been added.`,
          "new_course"
        );

        res
          .status(201)
          .json({ message: "Course added successfully.", courseId });
      } catch (error) {
        // Rollback transaction on error
        await connection.rollback();
        console.error(
          "❌ Error during course creation transaction (rolled back):",
          error
        ); // Log transaction error
        // Clean up potentially uploaded GridFS files if needed (more complex)
        res
          .status(500)
          .json({ message: "Failed to add course.", error: error.message });
      } finally {
        connection.release(); // Release connection back to the pool
        console.log("--- Add Course Request End (Transaction Finished) ---"); // Log end
      }
    } catch (error) {
      // Catch errors before transaction starts
      console.error("❌ Error adding course (before transaction):", error); // Log pre-transaction error
      res
        .status(500)
        .json({ message: "Failed to add course.", error: error.message });
      console.log("--- Add Course Request End (Error Before Transaction) ---"); // Log end
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 5) POST: Add a live session or announcement to a course
// ────────────────────────────────────────────────────────────────────────────────
router.post(
  "/:courseId/sessions",
  authenticate,
  ensureTutor,
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const { title, description, type, scheduled_at, visibility } = req.body;
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
        `INSERT INTO course_sessions (course_id, tutor_id, title, description, type, scheduled_at, duration_minutes, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          courseId,
          courseCheck[0].tutor_id,
          title,
          description,
          type,
          scheduled_at,
          duration,
          visibility || "private",
        ]
      );
      // 🔔 Notify enrolled students
      const sessionMessage =
        type === "announcement"
          ? `New announcement posted: "${title}"`
          : `Live session scheduled: "${title}"`;

      console.log("📢 Calling notifyEnrolledStudents for course:", courseId);

      await notifyEnrolledStudents(courseId, sessionMessage, type);

      res
        .status(201)
        .json({ message: "Session/announcement created successfully!" });
    } catch (err) {
      console.error("❌ Error creating session:", err);
      res.status(500).json({ message: "Server error." });
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 6) GET: Fetch a single file (PDF/Video) from MongoDB
// ────────────────────────────────────────────────────────────────────────────────
router.get("/file/:fileId", async (req, res) => {
  try {
    if (!gfsBucket) {
      return res.status(500).json({
        message:
          "Database connection not ready yet. Please try again in a moment.",
      });
    }

    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    // First, find the file metadata to get its content type
    const files = await mongoConnection.db
      .collection("uploads.files")
      .find({ _id: fileId })
      .toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }

    // Get the file's content type from its metadata
    const contentType = files[0].contentType;
    console.log(`Serving file ${fileId} with content type: ${contentType}`);

    // Set the appropriate content type based on the file
    res.set("Content-Type", contentType);

    // Open the download stream and pipe it to the response
    const downloadStream = gfsBucket.openDownloadStream(fileId);

    // Handle potential errors in the stream
    downloadStream.on("error", (error) => {
      console.error("Download stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error streaming file" });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("❌ File fetch error:", error);
    res.status(500).json({ message: "Error fetching file." });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ✅ 7) GET: Fetch single course detail (+ PDFs/videos) by :id
// ────────────────────────────────────────────────────────────────────────────────
router.get("/:id", authenticate, async (req, res) => {
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

    const [sectionsResult] = await db.query(
      `SELECT id, name AS title, order_index 
       FROM course_sections 
       WHERE course_id = ? 
       ORDER BY order_index ASC`,
      [courseId]
    );

    const [allFilesResult] = await db.query(
      `SELECT id, section_id, file_id, original_name AS name, order_index 
       FROM course_files 
       WHERE course_id = ? 
       ORDER BY section_id, order_index ASC`,
      [courseId]
    );

    const filesBySection = allFilesResult.reduce((acc, file) => {
      const sectionId = file.section_id;
      if (!acc[sectionId]) acc[sectionId] = [];
      acc[sectionId].push({
        id: file.id,
        name: file.name,
        url: `http://localhost:5003/api/courses/file/${file.file_id}`,
      });
      return acc;
    }, {});

    let sections = [];
    if (sectionsResult.length > 0) {
      sections = sectionsResult.map((section) => ({
        id: section.id,
        title: section.title,
        files: filesBySection[section.id] || [],
      }));
    } else {
      const [legacyFilesResult] = await db.query(
        `SELECT id, file_id, original_name AS name 
         FROM course_files 
         WHERE course_id = ? AND section_id IS NULL 
         ORDER BY order_index ASC`,
        [courseId]
      );

      if (legacyFilesResult.length > 0) {
        const legacyFiles = legacyFilesResult.map((file) => ({
          id: file.id,
          name: file.name,
          url: `http://localhost:5003/api/courses/file/${file.file_id}`,
        }));
        sections = [
          {
            id: "default-section",
            title: "Course Content",
            files: legacyFiles,
          },
        ];
      }
    }

    let progress = null;
    let passedChapters = [];
    let isEnrolled = false;

    if (req.user && req.user.id) {
      const studentId = req.user.id;

      // Check if the student is enrolled in this course
      const [enrollment] = await db.query(
        "SELECT progress FROM enrollments WHERE student_id = ? AND course_id = ?",
        [studentId, courseId]
      );

      isEnrolled = enrollment.length > 0;

      if (isEnrolled) {
        progress = enrollment[0].progress;

        // Fetch passed chapters
        const [passedRows] = await db.query(
          `SELECT chapter_id FROM quiz_results 
           WHERE student_id = ? AND score >= 60`,
          [studentId]
        );
        passedChapters = passedRows.map((r) => r.chapter_id);
      }
    }

    res.status(200).json({
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      category: course.category,
      tutor: `${course.first_name} ${course.last_name}`,
      sections,
      playlistUrl: null,
      progress,
      passedChapters,
      isEnrolled, // Include enrollment status in the response
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
     SELECT 
  cs.id,
  cs.course_id,
  cs.tutor_id,
  cs.title,
  cs.description,
  cs.type,
  cs.scheduled_at,
  cs.duration_minutes,
  c.title AS course_title
FROM course_sessions cs
JOIN courses c ON cs.course_id = c.id
ORDER BY cs.scheduled_at ASC

    `);

    if (!Array.isArray(sessions)) {
      console.error("❌ Expected an array, got:", sessions);
      return res.status(500).json({ message: "Unexpected response format." });
    }

    console.log("✅ Sessions fetched:", sessions.length, "entries");
    res.status(200).json(sessions);
  } catch (error) {
    console.error("❌ Error fetching sessions:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch sessions from the database." });
  }
});

// 📌 GET: Sessions/Announcements for Enrolled Courses (Student Only)
router.get("/student/schedule", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [sessions] = await db.query(
      `
      SELECT cs.id, cs.course_id, cs.tutor_id, cs.title, cs.description, cs.type, cs.scheduled_at, cs.duration_minutes
      FROM course_sessions cs
      JOIN enrollments e ON cs.course_id = e.course_id
      WHERE e.student_id = ?
      ORDER BY cs.scheduled_at ASC
    `,
      [userId]
    );

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
      return res
        .status(403)
        .json({ message: "Not authorized or course not found." });
    }

    // Delete course (and cascade to related tables via FK constraints)
    await db.query("DELETE FROM courses WHERE id = ?", [courseId]);

    res.status(200).json({ message: "Course removed successfully." });
  } catch (err) {
    console.error("❌ Error deleting course:", err);
    res.status(500).json({ message: "Failed to delete course." });
  }
});

// ✅ GET: Fetch all public announcements
router.get("/announcements/public", async (req, res) => {
  try {
    const [announcements] = await db.query(`
       SELECT cs.title, cs.description, cs.type, cs.scheduled_at, u.first_name, u.last_name
      FROM course_sessions cs
      JOIN tutors t ON cs.tutor_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE cs.visibility = 'public'
      ORDER BY cs.scheduled_at DESC
      LIMIT 6
    `);
    res.status(200).json(announcements);
  } catch (err) {
    console.error("❌ Error fetching public announcements:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ PUT: Update a course by tutor
router.put(
  "/:id",
  authenticate,
  ensureTutor,
  upload.any(),
  async (req, res) => {
    const courseId = req.params.id;
    const userId = req.user.id;

    console.log("--- Update Course Request Start ---");
    console.log("Received Body:", req.body);
    console.log("Received Files:", req.files);

    try {
      // Destructure course data
      const {
        title,
        description,
        price,
        category,
        sections: sectionsJson,
        removedFiles,
      } = req.body;
      const files = req.files || [];
      let removedFilesArray = [];

      if (removedFiles) {
        try {
          removedFilesArray = JSON.parse(removedFiles);
        } catch (e) {
          console.error("Error parsing removedFiles:", e);
        }
      }

      // Check if this course belongs to the authenticated tutor
      const [tutorRows] = await db.query(
        "SELECT id FROM tutors WHERE user_id = ?",
        [userId]
      );
      if (tutorRows.length === 0) {
        return res.status(403).json({ message: "Tutor profile not found." });
      }
      const tutorId = tutorRows[0].id;

      const [check] = await db.query(
        `SELECT * FROM courses 
       WHERE id = ? AND tutor_id = ?`,
        [courseId, tutorId]
      );

      if (check.length === 0) {
        return res
          .status(403)
          .json({ message: "Not authorized or course not found." });
      }

      // Start a transaction
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // 1. Update basic course info
        await connection.query(
          "UPDATE courses SET title = ?, description = ?, price = ?, category = ? WHERE id = ?",
          [
            title,
            description,
            parseFloat(price),
            category.toLowerCase(),
            courseId,
          ]
        );

        // 2. Process sections from JSON
        let sections = [];
        if (sectionsJson) {
          try {
            sections = JSON.parse(sectionsJson);
            console.log("Parsed Sections:", sections);
            if (!Array.isArray(sections)) {
              throw new Error("Invalid sections format.");
            }
          } catch (e) {
            await connection.rollback();
            connection.release();
            return res
              .status(400)
              .json({ message: "Invalid sections JSON data." });
          }
        }

        // 3. Delete removed files if any
        if (removedFilesArray.length > 0) {
          for (const fileId of removedFilesArray) {
            // Get the GridFS file_id before deleting the record
            const [fileRecord] = await connection.query(
              "SELECT file_id FROM course_files WHERE id = ?",
              [fileId]
            );

            if (fileRecord.length > 0) {
              const gridFsFileId = fileRecord[0].file_id;

              // Delete from course_files table
              await connection.query("DELETE FROM course_files WHERE id = ?", [
                fileId,
              ]);

              // Delete from GridFS
              try {
                const objectId = new mongoose.Types.ObjectId(gridFsFileId);
                gfsBucket.delete(objectId);
              } catch (err) {
                console.error(`Error deleting file from GridFS: ${err}`);
                // Continue even if GridFS deletion fails
              }
            }
          }
        }

        // 4. Process section updates
        for (const [sectionIndex, sectionData] of sections.entries()) {
          if (sectionData.id && !sectionData.isNew) {
            // Update existing section
            await connection.query(
              "UPDATE course_sections SET name = ?, order_index = ? WHERE id = ?",
              [sectionData.name, sectionIndex, sectionData.id]
            );
          } else {
            // Create new section
            const [sectionResult] = await connection.query(
              "INSERT INTO course_sections (course_id, name, order_index) VALUES (?, ?, ?)",
              [courseId, sectionData.name, sectionIndex]
            );
            sectionData.id = sectionResult.insertId;
          }
        }

        // 5. Process new file uploads
        const filesBySection = {};
        for (const file of files) {
          const match = file.fieldname.match(/^section_(\d+)_file_(\d+)$/);
          if (match) {
            const sectionIndex = parseInt(match[1], 10);
            const fileIndex = parseInt(match[2], 10);
            if (!filesBySection[sectionIndex]) {
              filesBySection[sectionIndex] = [];
            }
            filesBySection[sectionIndex][fileIndex] = file;
          }
        }

        // Upload new files for each section
        for (const [sectionIndex, sectionFiles] of Object.entries(
          filesBySection
        )) {
          const sectionId = sections[sectionIndex].id;

          const uploadPromises = sectionFiles
            .filter((f) => f)
            .map((file, fileIndex) => {
              return new Promise((resolve, reject) => {
                const uploadStream = gfsBucket.openUploadStream(
                  file.originalname,
                  {
                    contentType: file.mimetype,
                  }
                );

                uploadStream.end(file.buffer);

                uploadStream.on("finish", async () => {
                  try {
                    const fileId = uploadStream.id.toString();
                    const fileType = file.mimetype.startsWith("video")
                      ? "video"
                      : file.mimetype === "application/pdf"
                      ? "pdf"
                      : "other";

                    await connection.query(
                      "INSERT INTO course_files (course_id, section_id, file_id, type, order_index, original_name) VALUES (?, ?, ?, ?, ?, ?)",
                      [
                        courseId,
                        sectionId,
                        fileId,
                        fileType,
                        fileIndex,
                        file.originalname,
                      ]
                    );
                    resolve();
                  } catch (dbError) {
                    console.error(`DB Error inserting file record: ${dbError}`);
                    reject(dbError);
                  }
                });

                uploadStream.on("error", (uploadError) => {
                  console.error(
                    `Error uploading file to GridFS: ${uploadError}`
                  );
                  reject(uploadError);
                });
              });
            });

          await Promise.all(uploadPromises);
        }

        // Commit the transaction
        await connection.commit();
        console.log(`Course ${courseId} updated successfully.`);

        // 6. Notify enrolled students about the course update
        await notifyEnrolledStudents(
          courseId,
          `Course "${title}" has been updated.`,
          "course_update"
        );

        res.status(200).json({ message: "Course updated successfully." });
      } catch (error) {
        await connection.rollback();
        console.error("Error during course update transaction:", error);
        res
          .status(500)
          .json({ message: "Failed to update course.", error: error.message });
      } finally {
        connection.release();
        console.log("--- Update Course Request End ---");
      }
    } catch (error) {
      console.error("Error updating course:", error);
      res
        .status(500)
        .json({ message: "Failed to update course.", error: error.message });
    }
  }
);

module.exports = router;
