const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../db/db"); // assuming course info is in MySQL
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/create-checkout-session", authenticate, async (req, res) => {
  const { courseId } = req.body;
  const userId = req.user.id;

  try {
    const [[course]] = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: course.title,
              description: course.description,
            },
            unit_amount: Math.round(parseFloat(course.price) * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      success_url: `http://localhost:3000/success?courseId=${courseId}`,
      cancel_url: `http://localhost:3000/cancel`,
      metadata: {
        courseId: course.id,
        studentId: userId,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/confirm", authenticate, async (req, res) => {
    const { courseId } = req.body;
    const studentId = req.user.id;
  
    try {
      const [[course]] = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
      if (!course) return res.status(404).json({ message: "Course not found" });
  
      const tutorId = course.tutor_id;
  
      // Insert payment record (you can also check for duplicates if needed)
      await db.query(
        "INSERT INTO payments (tutor_id, student_id, course_id, amount) VALUES (?, ?, ?, ?)",
        [tutorId, studentId, courseId, course.price]
      );
  
      res.status(200).json({ message: "Payment recorded successfully." });
    } catch (err) {
      console.error("❌ Payment record error:", err);
      res.status(500).json({ message: "Failed to record payment." });
    }
  });
  

module.exports = router;
