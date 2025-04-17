const express = require("express");
const router = express.Router();
const { login, logout } = require("../controllers/authController");
const jwt = require("jsonwebtoken");

const JWT_SECRET_KEY = "mySuperSecretKey"; // same one used in authController

// 🟢 Login: handled in authController
router.post("/login", login);

// 🔴 Logout: clears cookie
router.post("/logout", logout);

// 🔍 Status: check if user is logged in by verifying the token cookie
router.get("/status", (req, res) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ loggedIn: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY);
    return res.status(200).json({ loggedIn: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ loggedIn: false });
  }
});

module.exports = router;
