#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ANSI color codes for terminal output
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function createEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    log('⚠️  .env file already exists!', colors.yellow);
    const proceed = process.argv.includes('--force');
    if (!proceed) {
      log('Use --force to overwrite existing .env file', colors.blue);
      return false;
    }
  }

  const secret = generateSecret();
  
  const envContent = `# Server Configuration
PORT=3000
NODE_ENV=development

# Application Secret
APP_SECRET=${secret}
BASE_URL=http://localhost:3000

# Database Configuration (Update these for your setup)
DATABASE_URL=postgres://etera:secret@localhost:5432/eteradb

# Redis Configuration (Update these for your setup)
REDIS_URL=redis://:redis_secret@localhost:6379

# Kafka Configuration (matches docker-compose defaults)
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=example-microservice

# OAuth Providers (Optional - Get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Service (Optional - Get from Resend.com)
RESEND_API_KEY=your-resend-api-key

# SMS Service (Optional - Get from Twilio.com)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Development Settings
LOG_LEVEL=info
`;

  fs.writeFileSync(envPath, envContent);
  return true;
}

function showInstructions() {
  log('\n🚀 Microservice Setup Complete!', colors.green + colors.bold);
  log('\n📋 Next Steps:', colors.blue + colors.bold);
  
  log('\n1. 🗃️  Set up your database:', colors.yellow);
  log('   • Start PostgreSQL and Redis using Docker Compose:');
  log('     docker-compose up -d postgres redis', colors.blue);
  log('   • Or update DATABASE_URL and REDIS_URL in .env for your existing services');
  
  log('\n2. 🔧 Configure optional services:', colors.yellow);
  log('   • Google OAuth: Get credentials from Google Cloud Console');
  log('   • Email: Sign up at resend.com for RESEND_API_KEY');
  log('   • SMS: Sign up at twilio.com for SMS capabilities');
  
  log('\n3. 🏃 Run the development server:', colors.yellow);
  log('   bun run dev', colors.blue);
  
  log('\n4. 📚 Access your API:', colors.yellow);
  log('   • API: http://localhost:3000');
  log('   • Swagger Docs: http://localhost:3000/swagger');
  log('   • Health Check: http://localhost:3000/health');
  log('   • Metrics: http://localhost:3000/metrics');
  
  log('\n5. 🧪 Run tests:', colors.yellow);
  log('   bun test', colors.blue);
  
  log('\n📖 For more information, check the README.md file', colors.green);
}

function main() {
  log('🔧 Setting up Microservice...', colors.blue + colors.bold);
  
  try {
    const created = createEnvFile();
    
    if (created) {
      log('✅ Created .env file with secure secrets', colors.green);
    }
    
    showInstructions();
    
  } catch (error) {
    log(`❌ Setup failed: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  main();
} 