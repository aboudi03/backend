const { mongoConnection } = require("../db/mongo");
const db = require("../db/db");

// Notify all students (e.g., when new course is added)
const notifyAllStudents = async (message, type = "general") => {
  try {
    const [students] = await db.query(
      "SELECT id FROM users WHERE user_type = 'student'"
    );

    console.log("🔔 notifyAllStudents triggered");
    console.log("📊 Students found:", students);

    if (!students || students.length === 0) {
      console.log("No students found to notify");
      return;
    }

    const notifications = students.map((student) => ({
      userId: student.id,
      message,
      type,
      isRead: false,
      createdAt: new Date(),
    }));

    console.log("📦 Notifications to insert:", notifications);

    const result = await mongoConnection.db
      .collection("notifications")
      .insertMany(notifications);
    console.log(`🔔 Notified ${result.insertedCount} students: ${message}`);
    return result;
  } catch (error) {
    console.error("Error in notifyAllStudents:", error);
    throw error;
  }
};

// Notify enrolled students (e.g., new announcement or session)
const notifyEnrolledStudents = async (
  courseId,
  message,
  type = "announcement"
) => {
  try {
    console.log("🔔 notifyEnrolledStudents triggered for course ID:", courseId);

    const [students] = await db.query(
      "SELECT student_id FROM enrollments WHERE course_id = ?",
      [courseId]
    );

    console.log("🎓 Enrolled students found:", students); // ✅ ADD THIS

    if (!students || students.length === 0) {
      console.log(`No enrolled students found for course ID ${courseId}`);
      return;
    }

    const notifications = students.map((s) => ({
      userId: s.student_id,
      message,
      type,
      isRead: false,
      createdAt: new Date(),
    }));

    console.log("📦 Notifications to insert:", notifications);

    const result = await mongoConnection.db
      .collection("notifications")
      .insertMany(notifications);
    console.log(
      `🔔 Notified ${result.insertedCount} enrolled students for course ${courseId}: ${message}`
    );
    return result;
  } catch (error) {
    console.error("Error in notifyEnrolledStudents:", error);
    throw error;
  }
};

// Notify tutor when a student enrolls in their course
const notifyTutor = async (
  courseId,
  studentId,
  message,
  type = "enrollment"
) => {
  try {
    console.log("🔔 notifyTutor triggered for course ID:", courseId);

    // Get tutor user_id for the course
    const [courseData] = await db.query(
      `SELECT t.user_id, c.title, u.first_name, u.last_name 
       FROM courses c
       JOIN tutors t ON c.tutor_id = t.id
       JOIN users u ON u.id = ?
       WHERE c.id = ?`,
      [studentId, courseId]
    );

    if (!courseData || courseData.length === 0) {
      console.log(`No course or tutor found for course ID ${courseId}`);
      return;
    }

    const tutorUserId = courseData[0].user_id;
    const studentName = `${courseData[0].first_name} ${courseData[0].last_name}`;
    const courseTitle = courseData[0].title;

    // Create formatted message if none provided
    const notificationMessage =
      message || `${studentName} has enrolled in your course "${courseTitle}"`;

    const notification = {
      userId: tutorUserId,
      message: notificationMessage,
      type,
      isRead: false,
      createdAt: new Date(),
    };

    console.log("📦 Notification to insert:", notification);

    const result = await mongoConnection.db
      .collection("notifications")
      .insertOne(notification);
    console.log(
      `🔔 Notified tutor (${tutorUserId}) about enrollment in course ${courseId}`
    );
    return result;
  } catch (error) {
    console.error("Error in notifyTutor:", error);
    throw error;
  }
};

module.exports = { notifyAllStudents, notifyEnrolledStudents, notifyTutor };
