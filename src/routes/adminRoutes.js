// src/routes/adminRoutes.js
const express = require('express');
const { loginAdmin } = require('../Controllers/adminController');
const router = express.Router();

// Define the POST /login route for admin login
router.post('/login', loginAdmin);

module.exports = router;
