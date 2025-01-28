const express = require("express");
const { exec } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const app = express();

// Configuration
const RATE_LIMIT = 2; // requests per 12 hours
const RATE_LIMIT_WINDOW = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const DB_PATH = path.join(__dirname, "rate-limits.db");

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening database:", err);
    process.exit(1);
  }

  // Create rate limits table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      api_key TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      rate_limit INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
});

// Clean up expired entries every hour
setInterval(() => {
  const now = Date.now();
  db.run(
    "DELETE FROM rate_limits WHERE ? - timestamp > ?",
    [now, RATE_LIMIT_WINDOW],
    (err) => {
      if (err) {
        console.error("Error cleaning up rate limits:", err);
      }
    }
  );
}, 60 * 60 * 1000);

// Rate limit middleware
const rateLimit = (req, res, next) => {
  const apiKey = req.headers["api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  const now = Date.now();

  // Use transaction to ensure atomic operations
  db.serialize(() => {
    // Clean up expired entry for this API key
    db.run("DELETE FROM rate_limits WHERE api_key = ? AND ? - timestamp > ?", [
      apiKey,
      now,
      RATE_LIMIT_WINDOW,
    ]);

    // Get current rate limit data
    db.get(
      "SELECT count, timestamp, rate_limit, name FROM rate_limits WHERE api_key = ?",
      [apiKey],
      (err, row) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ error: "Internal server error" });
        }

        if (!row) {
          return res.status(401).json({ error: "Invalid API key" });
        }

        // Check rate limit
        if (row.count >= row.rate_limit) {
          return res.status(429).json({
            error: "Rate limit exceeded",
            resetTime: new Date(row.timestamp + RATE_LIMIT_WINDOW),
          });
        }

        // Increment counter
        db.run("UPDATE rate_limits SET count = count + 1 WHERE api_key = ?", [
          apiKey,
        ]);

        // Set rate limit headers
        res.setHeader("X-RateLimit-Limit", row.rate_limit);
        res.setHeader(
          "X-RateLimit-Remaining",
          row.rate_limit - (row.count + 1)
        );
        res.setHeader(
          "X-RateLimit-Reset",
          new Date(row.timestamp + RATE_LIMIT_WINDOW)
        );

        next();
      }
    );
  });
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

// Graceful shutdown
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err);
    }
    process.exit(err ? 1 : 0);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
