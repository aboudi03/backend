const express = require("express");
const fetch = require("node-fetch");

const router = express.Router(); // Initialize the router

router.post("/", async (req, res) => {
  const userMessage = req.body.message;

  const context = `
    This website, StudyBuddy, is an online tutoring platform specializing in computer science.
    It connects students with expert tutors for fields like programming, data structures, algorithms,
    artificial intelligence, and web development. Students can learn through personalized sessions,
    guided roadmaps, and interactive resources to achieve their learning goals.
  `;

  const HUGGING_FACE_API_URL =
    "https://api-inference.huggingface.co/models/deepset/roberta-base-squad2";
  const HUGGING_FACE_API_TOKEN = process.env.HUGGING_FACE_API_TOKEN;

  try {
    const response = await fetch(HUGGING_FACE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUGGING_FACE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          question: userMessage,
          context: context,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      res.status(500).json({ response: "Error from Hugging Face API: " + data.error });
    } else {
      res.json({ response: data.answer || "Sorry, I couldn't find an answer." });
    }
  } catch (error) {
    console.error("Error calling Hugging Face API:", error);
    res.status(500).json({ response: "Something went wrong. Please try again later." });
  }
});

module.exports = router; // Export the router
