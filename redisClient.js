const { createClient } = require("redis");
require("dotenv").config();

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  username: process.env.REDIS_USERNAME || "default",
  password: process.env.REDIS_PASSWORD,
});

client.on("error", (err) => console.error("Redis Client Error:", err));

(async () => {
  try {
    await client.connect();
    console.log("Connected to Redis Cloud");
  } catch (error) {
    console.error("Redis Connection Failed:", error);
  }
})();

module.exports = client;
