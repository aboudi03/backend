const express = require('express');
const { registerStudent } = require('../Controllers/studentController');

const router = express.Router();

router.post('/students', registerStudent);

module.exports = router;