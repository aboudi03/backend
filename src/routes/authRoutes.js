const express = require("express");
const { login, logout } = require("../Controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);



module.exports = router;
