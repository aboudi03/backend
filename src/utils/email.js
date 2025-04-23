require("dotenv").config({ path: __dirname + "/.env" });   // ✅ correct
const nodemailer = require("nodemailer");
console.log("✅ Using email credentials:", {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD ? "✔️ loaded" : "❌ missing",
  })
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

const sendVerificationEmail = async (email, token) => {
  const verifyUrl = `http://localhost:5003/api/auth/verify?token=${token}`;

  const mailOptions = {
    from: `"StudyBuddy" <${process.env.EMAIL_USERNAME}>`,
    to: email,
    subject: "Verify Your Email",
    html: `<p>Click the button below to verify your email:</p>
<a href="${verifyUrl}" style="background-color:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
  Verify Email
</a>`,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };
