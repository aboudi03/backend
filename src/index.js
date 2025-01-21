const express = require('express');
const cors = require('cors'); // If using CORS for frontend-backend communication
const bodyParser = require('body-parser');
const studentRoutes = require('./routes/studentRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const authRoutes = require('./routes/authRoutes'); 

const app = express();
const PORT = process.env.PORT || 5003;

// Log Incoming Requests
app.use((req, res, next) => {
    console.log(`Received ${req.method} request for ${req.url}`);
    next();
});

// Enable CORS for frontend (adjust origin as needed)
app.use(cors({ origin: 'http://localhost:3000' })); // Replace with your frontend URL

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes); // Authentication routes
app.use('/api', studentRoutes);   // Student-related routes
// Middleware
app.use(cors()); // Adjust origin as needed
app.use(bodyParser.json());

// Register routes
app.use('/api', studentRoutes);
app.use('/api', tutorRoutes); 

// Default route
app.get('/', (req, res) => {
    res.send('StudyBuddy API is running.');
});

// Catch-all route for undefined endpoints
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
