const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔹 GET: Certificates for logged-in student
router.get("/", authenticate, async (req, res) => {
    const studentId = req.user.id;
  
    try {
      const [certs] = await db.query(
        `SELECT cert.id AS certificate_id, c.title AS course_title, cert.issued_at, u.first_name, u.last_name
         FROM certificates cert
         JOIN courses c ON cert.course_id = c.id
         JOIN users u ON cert.student_id = u.id
         WHERE cert.student_id = ?`,
        [studentId]
      );
  
      res.json(certs);
    } catch (err) {
      console.error("❌ Certificate fetch error:", err);
      res.status(500).json({ message: "Failed to fetch certificates." });
    }
  });
  

router.get("/:certificateId", authenticate, async (req, res) => {
    const { certificateId } = req.params;
    try {
      const certificate = await mongo.collection("certificates").findOne({
        _id: new ObjectId(certificateId),
      });
  
      if (!certificate) return res.status(404).json({ message: "Certificate not found" });
  
      res.json(certificate);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch certificate" });
    }
  });

module.exports = router;
