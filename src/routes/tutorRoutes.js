
const express = require('express');
const { registerTutor } = require('../Controllers/tutorController');
const db = require("../db/db");

const router = express.Router();

// 🔹 POST: Register a new tutor
router.post('/', registerTutor);
console.log("📁 tutorRoutes.js loaded");
// 🔹 GET: Get all tutors and their profile info
router.get("/", async (req, res) => {
    console.log("🔥 /api/tutors route hit");
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id as userId, u.first_name, u.last_name, u.email,
        t.education, t.experience, t.subjects, t.other_subjects, t.certifications
      FROM tutors t
      JOIN users u ON t.user_id = u.id
    `);
    console.log("📦 Raw rows from MySQL:", rows);
    const tutors = rows.map((row) => {
      const tutor = { ...row };
      
      // Safely parse JSON fields
      try {
          if (tutor.subjects && typeof tutor.subjects === 'string') {
              tutor.subjects = JSON.parse(tutor.subjects);
          }
          if (tutor.other_subjects && typeof tutor.other_subjects === 'string') {
              tutor.other_subjects = JSON.parse(tutor.other_subjects);
          }
          if (tutor.certifications && typeof tutor.certifications === 'string') {
              tutor.certifications = JSON.parse(tutor.certifications);
          }
      } catch (parseError) {
          console.error("❌ Error parsing JSON fields:", parseError);
          // Keep the original string if parsing fails
      }
      
      return tutor;
  });

    
    
    
    
    console.log("📥 Returning tutors:", tutors);

    res.json(tutors);
  } catch (error) {
    console.error("❌ Error fetching tutors:", error);
    res.status(500).json({ message: "Failed to fetch tutors" });
  }
});

module.exports = router;
