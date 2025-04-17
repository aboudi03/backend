const express = require("express");
const router  = express.Router();
const admin   = require("../controllers/adminController");

/* ─────  STATS  ───── */
router.get("/stats",              admin.getStats);

/* ─────  USERS  ───── */
router.get   ("/users",           admin.getUsers);
router.put   ("/users/:id",       admin.updateUser);
router.delete("/users/:id",       admin.deleteUser);

/* ── Pending tutor apps ── */
router.get ("/tutor-applications",            admin.getPendingTutors);
router.post("/tutor-applications/:id/accept", admin.acceptTutor);
router.post("/tutor-applications/:id/decline",admin.declineTutor);

module.exports = router;
