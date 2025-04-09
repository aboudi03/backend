// src/routes/adminPanelRoutes.js
const express = require('express');
const protectAdmin = require('../middleware/adminMiddleware');
const router = express.Router();

router.get('/panel', protectAdmin, (req, res) => {
  res.json({ message: 'Welcome to the admin panel' });
});

module.exports = router;
