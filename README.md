# GeoIP Lookup API

A Node.js API service for GeoIP lookups with rate limiting and API key authentication.

## Requirements

- Node.js v18.19.0 (use nvm to switch versions)
- SQLite3
- MaxMind's mmdbinspect tool (GeoIP database inspector)
- MaxMind GeoIP database file (location_sample.mmdb)

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
