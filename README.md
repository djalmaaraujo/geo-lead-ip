# GeoIP Lookup API

A Node.js API service for GeoIP lookups with rate limiting and API key authentication.

## Development History

This project was built with the assistance of Cursor Editor AI. To understand how the application was developed step by step, check out the [development-log.md](development-log.md) file. The log includes:

- Detailed progression of features
- Technical decisions and rationale
- Implementation steps
- Project structure evolution
- Key architectural choices

> **Development Time**: The entire application was built in less than one hour! This includes all features, CLI tools, and documentation. The development could have been even faster with a clear plan from the start, but part of this hour involved learning and iterating on ideas as they emerged. This showcases the power of AI-assisted development in rapidly prototyping and implementing complete applications.

> **Note**: I did not edit any part of the code, except the RATE_LIMIT constant to test it. Besides that, everything including this README.md and the development-log.md was generated by the Cursor Editor.

## Requirements

- Node.js v18.19.0 (use nvm to switch versions)
- SQLite3
- MaxMind's mmdbinspect tool (GeoIP database inspector)
- DB-IP City Lite MMDB database file

### Getting the GeoIP Database

This project uses the free DB-IP City Lite database, which is a subset of their commercial database with reduced coverage and accuracy.

You can either let the setup command download the database automatically:

```bash
./admin setup  # Downloads and extracts the latest DB-IP City Lite database
```

Or download it manually:

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

**Linux (Ubuntu):**

```bash
wget https://github.com/maxmind/mmdbinspect/releases/download/v0.2.0/mmdbinspect_0.2.0_linux_amd64.deb
dpkg -i mmdbinspect_0.2.0_linux_amd64.deb
```

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
# Initialize database and create tables
./admin setup
# This will:
# - Create the SQLite database
# - Set up required tables
# - Download and extract the latest GeoIP database
# - Create a sample API key for testing
# - Display the API key details

# Or reset existing database
./admin reset   # Delete existing database
./admin setup   # Create new database
```

> **Note**: The setup command handles everything automatically:
>
> - Creates a sample API key with default rate limits
> - Downloads and extracts the latest GeoIP database
> - Sets up the SQLite database
>   You can use the generated API key immediately to test the API, or create additional keys using the commands below.

## API Key Management

The project includes a CLI tool for managing API keys:

### Available Commands

```bash
./admin setup   # Initialize database and create sample API key
./admin reset   # Delete existing database
./admin new     # Create new API key
./admin update  # Update existing API key
./admin sample  # Test sample IP addresses
./admin look    # Test API with key and IP
```

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

Make requests including your API key in headers or query parameters:

```bash
# Using headers
curl -H "api-key: your-api-key" http://localhost:3000/look

# Using query parameter
curl "http://localhost:3000/look?api_key=your-api-key"

# Combined with IP lookup
curl "http://localhost:3000/look?api_key=your-api-key&ip=1.1.1.1"

# Show response headers
curl -i "http://localhost:3000/look?api_key=your-api-key"
```

### Example Response

```bash
curl -H "api-key: your-key" "http://localhost:3000/look?ip=168.196.41.80"
```

```json
[
  {
    "Database": "location_sample.mmdb",
    "Records": [
      {
        "Network": "168.196.41.80/26",
        "Record": {
          "city": {
            "names": {
              "en": "Paulista"
            }
          },
          "continent": {
            "code": "SA",
            "geoname_id": 6255150,
            "names": {
              "de": "Südamerika",
              "en": "South America",
              "es": "Sudamérica",
              "fa": "امریکای جنوبی",
              "fr": "Amérique Du Sud",
              "ja": "南アメリカ大陸",
              "ko": "남아메리카",
              "pt-BR": "América Do Sul",
              "ru": "Южная Америка",
              "zh-CN": "南美洲"
            }
          },
          "country": {
            "geoname_id": 3469034,
            "is_in_european_union": false,
            "iso_code": "BR",
            "names": {
              "de": "Brasilien",
              "en": "Brazil",
              "es": "Brasil",
              "fa": "برزیل",
              "fr": "Brésil",
              "ja": "ブラジル",
              "ko": "브라질",
              "pt-BR": "Brasil",
              "ru": "Бразилия",
              "zh-CN": "巴西"
            }
          },
          "location": {
            "latitude": -7.94083,
            "longitude": -34.8731
          },
          "subdivisions": [
            {
              "names": {
                "en": "Pernambuco"
              }
            }
          ]
        }
      }
    ],
    "Lookup": "168.196.41.80"
  }
]
```

### HTTP Status Codes

The API returns the following status codes:

- `200 OK`: Successful request with GeoIP data
- `400 Bad Request`: Invalid IP address provided in query parameter
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: No GeoIP data found for the provided IP
- `429 Too Many Requests`: Rate limit exceeded for the API key
- `500 Internal Server Error`: Server error or database issues

Example error responses:

```json
// 401 Unauthorized
{"error": "API key required"}

// 429 Too Many Requests
{"error": "Rate limit exceeded", "resetTime": "2024-03-15T12:00:00.000Z"}
```

## Rate Limiting

Each API key has its own rate limit. The API returns these headers:

- X-RateLimit-Limit: Total requests allowed
- X-RateLimit-Remaining: Remaining requests
- X-RateLimit-Reset: Reset time

### Test API

```bash
# Test with API key (uses requester's IP)
./admin look <api_key>

# Test with specific IP
./admin look <api_key> 1.1.1.1
```
