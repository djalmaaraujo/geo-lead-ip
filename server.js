const express = require("express");
const { exec } = require("child_process");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const net = require("net"); // For IP validation
const fs = require("fs");
const config = require("./config");
const app = express();

// Configuration
const DB_PATH = path.join(__dirname, "rate-limits.db");

// Check database content on startup
const dbPath = path.join(__dirname, "location_sample.mmdb");
console.log("Checking database file:", dbPath);

if (!fs.existsSync(dbPath)) {
  console.error("\nError: Database file not found!");
  console.error(
    "Please download the DB-IP City Lite database and save it as 'location_sample.mmdb'\n"
  );
  process.exit(1);
}

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
    [now, config.RATE_LIMIT_WINDOW],
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
      config.RATE_LIMIT_WINDOW,
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
            resetTime: new Date(row.timestamp + config.RATE_LIMIT_WINDOW),
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
          new Date(row.timestamp + config.RATE_LIMIT_WINDOW)
        );

        next();
      }
    );
  });
};

// Helper function to validate IP address
const isValidIP = (ip) => {
  return net.isIP(ip) !== 0; // Returns true for both IPv4 and IPv6
};

// Helper function to get client IP
const getClientIP = (req) => {
  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  // Convert IPv6 localhost to IPv4 localhost
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    ip = "127.0.0.1";
  }

  // Remove IPv6 prefix if present
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  return ip;
};

// Route for IP lookup with rate limiting
app.get("/look", rateLimit, (req, res) => {
  // Check if IP parameter is provided and valid
  const ipToLookup = req.query.ip
    ? decodeURIComponent(req.query.ip.trim())
    : null;
  let clientIP;

  if (ipToLookup) {
    if (!isValidIP(ipToLookup)) {
      return res.status(400).json({ error: "Invalid IP address provided" });
    }
    clientIP = ipToLookup;
  } else {
    clientIP = getClientIP(req);
  }

  // Execute mmdbinspect command
  exec(
    `mmdbinspect -db "${path.join(
      __dirname,
      "location_sample.mmdb"
    )}" "${clientIP}"`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing mmdbinspect: ${error}`);
        console.error(`stderr: ${stderr}`);
        return res.status(500).json({ error: "Error processing GeoIP lookup" });
      }

      try {
        // Parse the command output as JSON
        const geoData = JSON.parse(stdout);
        if (!geoData[0].Records) {
          return res.status(404).json({ error: "No data found for this IP" });
        }
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
