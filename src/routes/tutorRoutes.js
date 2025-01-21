const express = require('express');
const { registerTutor } = require('../Controllers/tutorController');
const router = express.Router();

router.post('/tutors', registerTutor);

module.exports = router;
