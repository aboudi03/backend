const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/db');

exports.signIn = async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Fetch the user from the database
    const query = 'SELECT * FROM users WHERE email = ?';
    const [result] = await db.promise().query(query, [email]);

    if (result.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result[0];

    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret_key', // Use a secure key in your .env
      { expiresIn: '1h' } // Token expiry time
    );

    // Respond with the token and user details
    return res.status(200).json({
      message: 'Sign-in successful!',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
      },
    });
  } catch (error) {
    console.error('Error during sign-in:', error.message);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
};
