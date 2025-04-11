const express = require("express");
 const cors = require("cors"); 
 const bodyParser = require("body-parser");
 const cookieParser = require("cookie-parser");
 
 
 require("dotenv").config();
 
 // Import your routes
 const studentRoutes = require("./routes/studentRoutes");
 const tutorRoutes = require("./routes/tutorRoutes");
 const authRoutes = require("./routes/authRoutes");
 const courseRoutes = require("./routes/coursesRoutes"); 
 const chatRoutes = require("./routes/chatRoutes");
 const reviewsRoutes = require("./routes/reviewRoutes");
 const enrollmentRoutes = require("./routes/enrollmentRoutes");
 const profileRoutes = require("./routes/profileRoutes");
 const notificationRoutes = require("./routes/notificationRoutes");
 const adminRoutes = require("./routes/adminRoutes");
 const roadmapRoutes = require("./routes/roadmapRoutes");
 
 
 
 
 const app = express();  
 const PORT = process.env.PORT || 5003;
 
 // Parse cookies
 app.use(cookieParser());
 
 // Log incoming requests
 app.use((req, res, next) => {
   console.log(`Received ${req.method} request for ${req.url}`);
   next();
 });
 
 // Enable CORS for your frontend domain
 app.use(cors({
   origin: "http://localhost:3000", // your frontend URL
   credentials: true, // Required for sending cookies
 }));
 
 // Parse JSON requests
 app.use(bodyParser.json());
 
 // Use your routes
 app.use("/api/auth", authRoutes);
 app.use("/api/students", studentRoutes);
 app.use("/api/tutors", tutorRoutes);
 app.use("/api/courses", courseRoutes);
 app.use("/api/chat", chatRoutes);
 app.use("/api/reviews", reviewsRoutes);
 app.use("/api/enrollments", enrollmentRoutes);
 app.use("/api/profile", profileRoutes);
 app.use("/api/notifications", notificationRoutes);
 app.use("/api/admin", adminRoutes);
 app.use("/api/roadmap", roadmapRoutes);
 
 
 
 // Default route
 app.get("/", (req, res) => {
   res.send("StudyBuddy API is running.");
 });
 
 // Catch-all route for undefined endpoints
 app.use((req, res) => {
   res.status(404).json({ message: "Route not found" });
 });
 
 // Start server
 app.listen(PORT, () => {
   console.log(`Server running on http://localhost:${PORT}`);
 });