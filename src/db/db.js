const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  connectTimeout: 20000, // 20 seconds
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the pool connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection failed:", err.stack);
    process.exit(1);
  }
  console.log("Connected to MySQL database.");
  connection.release(); // Release it back to the pool
});

// Create a promise-based pool for async/await
const db = pool.promise();

// Export this promise-based pool
module.exports = db;
