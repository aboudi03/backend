const db = require('../db/db'); // Your database connection

const loginAdmin = async (req, res) => {
  console.log("== Debugging: Received admin login request ==");
  
  // Log the full request body to verify the values being sent
  console.log("Request Body:", req.body);

  // Destructure email and password from the request body
  const { email, password } = req.body;

  // Debug: Check if the expected fields are present
  if (!email || !password) {
    console.error("Missing email or password in the request.");
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    console.log("Querying admins table for email:", email);
    
    // Execute the query to fetch the admin record using email
    const adminSql = "SELECT * FROM admins WHERE email = ?";
    const [adminResult] = await db.query(adminSql, [email]);
    
    // Debug: Log the result returned from the query
    console.log("SQL query returned:", adminResult);

    // If no record is found, log and return an error response
    if (!adminResult || adminResult.length === 0) {
      console.error("No admin found with email:", email);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Retrieve the first matching admin record
    const admin = adminResult[0];
    console.log("Found admin record:", admin);

    // Compare the provided password with the stored password (plain text)
    if (admin.password !== password) {
      console.error(`Password mismatch for email ${email}. Provided: "${password}", Stored: "${admin.password}"`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Debug: Confirm successful login
    console.log("Admin login successful for email:", email);
    
    return res.json({ message: "Admin login successful" });
  } catch (error) {
    console.error("Error during admin login:", error);
    return res.status(500).json({ message: "An error occurred during login." });
  }
};

module.exports = {
  loginAdmin
};
