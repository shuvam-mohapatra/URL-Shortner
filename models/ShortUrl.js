const mongoose = require("mongoose");

const AnalyticsSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
  osType: String,
  deviceType: String,
});

const ShortUrlSchema = new mongoose.Schema({
  longUrl: { type: String, required: true },
  shortUrl: { type: String, unique: true, required: true },
  shortCode: { type: String, unique: true, required: true },
  topic: { type: String, default: "general" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  analytics: [AnalyticsSchema],
});

module.exports = mongoose.model("ShortUrl", ShortUrlSchema);
