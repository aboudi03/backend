const express = require("express");
const { mongoConnection } = require("../db/mongo");
const { authenticate } = require("../middleware/authMiddleware");
const db = require("../db/db");
const router = express.Router();

const collection = () => mongoConnection.db.collection("notifications");

// GET notifications for logged-in student
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's creation date
    const [userResult] = await db.query(
      "SELECT created_at FROM users WHERE id = ?",
      [userId]
    );

    if (userResult.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userCreatedAt = userResult[0].created_at || new Date(0); // Default to epoch if not available

    // Only fetch notifications created after the user registered
    const notifs = await collection()
      .find({
        userId,
        createdAt: { $gte: new Date(userCreatedAt) },
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(notifs);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// PATCH: mark all as read
router.patch("/mark-read", authenticate, async (req, res) => {
  const userId = req.user.id;
  await collection().updateMany(
    { userId, isRead: false },
    { $set: { isRead: true } }
  );
  res.json({ message: "Notifications marked as read" });
});

module.exports = router;
