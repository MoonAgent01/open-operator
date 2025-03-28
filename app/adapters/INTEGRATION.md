# Open Operator + Web UI Integration

This integration allows you to use Open Operator's frontend with Web UI's backend, giving you the best of both worlds.

## How It Works

The integration consists of several components:

1. **Open Operator Frontend**: A clean, modern interface for interacting with the AI agent.
2. **Web UI Backend**: Powerful browser automation capabilities with support for various LLMs.
3. **Bridge Server**: Acts as a proxy between Open Operator and Web UI.
4. **Mock Implementations**: Replace Browserbase and Stagehand with implementations that redirect to the bridge server.

![Integration Architecture](https://mermaid.ink/img/pako:eNp1kU1PwzAMhv9KlBMgdYUeOKCpHSAhcYCvA-KQJl4XLU1SJWlhqvbfcbuWDcTJ9vPasZ_YB2WsRpWoLXpvXnYGvYcHa1vTIhT4jAG9QcjxFWFnHQQMFQY0Lw5Kp9GhD1Dj2mD-5Jwv0HuEHDcQHFoIFVrwJTbWNxAqbNBXGJxvEQqsrXPQYLDOQY7P6Lc5bnJcW_-GUGHw9g1y3FiXY2XdM0KJjbUVQoGVtRsIJe6s3yKU-GD9I4QSn6zfIZTYWL-HsLLuAKHEV-tfIJTYWv8KocSd9TuEEt-s_4BQ4t76TwglfrVhD6HEQxg-IJT4HcIXhBIPIRwglHgM4RtCiT9h-IFQ4imEI4QSz2E4QSjxEsIvhBKvYfiDUOJvGE8QSryF8Q9CibcwXSCUeA_TFUKJjzBdIZT4DNMVQomvMF0hlPgO0xVCiVOYrhBKPIfpCqHES5iuEEq8hukKocRHmK4QSnyG6QqhxFeYrhBKfIfpCqHEKUxXCCWew3SFUOIlTFcIJV7DdIVQ4iNMVwglPsN0hVDiK0xXCCW-w3SFUOIUpitUiZcwXaFK_BumK1SJP2G6QpX4FaYrVIlfYbpClXgM0xWqxEOYrlAlbsN0hSrxFKYrVInnMF2hSryE6QpV4jVMV6gSH2G6QpX4DNMVqsRXmK5QJb7DdIUqcQrTFarEc5iuUCVewnSFKvEapitUiY8wXaFK_A9ZLfKl?type=png)

## Setup Instructions

### Prerequisites

- Node.js and npm (for Open Operator and the Bridge Server)
- Python 3.11+ (for Web UI)
- Web UI installed in the correct location

### Starting the Integration

We've provided a convenient script to start all components at once:

```bash
cd "d:/AI Agent/AI Agent/open-operator/app/adapters"
npm run start-all
```

This will:
1. Start the Web UI backend on port 7788
2. Start the bridge server on port 7789
3. Start the Open Operator frontend on port 3000

You can press Ctrl+C to stop all processes.

## Using the Integration

1. Open your browser and navigate to http://localhost:3000
2. Use the Open Operator interface to interact with the AI agent
3. Behind the scenes, your requests will be processed by Web UI

## Troubleshooting

- If you encounter issues with the bridge server, check the console output for error messages.
- If Web UI is not running, the bridge server will fail to start.
- If the bridge server is not running, Open Operator will fail to connect to Web UI.

## How It Works Technically

1. We've restored Open Operator's API routes to use Browserbase and Stagehand directly.
2. We've created mock implementations of Browserbase and Stagehand that redirect calls to our bridge server.
3. The bridge server forwards these calls to Web UI.
4. This allows Open Operator to use Web UI's backend without modifying its core code.

## Files

- `start-all.js`: Script to start all components together
- `bridge-server/server.js`: The bridge server that proxies requests between Open Operator and Web UI
- `lib/browserbase-mock.ts`: Mock implementation of Browserbase
- `lib/stagehand-mock.ts`: Mock implementation of Stagehand
