const express = require('express');
const { registerTutor } = require('../Controllers/tutorController');

const router = express.Router();

router.post('/', registerTutor);

module.exports = router;
