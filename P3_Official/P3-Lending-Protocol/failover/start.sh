#!/bin/sh
# Start script for P3 Lending in AWS failover mode

set -e

echo "🚀 Starting P3 Lending in AWS failover mode..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until pg_isready -h ${DATABASE_HOST:-localhost} -p ${DATABASE_PORT:-5432} -U ${DATABASE_USER:-p3user}; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Run database migrations if needed
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "📊 Running database migrations..."
  # Add migration command here if you have one
  # npm run migrate
fi

# Start the local auth server in background
echo "🔐 Starting auth server..."
node local-auth-server.cjs &
AUTH_PID=$!

# Wait for auth server to be ready
sleep 5

# Start the Vite frontend server
echo "🌐 Starting frontend server..."
npm run dev -- --host 0.0.0.0 --port 5173 &
VITE_PID=$!

# Function to handle shutdown
shutdown() {
  echo "🛑 Shutting down gracefully..."
  kill -TERM $AUTH_PID 2>/dev/null || true
  kill -TERM $VITE_PID 2>/dev/null || true
  wait $AUTH_PID 2>/dev/null || true
  wait $VITE_PID 2>/dev/null || true
  echo "✅ Shutdown complete"
  exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Keep container alive and monitor processes
while true; do
  # Check if auth server is still running
  if ! kill -0 $AUTH_PID 2>/dev/null; then
    echo "❌ Auth server died, restarting..."
    node local-auth-server.cjs &
    AUTH_PID=$!
  fi

  # Check if Vite is still running
  if ! kill -0 $VITE_PID 2>/dev/null; then
    echo "❌ Vite server died, restarting..."
    npm run dev -- --host 0.0.0.0 --port 5173 &
    VITE_PID=$!
  fi

  sleep 10
done
