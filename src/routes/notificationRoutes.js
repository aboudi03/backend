const express = require("express");
const { mongoConnection } = require("../db/mongo");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();

const collection = () => mongoConnection.db.collection("notifications");

// GET notifications for logged-in student
router.get("/", authenticate, async (req, res) => {
  const userId = req.user.id;
  const notifs = await collection()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(notifs);
});

// PATCH: mark all as read
router.patch("/mark-read", authenticate, async (req, res) => {
  const userId = req.user.id;
  await collection().updateMany({ userId, isRead: false }, { $set: { isRead: true } });
  res.json({ message: "Notifications marked as read" });
});

module.exports = router;
