const mysql = require("mysql2");
const { mongoConnection, gfs } = require("./mongo"); // ✅ Import MongoDB Connection
require("dotenv").config();

// ✅ MySQL Connection Pool
const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ Convert MySQL Pool to Promises
const db = mysqlPool.promise(); // Ensures async queries

// ✅ Check MySQL Connection
mysqlPool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.stack);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL database.");
  connection.release();
});

// ✅ Debugging: Ensure `db` is valid
if (!db.query) {
  console.error("❌ MySQL `db` is not correctly initialized! Check your `db.js`.");
} else {
  console.log("✅ MySQL `db.query` is ready.");
}

// ✅ Export both databases correctly
module.exports = db;