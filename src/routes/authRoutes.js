const express = require("express");
const { login } = require("../Controllers/authController");

const router = express.Router();

// Define the login route
router.post("/login", login);

module.exports = router;
