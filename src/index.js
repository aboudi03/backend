const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5003;

// ✅ CORS must come first — before routes
app.use(cors({
  origin: "http://localhost:3000",  // frontend
  credentials: true                 // allow cookies
}));

// ✅ Middleware before routes
app.use(cookieParser());
app.use(bodyParser.json());

// ✅ Logging
app.use((req, res, next) => {
  console.log(`Received ${req.method} request for ${req.url}`);
  next();
});

// ✅ Import routes
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
const geminiRoutes = require("./routes/gemini");
const paymentRoutes = require("./routes/paymentsRoutes");
const earningsRoutes = require("./routes/earningsRoutes");


// ✅ Register routes (only ONCE each)
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
app.use("/api/gemini", geminiRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tutors", earningsRoutes);


// ✅ Root welcome route
app.get("/", (req, res) => {
  res.send("StudyBuddy API is running.");
});

// ✅ Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
