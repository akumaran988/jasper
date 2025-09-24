#!/bin/bash

# Service Manager Launch Examples

echo "🎯 SERVICE MANAGER LAUNCH OPTIONS"
echo ""

echo "1️⃣  LOCAL DEVELOPMENT (MCP Server)"
echo "   cd packages/service-manager"
echo "   npm run start:local"
echo "   # Server starts on http://localhost:8081"
echo ""

echo "2️⃣  REMOTE UAT SERVER"
echo "   cd packages/service-manager" 
echo "   node dist/cli.js --mode=remote --port=8080 --auth=required --api-key=uat-secret"
echo ""

echo "3️⃣  REMOTE PRODUCTION SERVER"
echo "   cd packages/service-manager"
echo "   node dist/cli.js --mode=remote --port=8443 --auth=required --api-key=prod-secret"
echo ""

echo "4️⃣  JASPER-UI WITH BUILTIN SERVER"
echo "   cd apps/jasper-ui"
echo "   npm run start:builtin"
echo "   # jasper-ui spawns service manager as subprocess"
echo ""

echo "5️⃣  JASPER-UI DIRECT MODE (NO SUBPROCESS!)"
echo "   cd apps/jasper-ui" 
echo "   npm run demo:direct"
echo ""

echo "🧪 TESTING ENDPOINTS:"
echo "   # Initialize MCP server"
echo "   curl -X POST http://localhost:8081/mcp/tools \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}'"
echo ""
echo "   # List available tools"  
echo "   curl -X POST http://localhost:8081/mcp/tools \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}'"
echo ""

echo "   # Create a service"
echo "   curl -X POST http://localhost:8081/mcp/tools \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"create_service\",\"arguments\":{\"name\":\"test-api\",\"type\":\"process\",\"command\":\"npm\",\"args\":[\"run\",\"dev\"]}}}'"