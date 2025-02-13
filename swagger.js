const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const os = require("os");
require("dotenv").config();

const PORT = process.env.PORT || 6002;

// Function to get local IP address
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address; // Return the first non-internal IPv4 address
      }
    }
  }
  return "localhost"; // Fallback if no IP found
};

const localIp = getLocalIp();

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "URL Shortener API",
      version: "1.0.0",
      description: "API documentation for the URL Shortener Service",
    },
    servers: [
      {
        url: "http://${localIp}:6002",
        description: "Development Server",
      },
    ],
  },
  apis: ["./routes/*.js"], // Path to API route files
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

const swaggerUrl = `http://${localIp}:${PORT}/api-docs`;
console.log(`Swagger is running on ${swaggerUrl}`);

module.exports = setupSwagger;
