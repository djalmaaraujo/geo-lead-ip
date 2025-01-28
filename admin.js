#!/usr/bin/env node

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const config = require("./config");

// Configuration
const DB_PATH = path.join(__dirname, "rate-limits.db");
const MMDB_PATH = path.join(__dirname, "location_sample.mmdb");

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
  // Get sample IPs from database
  sample: async () => {
    // Sample IPs to test
    const testIPs = [
      "1.1.1.1",
      "8.8.8.8",
      "208.67.222.222",
      "142.250.180.238", // google.com
      "104.16.132.229", // cloudflare.com
      "205.251.242.103", // amazon.com
      "2001:4860:4860::8888", // Google DNS IPv6
    ];

    console.log("\nTesting sample IPs from database...\n");

    for (const ip of testIPs) {
      try {
        const result = await new Promise((resolve, reject) => {
          exec(
            `mmdbinspect -db ${MMDB_PATH} "${ip}"`,
            (error, stdout, stderr) => {
              if (error) {
                reject(error);
                return;
              }
              try {
                const data = JSON.parse(stdout);
                resolve({ ip, data });
              } catch (parseError) {
                reject(parseError);
              }
            }
          );
        });

        if (
          result.data &&
          result.data.length > 0 &&
          result.data[0].Records &&
          result.data[0].Records.length > 0
        ) {
          console.log(`✅ ${result.ip}:`);
          console.log(
            "   City:",
            result.data[0].Records[0].Record.city?.names?.en || "N/A"
          );
          console.log(
            "   Country:",
            result.data[0].Records[0].Record.country?.names?.en || "N/A"
          );
          console.log("");
        } else {
          console.log(`❌ ${result.ip}: No data found\n`);
        }
      } catch (error) {
        console.log(`❌ ${ip}: Error - ${error.message}\n`);
      }
    }

    console.log("\nTo query these IPs, use:");
    console.log(
      'curl -H "api-key: YOUR_KEY" "http://localhost:3000/look?ip=IP_ADDRESS"\n'
    );
    console.log(
      "Replace YOUR_KEY with your API key and IP_ADDRESS with one of the working IPs above.\n"
    );
  },

  // Create new API key
  new: async (args) => {
    if (args.length < 1) {
      console.error("Usage: ./admin new <name> [rate_limit]");
      process.exit(1);
    }

    const name = args[0];
    const rateLimit = parseInt(args[1]) || config.RATE_LIMIT;
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
    console.error("Available commands: new, update, sample");
    process.exit(1);
  }

  try {
    await commands[command](args);
  } finally {
    db.close();
  }
};

main();
