const mongoose = require("mongoose");

const ShortUrlSchema = new mongoose.Schema({
  longUrl: { type: String, required: true },
  shortUrl: { type: String, unique: true, required: true },
  shortCode: { type: String, unique: true, required: true },
  topic: { type: String, default: "general" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ShortUrl", ShortUrlSchema);
