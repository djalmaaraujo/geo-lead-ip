# GeoIP Lookup API

A Node.js API service for GeoIP lookups with rate limiting and API key authentication.

## Development History

This project was built with the assistance of Cursor Editor AI. To understand how the application was developed step by step, check out the [development-log.md](development-log.md) file. The log includes:

- Detailed progression of features
- Technical decisions and rationale
- Implementation steps
- Project structure evolution
- Key architectural choices

## Requirements

- Node.js v18.19.0 (use nvm to switch versions)
- SQLite3
- MaxMind's mmdbinspect tool (GeoIP database inspector)
- DB-IP City Lite MMDB database file

### Getting the GeoIP Database

This project uses the free DB-IP City Lite database, which is a subset of their commercial database with reduced coverage and accuracy.

1. Visit [DB-IP City Lite Download Page](https://db-ip.com/db/download/ip-to-city-lite)
2. Select MMDB format
3. Accept the Creative Commons Attribution License
4. Download the database file
5. Rename it to `location_sample.mmdb` and place in project root

Note: The Lite database is updated monthly and includes basic geolocation data like city, country, and coordinates. For production use, consider their commercial database with better accuracy and daily updates.

### Installing mmdbinspect

mmdbinspect is required to read and parse MaxMind's GeoIP database files.

**macOS (using Homebrew):**

```bash
brew install mmdbinspect
```

**Linux (from source):**

```bash
go install github.com/maxmind/mmdbinspect@latest
```

Note: Requires Go 1.17 or later

**Windows:**

```bash
# Using scoop
scoop install mmdbinspect

# Or download the binary from GitHub releases:
# https://github.com/maxmind/mmdbinspect/releases
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create SQLite database:

```bash
sqlite3 rate-limits.db < schema.sql
```

3. Place your MaxMind database file as `location_sample.mmdb` in project root

## API Key Management

The project includes a CLI tool for managing API keys:

### Create API Key

```bash
# Default rate limit (2 requests/12h)
./admin new "My API"

# Custom rate limit
./admin new "High Volume API" 25000
```

### Update API Key

```bash
# Update rate limit
./admin update <api_key> rate_limit=5000

# Update name
./admin update <api_key> name="New Name"
```

## Using the API

Make requests including your API key in headers:

```bash
# Basic request
curl -H "api-key: your-api-key" http://localhost:3000/look

# Show response headers (including rate limits)
curl -i -H "api-key: your-api-key" http://localhost:3000/look
```

## Rate Limiting

Each API key has its own rate limit. The API returns these headers:

- X-RateLimit-Limit: Total requests allowed
- X-RateLimit-Remaining: Remaining requests
- X-RateLimit-Reset: Reset time
