const express = require("express");
const router = express.Router();
const ShortUniqueId = require("short-unique-id");
const rateLimit = require("express-rate-limit");
const ShortUrl = require("../models/ShortUrl");
const authMiddleware = require("../middleware/auth");

const uid = new ShortUniqueId({ length: 6 }); // Generate unique short codes

// ✅ Rate Limiting: Allow 5 URL creations per hour per user
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Rate limit exceeded. Try again later." },
  keyGenerator: (req) => req.user.userId, // Limit per user
});

// ✅ Shorten URL API
router.post("/shorten", authMiddleware, createLimiter, async (req, res) => {
  try {
    const { longUrl, customAlias, topic } = req.body;
    const userId = req.user.userId;

    if (!longUrl) return res.status(400).json({ error: "longUrl is required" });

    // Validate URL format
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
    if (!urlPattern.test(longUrl)) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    let shortCode;

    // ✅ If custom alias is provided, check if it's unique
    if (customAlias) {
      const existingAlias = await ShortUrl.findOne({ shortCode: customAlias });
      if (existingAlias) {
        return res.status(400).json({ error: "Custom alias already taken" });
      }
      shortCode = customAlias;
    } else {
      // ✅ Generate a unique short code
      do {
        shortCode = uid.randomUUID();
      } while (await ShortUrl.findOne({ shortCode })); // Ensure uniqueness
    }

    let shortUrl = `${process.env.BASE_URL}/${shortCode}`

    // ✅ Save to MongoDB
    const newShortUrl = new ShortUrl({
      longUrl,
      shortUrl,
      shortCode,
      topic: topic || "general",
      createdBy: userId,
    });

    await newShortUrl.save();

    // ✅ Return response
    res.json({
      shortUrl: shortUrl,
      createdAt: newShortUrl.createdAt,
    });
  } catch (error) {
    console.error("Shorten URL Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
