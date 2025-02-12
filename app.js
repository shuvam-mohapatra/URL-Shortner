const express = require("express");
const connectDB = require("./config");
const authRoutes = require("./routes/auth");
const shortner = require("./routes/url")
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api",shortner);

// Start Server
connectDB();
const PORT = process.env.PORT || 6001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
