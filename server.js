const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const app = express();

// Configuration
const RATE_LIMIT = 2; // requests per 12 hours
const RATE_LIMIT_WINDOW = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const STORAGE_FILE = path.join(__dirname, "rate-limits.json");

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize or load rate limit data
let rateLimitData = {};
try {
  if (fs.existsSync(STORAGE_FILE)) {
    rateLimitData = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8"));
  }
} catch (error) {
  console.error("Error loading rate limit data:", error);
}

// Save rate limit data to file
const saveRateLimitData = () => {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(rateLimitData), "utf8");
};

// Clean up expired entries every hour
setInterval(() => {
  const now = Date.now();
  let changed = false;

  Object.keys(rateLimitData).forEach((key) => {
    if (now - rateLimitData[key].timestamp > RATE_LIMIT_WINDOW) {
      delete rateLimitData[key];
      changed = true;
    }
  });

  if (changed) {
    saveRateLimitData();
  }
}, 60 * 60 * 1000); // Run every hour

// Rate limit middleware
const rateLimit = (req, res, next) => {
  const apiKey = req.headers["api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  const now = Date.now();

  // Clean up expired entry for this API key
  if (
    rateLimitData[apiKey] &&
    now - rateLimitData[apiKey].timestamp > RATE_LIMIT_WINDOW
  ) {
    delete rateLimitData[apiKey];
  }

  // Initialize or update rate limit data for this API key
  if (!rateLimitData[apiKey]) {
    rateLimitData[apiKey] = {
      count: 0,
      timestamp: now,
    };
  }

  // Check rate limit
  if (rateLimitData[apiKey].count >= RATE_LIMIT) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      resetTime: new Date(rateLimitData[apiKey].timestamp + RATE_LIMIT_WINDOW),
    });
  }

  // Increment counter
  rateLimitData[apiKey].count++;
  saveRateLimitData();

  // Add rate limit info to response headers
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT);
  res.setHeader(
    "X-RateLimit-Remaining",
    RATE_LIMIT - rateLimitData[apiKey].count
  );
  res.setHeader(
    "X-RateLimit-Reset",
    new Date(rateLimitData[apiKey].timestamp + RATE_LIMIT_WINDOW)
  );

  next();
};

// Helper function to get client IP
const getClientIP = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress
  );
};

// Route for IP lookup with rate limiting
app.get("/look", rateLimit, (req, res) => {
  const clientIP = getClientIP(req);
  console.log(`Client IP: ${clientIP}`);

  // Execute mmdbinspect command
  exec(
    `mmdbinspect -db location_sample.mmdb ${clientIP}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing mmdbinspect: ${error}`);
        return res.status(500).json({ error: "Error processing GeoIP lookup" });
      }

      try {
        // Parse the command output as JSON
        const geoData = JSON.parse(stdout);
        res.json(geoData);
      } catch (parseError) {
        console.error(`Error parsing mmdbinspect output: ${parseError}`);
        res.status(500).json({ error: "Error processing GeoIP data" });
      }
    }
  );
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
