require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors'); // Import CORS middleware
const bodyParser = require('body-parser');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 5003;

// Enable CORS for frontend (adjust origin as needed)
app.use(cors({ origin: 'http://localhost:3000' })); // Replace with your frontend URL

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Routes
app.use('/api', studentRoutes);

// Default route for the root URL
app.get('/', (req, res) => {
    res.send('StudyBuddy API is running.');
});

// Catch-all route for undefined endpoints
app.use((req, res) => {
    res.status(404).send('Route not found');
});

// Error-handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
