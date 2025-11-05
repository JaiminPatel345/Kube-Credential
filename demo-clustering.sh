#!/bin/bash

# Demo script to showcase multi-worker clustering

echo "=========================================="
echo "Multi-Worker Clustering Demo"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}This demo will:${NC}"
echo "1. Start the issuance service with 3 workers"
echo "2. Test the health endpoint to see different workers responding"
echo "3. Issue some credentials to demonstrate load distribution"
echo "4. Show performance metrics"
echo ""

# Function to check if service is ready
wait_for_service() {
    local port=$1
    local service_name=$2
    echo -e "${YELLOW}Waiting for ${service_name} to be ready...${NC}"
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:${port}/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ ${service_name} is ready!${NC}"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo "Failed to connect to ${service_name}"
    return 1
}

# Build the services first
echo -e "${YELLOW}Building services...${NC}"
cd "$(dirname "$0")/../backend/issuance-service"
npm run build > /dev/null 2>&1

# Start issuance service with 3 workers
echo ""
echo -e "${BLUE}Step 1: Starting issuance service with 3 workers${NC}"
echo "Command: WORKER_COUNT=3 npm start"
echo ""

# Run in background and capture PID
WORKER_COUNT=3 PORT=3001 npm start > /tmp/issuance-demo.log 2>&1 &
ISSUANCE_PID=$!

# Wait for service to be ready
sleep 3
wait_for_service 3001 "Issuance Service"

# Show worker startup logs
echo ""
echo -e "${BLUE}Worker Startup Logs:${NC}"
grep -E "\[Master\]|\[worker-" /tmp/issuance-demo.log | head -10

# Test health endpoint multiple times
echo ""
echo -e "${BLUE}Step 2: Testing health endpoint (10 requests)${NC}"
echo "Notice how different workers respond:"
echo ""

for i in {1..10}; do
    response=$(curl -s http://localhost:3001/health)
    worker=$(echo $response | grep -o 'worker-[0-9]*' | head -1)
    echo "  Request $i: Handled by ${worker}"
done

# Issue some credentials
echo ""
echo -e "${BLUE}Step 3: Issuing credentials across workers${NC}"
echo "Issuing 20 credentials..."
echo ""

success_count=0
for i in {1..20}; do
    response=$(curl -s -X POST http://localhost:3001/api/issue \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"Demo User $i\",
            \"credentialType\": \"demo-credential\",
            \"details\": {
                \"userId\": \"demo-$i\",
                \"timestamp\": \"$(date -Iseconds)\"
            }
        }")
    
    if echo "$response" | grep -q '"success":true'; then
        worker=$(echo $response | grep -o 'worker-[0-9]*' | head -1)
        success_count=$((success_count + 1))
        echo "  ✓ Credential $i issued by ${worker}"
    fi
done

echo ""
echo -e "${GREEN}Successfully issued ${success_count}/20 credentials${NC}"

# Show distribution across workers
echo ""
echo -e "${BLUE}Step 4: Worker Distribution${NC}"
echo "Checking which workers processed requests:"
echo ""

grep "issued by" /tmp/issuance-demo.log | grep -o 'worker-[0-9]*' | sort | uniq -c | while read count worker; do
    echo "  ${worker}: $count requests"
done

# Performance test
echo ""
echo -e "${BLUE}Step 5: Quick Performance Test${NC}"
echo "Sending 50 concurrent requests..."
echo ""

start_time=$(date +%s%N)

# Create 50 requests in parallel
for i in {1..50}; do
    curl -s -X POST http://localhost:3001/api/issue \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"Perf User $i\",
            \"credentialType\": \"performance-test\",
            \"details\": {
                \"userId\": \"perf-$i\"
            }
        }" > /dev/null 2>&1 &
done

# Wait for all background processes
wait

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))
throughput=$(echo "scale=2; 50000 / $duration" | bc)

echo -e "${GREEN}Results:${NC}"
echo "  Duration: ${duration}ms"
echo "  Average: $(echo "scale=2; $duration / 50" | bc)ms per request"
echo "  Throughput: ${throughput} req/sec"

# Cleanup
echo ""
echo -e "${YELLOW}Cleaning up...${NC}"
kill $ISSUANCE_PID 2>/dev/null
wait $ISSUANCE_PID 2>/dev/null

echo ""
echo -e "${GREEN}=========================================="
echo "Demo Complete!"
echo "==========================================${NC}"
echo ""
echo "Key Takeaways:"
echo "• Multiple workers share the same port"
echo "• Requests are distributed across workers"
echo "• Each worker can handle requests independently"
echo "• Overall throughput increases with more workers"
echo ""
echo "To run your own tests:"
echo "  cd backend/issuance-service"
echo "  npm run test:load"
echo ""
echo "To start with custom worker count:"
echo "  WORKER_COUNT=5 npm start"
echo ""
