const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const dotenv = require("dotenv");

const router = express.Router();
dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// POST endpoint to generate AI responses
router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Website context to provide to Gemini
    const websiteContext = `StudyBuddy is an online tutoring and learning platform focused on computer science and related fields.\n\nMain features include:\n- Connecting students with expert tutors in programming, data structures, algorithms, AI, and web development.\n- Courses with rich content (PDFs, videos), managed by tutors.\n- Personalized roadmaps for students, guiding them step-by-step.\n- Interactive chat and Q&A, leveraging AI to answer questions.\n- User management for students and tutors, including profiles, notifications, reviews, and enrollments.\n- Tech stack: Node.js (Express), SQL, MongoDB (GridFS), AI integrations (Hugging Face, Gemini).\n- Focused on personalized, guided learning with expert support and interactive resources.`;

    // Helper function to format Gemini's Markdown response for chat UI
    function formatGeminiMarkdown(markdown) {
      let text = markdown;

      // 1. Remove Headings
      text = text.replace(/^\s*#+\s*(.*)/gm, "$1");

      // 2. Remove Bold and Italic markers
      text = text.replace(/\*\*(.*?)\*\*/g, "$1");
      text = text.replace(/\*(.*?)\*/g, "$1");

      // 3. Handle Bullet points
      // Standardize bullet markers to '*' first for easier processing
      text = text.replace(/^[ \t]*[-]\s+/gm, '* ');
      // Ensure bullet points start on a new line with '• ', preceded by exactly one newline.
      text = text.replace(/\n?[ \t]*\*\s+/g, '\n• ');
      // Remove any potential double newlines before a bullet point introduced above.
      text = text.replace(/\n{2,}• /g, '\n• ');

      // 4. Preserve double newlines (paragraph breaks), collapse more than two into two.
      text = text.replace(/\n{3,}/g, "\n\n");

      // 5. Replace single newlines (that are NOT followed by another newline or a bullet point) with a space.
      // This joins lines within the same paragraph.
      text = text.replace(/([^\n])\n(?![•\n])/g, "$1 ");

      // 6. Collapse multiple spaces within lines to a single space.
      text = text.replace(/ +/g, " ");

      // 7. Trim leading/trailing whitespace from the entire text and individual lines.
      text = text.split('\n').map(line => line.trim()).join('\n').trim();

      // Ensure consistent paragraph spacing (max one blank line)
      text = text.replace(/\n{3,}/g, "\n\n");

      return text;
    }

    // Use the full model name as per docs
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: [
        {
          role: "user",
          parts: [{ text: websiteContext }],
        },
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const plainText = formatGeminiMarkdown(response.text);
    res.json({ response: plainText });
  } catch (error) {
    console.error("Gemini API error:", error);
    // Optionally return error.message for debugging
    res
      .status(500)
      .json({ error: "Failed to generate response", details: error.message });
  }
});

module.exports = router;
