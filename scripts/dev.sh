#!/bin/bash

# Amori API Development Script
# Starts all required services and the development server

set -e

echo "🩷 Amori API Development Environment"
echo "======================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start services
echo "📦 Starting PostgreSQL and Redis..."
docker-compose up -d postgres redis

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check PostgreSQL
until docker exec amori-postgres pg_isready -U amori -d amori > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Check Redis
until docker exec amori-redis redis-cli ping > /dev/null 2>&1; do
    echo "   Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  No .env file found. Running setup..."
    bun run setup
fi

# Run database migrations
echo ""
echo "📊 Running database migrations..."
bun run migrate

echo ""
echo "🚀 Starting Amori API..."
echo "   API:     http://localhost:${PORT:-3000}"
echo "   Swagger: http://localhost:${PORT:-3000}/swagger"
echo "   Health:  http://localhost:${PORT:-3000}/health"
echo ""

# Start the development server
bun run dev
