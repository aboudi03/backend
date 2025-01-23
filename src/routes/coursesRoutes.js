const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Route to get all courses
router.get('/', (req, res) => {
  const coursesFilePath = path.join(__dirname, '../courses.json');

  fs.readFile(coursesFilePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading courses file:', err);
      return res.status(500).json({ message: 'Failed to load courses.' });
    }

    try {
      const courses = JSON.parse(data); // Parse JSON file content
      res.status(200).json(courses); // Send JSON response
    } catch (parseError) {
      console.error('Error parsing JSON file:', parseError);
      res.status(500).json({ message: 'Invalid JSON format in courses file.' });
    }
  });
});

module.exports = router;
