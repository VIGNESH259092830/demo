const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building Interview Helper Assistant...');

// Ensure directories exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Install Python dependencies
console.log('📦 Installing Python dependencies...');
try {
    execSync('pip install -r requirements.txt', { stdio: 'inherit' });
} catch (error) {
    console.log('⚠️ Failed to install Python dependencies. Please install manually.');
}

// Build Electron app
console.log('⚡ Building Electron application...');
try {
    execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}

console.log('✅ Build completed!');
console.log('📁 Output files are in the "dist" folder.');
console.log('🚀 Run "InterviewHelperAssistant.exe" to start the application.');