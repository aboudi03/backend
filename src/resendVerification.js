require("dotenv").config({ path: __dirname + "/.env" });   // ✅ correct
const crypto = require("crypto");
const db = require("./db/db");
const { sendVerificationEmail } = require("./utils/email");

const emailToVerify = "aboudizz_s03@hotmail.com"; // 📝 Change this to the actual user's email

const run = async () => {
  try {
    const token = crypto.randomBytes(32).toString("hex");

    const [user] = await db.query("SELECT * FROM users WHERE email = ?", [emailToVerify]);

    if (user.length === 0) {
      console.log("❌ No user found with that email.");
      return;
    }

    await db.query("UPDATE users SET verification_token = ?, is_verified = 0 WHERE email = ?", [
      token,
      emailToVerify,
    ]);

    await sendVerificationEmail(emailToVerify, token);
    console.log(`✅ Verification email sent to ${emailToVerify}`);
  } catch (err) {
    console.error("❌ Error resending verification:", err.message);
  } finally {
    process.exit();
  }
};

run();
