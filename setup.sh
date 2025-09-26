#!/bin/bash

# Cross-platform setup script for Unix/Linux/macOS
echo "[SETUP] Starting Jasper setup for Unix/Linux/macOS..."

# Make sure we have the right permissions
chmod +x setup.js

# Run the main setup
node setup.js

if [ $? -ne 0 ]; then
    echo "[ERROR] Setup failed with error code $?"
    exit 1
fi

echo "[SETUP] Setup completed successfully!"
echo ""
echo "To run Jasper:"
echo "  npm run dev          - Start Jasper UI in development mode"
echo "  npm run dev:server   - Start MCP server"
echo "  npm start            - Start Jasper UI"