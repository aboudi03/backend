const express = require('express');
const { signIn } = require('../Controllers/authController'); // Import the sign-in controller

const router = express.Router();

// Route for sign-in
router.post('/signin', signIn);

module.exports = router;
