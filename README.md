# jasper

A Claude Code-like terminal AI assistant with tool calling capabilities

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

## Scripts

```json
{
  "dev": "tsx src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit"
}
```

## Keywords

```json
[
  "ai",
  "assistant",
  "terminal",
  "cli",
  "tools"
]
```

## Dependencies

```json
{
  "@google/genai": "^1.17.0",
  "chalk": "^4.1.2",
  "commander": "^11.1.0",
  "dotenv": "^16.3.1",
  "ink": "^4.4.1",
  "ink-markdown": "^1.0.4",
  "marked": "^16.2.1",
  "react": "^18.2.0",
  "zod": "^3.22.4"
}
```

## Dev Dependencies

```json
{
  "@types/marked": "^5.0.2",
  "@types/node": "^20.10.5",
  "@types/react": "^18.2.45",
  "ts-node": "^10.9.2",
  "tsx": "^4.20.5",
  "typescript": "^5.3.3"
}
```

## Author

Your Name

## License

MIT