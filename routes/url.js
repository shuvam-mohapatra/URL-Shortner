const express = require("express");
const router = express.Router();
const ShortUniqueId = require("short-unique-id");
const rateLimit = require("express-rate-limit");
const ShortUrl = require("../models/ShortUrl");
const authMiddleware = require("../middleware/auth");
const UAParser = require("ua-parser-js");

const uid = new ShortUniqueId({ length: 6 }); // Generate unique short codes

// Rate Limiting: Allow 5 URL creations per hour per user
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Rate limit exceeded. Try again later." },
  keyGenerator: (req) => req.user.userId, // Limit per user
});

// Shorten URL API
router.post("/shorten", authMiddleware, createLimiter, async (req, res) => {
  try {
    const { longUrl, customAlias, topic } = req.body;
    const userId = req.user.userId;

    if (!longUrl) return res.status(400).json({ error: "longUrl is required" });

    // Validate URL format
    const urlPattern =
      /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
    if (!urlPattern.test(longUrl)) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    let shortCode;

    // If custom alias is provided, check if it's unique
    if (customAlias) {
      const existingAlias = await ShortUrl.findOne({ shortCode: customAlias });
      if (existingAlias) {
        return res.status(400).json({ error: "Custom alias already taken" });
      }
      shortCode = customAlias;
    } else {
      // Generate a unique short code
      do {
        shortCode = uid.randomUUID();
      } while (await ShortUrl.findOne({ shortCode })); // Ensure uniqueness
    }

    let shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    // Save to MongoDB
    const newShortUrl = new ShortUrl({
      longUrl,
      shortUrl,
      shortCode,
      topic: topic || "general",
      createdBy: userId,
    });

    await newShortUrl.save();

    // Return response
    res.json({
      shortUrl: shortUrl,
      createdAt: newShortUrl.createdAt,
    });
  } catch (error) {
    console.error("Shorten URL Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:alias", authMiddleware, async (req, res) => {
  try {
    const { alias } = req.params;
    const shortUrl = await ShortUrl.findOne({ shortCode: alias });

    if (!shortUrl) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    // Extract user agent details
    const userAgent = req.headers["user-agent"];
    const parser = new UAParser(userAgent);
    const osInfo = parser.getOS();
    const deviceInfo = parser.getDevice();

    // console.log("User-Agent:", userAgent);
    // console.log("OS Detected:", osInfo);
    // console.log("Device Detected:", deviceInfo);

    const osType = osInfo.name || "Unknown";
    let deviceType = deviceInfo.type || "Desktop"; // Default to Desktop

    if (!deviceType) {
      deviceType = "Desktop";
    }

    // Capture analytics data
    shortUrl.analytics.push({
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent,
      osType,
      deviceType,
    });

    await shortUrl.save();

    // Redirect to the original long URL
    res.redirect(shortUrl.longUrl);
  } catch (error) {
    console.error("Redirect Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/analytics/:alias", authMiddleware, async (req, res) => {
  try {
    const { alias } = req.params;
    const shortUrl = await ShortUrl.findOne({ shortCode: alias });

    if (!shortUrl) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    const analytics = shortUrl.analytics;

    //  Calculate total clicks and unique users
    const totalClicks = analytics.length;
    const uniqueUsers = new Set(analytics.map((entry) => entry.ipAddress)).size;

    // Filter last 7 days' clicks
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentClicks = analytics.filter(
      (entry) => entry.timestamp >= sevenDaysAgo
    );

    // Aggregate clicks by date
    const clicksByDate = {};
    recentClicks.forEach((entry) => {
      const date = entry.timestamp.toISOString().split("T")[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;
    });

    // Aggregate OS types
    const osTypeStats = {};
    analytics.forEach((entry) => {
      const os = entry.osType;
      osTypeStats[os] = osTypeStats[os] || {
        uniqueClicks: 0,
        uniqueUsers: new Set(),
      };
      osTypeStats[os].uniqueClicks++;
      osTypeStats[os].uniqueUsers.add(entry.ipAddress);
    });

    // Aggregate device types
    const deviceTypeStats = {};
    analytics.forEach((entry) => {
      const device = entry.deviceType;
      deviceTypeStats[device] = deviceTypeStats[device] || {
        uniqueClicks: 0,
        uniqueUsers: new Set(),
      };
      deviceTypeStats[device].uniqueClicks++;
      deviceTypeStats[device].uniqueUsers.add(entry.ipAddress);
    });

    // Convert OS and device data into array format
    const osType = Object.keys(osTypeStats).map((os) => ({
      osName: os,
      uniqueClicks: osTypeStats[os].uniqueClicks,
      uniqueUsers: osTypeStats[os].uniqueUsers.size,
    }));

    const deviceType = Object.keys(deviceTypeStats).map((device) => ({
      deviceName: device,
      uniqueClicks: deviceTypeStats[device].uniqueClicks,
      uniqueUsers: deviceTypeStats[device].uniqueUsers.size,
    }));

    res.json({
      totalClicks,
      uniqueUsers,
      clicksByDate: Object.entries(clicksByDate).map(([date, clicks]) => ({
        date,
        clicks,
      })),
      osType,
      deviceType,
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

//  Get Topic-Based Analytics API
router.get("/analytics/topic/:topic", authMiddleware, async (req, res) => {
  try {
    const { topic } = req.params;

    //  Find all URLs with the specified topic
    const urls = await ShortUrl.find({ topic });

    if (urls.length === 0) {
      return res.status(404).json({ error: "No URLs found for this topic" });
    }

    let totalClicks = 0;
    let uniqueUsersSet = new Set();
    let clicksByDate = {};
    let urlStats = [];

    urls.forEach((url) => {
      let uniqueUsersForUrl = new Set();

      url.analytics.forEach((entry) => {
        totalClicks++;

        //  Collect unique users
        uniqueUsersSet.add(entry.ipAddress);
        uniqueUsersForUrl.add(entry.ipAddress);

        //  Group clicks by date
        const date = entry.timestamp.toISOString().split("T")[0];
        clicksByDate[date] = (clicksByDate[date] || 0) + 1;
      });

      //  Store individual URL stats
      urlStats.push({
        shortUrl: url.shortUrl,
        totalClicks: url.analytics.length,
        uniqueUsers: uniqueUsersForUrl.size,
      });
    });

    //  Format response
    const response = {
      totalClicks,
      uniqueUsers: uniqueUsersSet.size,
      clicksByDate: Object.entries(clicksByDate).map(([date, clicks]) => ({
        date,
        clicks,
      })),
      urls: urlStats,
    };

    res.json(response);
  } catch (error) {
    console.error("Topic Analytics Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

//  Get Overall Analytics API
router.get("/overall/analytics", authMiddleware, async (req, res) => {
  try {
    // console.log("entry");

    const userId = req.user.userId;

    //  Find all URLs created by the authenticated user
    const urls = await ShortUrl.find({ createdBy: userId });
    // console.log(urls);

    if (urls.length === 0) {
      return res.status(404).json({ error: "No URLs found for this user" });
    }

    let totalClicks = 0;
    let uniqueUsersSet = new Set();
    let clicksByDate = {};
    let osStats = {};
    let deviceStats = {};

    urls.forEach((url) => {
      let uniqueUsersForUrl = new Set();

      url.analytics.forEach((entry) => {
        totalClicks++;

        //  Track unique users
        uniqueUsersSet.add(entry.ipAddress);
        uniqueUsersForUrl.add(entry.ipAddress);

        //  Track clicks by date
        const date = entry.timestamp.toISOString().split("T")[0];
        clicksByDate[date] = (clicksByDate[date] || 0) + 1;

        //  Track OS type
        const osName = entry.os || "Unknown";
        if (!osStats[osName]) {
          osStats[osName] = { uniqueClicks: 0, uniqueUsers: new Set() };
        }
        osStats[osName].uniqueClicks += 1;
        osStats[osName].uniqueUsers.add(entry.ipAddress);

        //  Track device type
        const deviceName = entry.device || "Unknown";
        if (!deviceStats[deviceName]) {
          deviceStats[deviceName] = { uniqueClicks: 0, uniqueUsers: new Set() };
        }
        deviceStats[deviceName].uniqueClicks += 1;
        deviceStats[deviceName].uniqueUsers.add(entry.ipAddress);
      });
    });

    //  Format response
    const response = {
      totalUrls: urls.length,
      totalClicks,
      uniqueUsers: uniqueUsersSet.size,
      clicksByDate: Object.entries(clicksByDate).map(([date, clicks]) => ({
        date,
        clicks,
      })),
      osType: Object.entries(osStats).map(([osName, stats]) => ({
        osName,
        uniqueClicks: stats.uniqueClicks,
        uniqueUsers: stats.uniqueUsers.size,
      })),
      deviceType: Object.entries(deviceStats).map(([deviceName, stats]) => ({
        deviceName,
        uniqueClicks: stats.uniqueClicks,
        uniqueUsers: stats.uniqueUsers.size,
      })),
    };

    res.json(response);
  } catch (error) {
    console.error("Overall Analytics Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
