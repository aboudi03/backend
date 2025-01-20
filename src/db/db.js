const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    connectTimeout: 20000, // Increase timeout to 20 seconds
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        process.exit(1); // Exit the process if the database connection fails
    }
    console.log('Connected to MySQL database.');
});

module.exports = db;