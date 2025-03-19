require("dotenv").config();
const mongoose = require("mongoose");
const Grid = require("gridfs-stream");

const mongoURI = process.env.MONGO_URI;

// ✅ Create MongoDB Connection
const mongoConnection = mongoose.createConnection(mongoURI);

let gfs;
mongoConnection.once("open", () => {
  gfs = Grid(mongoConnection.db, mongoose.mongo);
  gfs.collection("uploads");
  console.log("✅ Connected to MongoDB Atlas (GridFS is ready).");
});

// ✅ Handle MongoDB Connection Errors
mongoConnection.on("error", (err) => {
  console.error("❌ MongoDB Connection Error:", err);
});

module.exports = { mongoConnection, gfs };
