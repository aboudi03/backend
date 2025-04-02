const express = require("express");
 const router = express.Router();
 const multer = require("multer");
 const db = require("../db/db");
 const { authenticate } = require("../middleware/authMiddleware");
 const { mongoConnection } = require("../db/mongo");
 const { GridFSBucket, ObjectId } = require("mongodb");
 
 const storage = multer.memoryStorage();
 const upload = multer({ storage });
 
 let profileBucket;
 let certificateBucket;
 
 mongoConnection.once("open", () => {
   profileBucket = new GridFSBucket(mongoConnection.db, { bucketName: "profilePictures" });
   certificateBucket = new GridFSBucket(mongoConnection.db, { bucketName: "certificates" });
   console.log("✅ Profile Pictures and Certificates buckets initialized.");
 });
 
 // GET /api/profile
 router.get("/", authenticate, async (req, res) => {
   try {
     const userId = req.user.id;
 
     const [rows] = await db.query(
       "SELECT first_name, last_name, email FROM users WHERE id = ?",
       [userId]
     );
 
     if (rows.length === 0) {
       return res.status(404).json({ message: "User not found" });
     }
 
     let profileData = {
       ...rows[0],
       userType: req.user.userType,
     };
 
     if (req.user.userType === "tutor") {
       const tutorProfile = await mongoConnection.db
         .collection("tutorProfiles")
         .findOne({ userId });
 
       profileData.bio = tutorProfile?.bio || "";
       profileData.experience = tutorProfile?.experience || null;
       profileData.subjects = tutorProfile?.subjects || [];
 
       const [tutorRows] = await db.query(
         "SELECT subjects FROM tutors WHERE user_id = ?",
         [userId]
       );
 
       if (tutorRows.length > 0) {
         const rawSubjects = tutorRows[0].subjects;
         profileData.subjects = Array.isArray(rawSubjects)
           ? rawSubjects
           : JSON.parse(rawSubjects);
       }
     }
 
     if (req.user.userType === "student") {
       const [studentRows] = await db.query(
         "SELECT education_level, school, goals, subjects FROM students WHERE user_id = ?",
         [userId]
       );
 
       if (studentRows.length > 0) {
         const student = studentRows[0];
         profileData.educationLevel = student.education_level;
         profileData.school = student.school;
         profileData.goals = student.goals;
         profileData.subjects = Array.isArray(student.subjects)
           ? student.subjects
           : JSON.parse(student.subjects || "[]");
       }
     }
 
     const profilePicRecord = await mongoConnection.db
       .collection("profilePictures")
       .findOne({ userId: Number(userId) });
 
     profileData.profilePictureUrl = profilePicRecord
       ? `/api/profile/picture/${profilePicRecord.fileId}`
       : null;
 
     const certificateRecord = await mongoConnection.db
       .collection("certificates")
       .findOne({ userId: Number(userId) });
 
     profileData.certificateUrls = certificateRecord?.fileIds?.length
       ? certificateRecord.fileIds.map(fileId => `/api/profile/certificate/${fileId}`)
       : [];
 
     res.json(profileData);
   } catch (error) {
     console.error("❌ Error fetching profile:", error);
     res.status(500).json({ message: "Server error" });
   }
 });
 
 // PUT /api/profile (for tutor update)
 router.put("/", authenticate, async (req, res) => {
   try {
     const userId = req.user.id;
 
     if (req.user.userType === "tutor") {
       const { bio, experience } = req.body;
 
       const tutorProfilesCollection = mongoConnection.db.collection("tutorProfiles");
       await tutorProfilesCollection.updateOne(
         { userId },
         { $set: { bio, experience } },
         { upsert: true }
       );
 
       return res.json({ message: "Tutor profile updated successfully" });
     }
 
     if (req.user.userType === "student") {
       const { goals } = req.body;
 
       await db.query("UPDATE students SET goals = ? WHERE user_id = ?", [
         goals,
         userId,
       ]);
 
       return res.json({ message: "Goals updated successfully" });
     }
 
     return res.status(400).json({ message: "Invalid user type" });
   } catch (error) {
     console.error("❌ Error updating profile:", error);
     res.status(500).json({ message: "Server error" });
   }
 });
 
 // POST /api/profile/upload (profile picture)
 router.post("/upload", authenticate, upload.single("profilePicture"), async (req, res) => {
   try {
     const userId = req.user.id;
     if (!req.file) return res.status(400).json({ message: "No file uploaded" });
 
     const uploadStream = profileBucket.openUploadStream(req.file.originalname, {
       contentType: req.file.mimetype,
     });
 
     uploadStream.end(req.file.buffer);
 
     uploadStream.on("finish", async () => {
       const fileId = uploadStream.id.toString();
 
       await mongoConnection.db.collection("profilePictures").updateOne(
         { userId: Number(userId) },
         { $set: { fileId } },
         { upsert: true }
       );
 
       res.status(201).json({ message: "Profile picture uploaded successfully", fileId });
     });
 
     uploadStream.on("error", (err) => {
       console.error("❌ Error uploading profile picture:", err);
       res.status(500).json({ message: "Error uploading file" });
     });
   } catch (error) {
     console.error("❌ Error in profile picture upload:", error);
     res.status(500).json({ message: "Server error" });
   }
 });
 
 // POST /api/profile/upload-certificate
 router.post("/upload-certificate", authenticate, upload.array("certificate"), async (req, res) => {
   try {
     const userId = req.user.id;
     if (!req.files || req.files.length === 0) {
       return res.status(400).json({ message: "No certificate files uploaded" });
     }
 
     const uploadedFileIds = [];
 
     for (const file of req.files) {
       const uploadStream = certificateBucket.openUploadStream(file.originalname, {
         contentType: file.mimetype,
       });
 
       uploadStream.end(file.buffer);
 
       await new Promise((resolve, reject) => {
         uploadStream.on("finish", async () => {
           const fileId = uploadStream.id.toString();
           uploadedFileIds.push(fileId);
 
           await mongoConnection.db.collection("certificates").updateOne(
             { userId: Number(userId) },
             { $addToSet: { fileIds: fileId } },
             { upsert: true }
           );
           resolve();
         });
 
         uploadStream.on("error", reject);
       });
     }
 
     res.status(201).json({
       message: "Certificates uploaded successfully",
       fileIds: uploadedFileIds,
     });
   } catch (error) {
     console.error("❌ Error uploading certificates:", error);
     res.status(500).json({ message: "Server error" });
   }
 });
 
 // GET /api/profile/picture/:fileId
 router.get("/picture/:fileId", async (req, res) => {
   try {
     const fileId = new ObjectId(req.params.fileId);
     const downloadStream = profileBucket.openDownloadStream(fileId);
 
     res.set("Content-Type", "image/jpeg");
     downloadStream.pipe(res);
 
     downloadStream.on("error", () => {
       res.status(404).json({ message: "Profile picture not found" });
     });
   } catch (error) {
     res.status(500).json({ message: "Server error" });
   }
 });
 
 // GET /api/profile/certificate/:fileId
 router.get("/certificate/:fileId", async (req, res) => {
   try {
     const fileId = new ObjectId(req.params.fileId);
     const downloadStream = certificateBucket.openDownloadStream(fileId);
 
     res.set("Content-Type", "application/pdf");
     downloadStream.pipe(res);
 
     downloadStream.on("error", () => {
       res.status(404).json({ message: "Certificate not found" });
     });
   } catch (error) {
     res.status(500).json({ message: "Server error" });
   }
 });
 
 module.exports = router;