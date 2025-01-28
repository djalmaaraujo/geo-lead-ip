#!/usr/bin/env node

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");

// Configuration
const DB_PATH = path.join(__dirname, "rate-limits.db");
const DEFAULT_RATE_LIMIT = 2; // Should match server.js RATE_LIMIT

// Initialize database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
    process.exit(1);
  }
});

// Generate random API key
const generateApiKey = () => {
  return crypto.randomBytes(16).toString("hex");
};

// Command handlers
const commands = {
  // Create new API key
  new: async (args) => {
    if (args.length < 1) {
      console.error("Usage: ./admin new <name> [rate_limit]");
      process.exit(1);
    }

    const name = args[0];
    const rateLimit = parseInt(args[1]) || DEFAULT_RATE_LIMIT;
    const apiKey = generateApiKey();
    const now = Date.now();

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO rate_limits (api_key, name, count, timestamp, rate_limit) 
           VALUES (?, ?, 0, ?, ?)`,
          [apiKey, name, now, rateLimit],
          (err) => {
            if (err) {
              if (err.message.includes("UNIQUE constraint failed")) {
                reject(new Error(`Name '${name}' already exists`));
              } else {
                reject(err);
              }
            } else {
              resolve();
            }
          }
        );
      });

      console.log("\nAPI Key created successfully!");
      console.log("----------------------------");
      console.log(`Name: ${name}`);
      console.log(`API Key: ${apiKey}`);
      console.log(`Rate Limit: ${rateLimit} requests per 12 hours`);
      console.log("----------------------------\n");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  },

  // Update API key fields
  update: async (args) => {
    if (args.length < 2) {
      console.error("Usage: ./admin update <api_key> <field=value>");
      process.exit(1);
    }

    const apiKey = args[0];
    const fieldValue = args[1].split("=");

    if (fieldValue.length !== 2) {
      console.error("Invalid field=value format");
      process.exit(1);
    }

    const [field, value] = fieldValue;
    const allowedFields = ["rate_limit", "name"];

    if (!allowedFields.includes(field)) {
      console.error(
        `Invalid field. Allowed fields: ${allowedFields.join(", ")}`
      );
      process.exit(1);
    }

    try {
      // First check if API key exists
      const row = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM rate_limits WHERE api_key = ?",
          [apiKey],
          (err, row) => {
            if (err) reject(err);
            resolve(row);
          }
        );
      });

      if (!row) {
        throw new Error("API key not found");
      }

      // Validate and convert value based on field type
      let validatedValue = value;
      if (field === "rate_limit") {
        validatedValue = parseInt(value);
        if (isNaN(validatedValue) || validatedValue < 1) {
          throw new Error("Rate limit must be a positive number");
        }
      }

      // Update the field
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE rate_limits SET ${field} = ? WHERE api_key = ?`,
          [validatedValue, apiKey],
          (err) => {
            if (err) {
              if (err.message.includes("UNIQUE constraint failed")) {
                reject(new Error(`Name '${value}' already exists`));
              } else {
                reject(err);
              }
            }
            resolve();
          }
        );
      });

      console.log(`\nSuccessfully updated ${field} to ${value}`);
      console.log("----------------------------");
      console.log(`API Key: ${apiKey}`);
      console.log(`Updated ${field}: ${value}`);
      console.log("----------------------------\n");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  },
};

// Main
const main = async () => {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || !commands[command]) {
    console.error("Available commands: new, update");
    process.exit(1);
  }

  try {
    await commands[command](args);
  } finally {
    db.close();
  }
};

main();
