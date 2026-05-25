param (
    [switch]$Force
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   PrintDesk Agent - Setup Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install Node.js first."
    exit 1
}

# 2. Setup Environment Variables
$envFile = ".env"
if (!(Test-Path $envFile) -or $Force) {
    Write-Host "Configuring Environment Variables..." -ForegroundColor Yellow
    $supabaseUrl = Read-Host "Enter SUPABASE_URL"
    $serviceRoleKey = Read-Host "Enter SUPABASE_SERVICE_ROLE_KEY"
    $printerName = Read-Host "Enter PRINTER_NAME (leave empty for default printer)"
    if ([string]::IsNullOrWhiteSpace($printerName)) {
        $printerName = "default"
    }
    $agentId = [guid]::NewGuid().ToString()

    $envContent = @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey
PRINTER_NAME=$printerName
AGENT_ID=$agentId
POLL_INTERVAL_SECONDS=1
DOWNLOAD_DIR=./downloads
PRINT_SETTINGS=paper=A4,fit
"@

    Set-Content -Path $envFile -Value $envContent
    Write-Host ".env file created successfully with Agent ID: $agentId" -ForegroundColor Green
} else {
    Write-Host ".env file already exists. Skipping environment setup." -ForegroundColor Green
}

# 3. Build the Application
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Building project..." -ForegroundColor Yellow
npm run build

# 4. Install and configure PM2
Write-Host "Checking PM2 installation..." -ForegroundColor Yellow
if (!(Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "Installing PM2 globally..."
    npm install -g pm2
    npm install -g pm2-windows-startup
    pm2-startup install
}

# 5. Start and Save the Service
Write-Host "Starting Agent Service..." -ForegroundColor Yellow
# Stop it if it already exists
pm2 stop printdesk-agent -s 2>$null
pm2 delete printdesk-agent -s 2>$null

# Start the built script
pm2 start dist/index.js --name "printdesk-agent"
pm2 save

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "The PrintDesk Agent is now running in the background via PM2."
Write-Host "To view logs, run: pm2 logs printdesk-agent"
Write-Host "=========================================" -ForegroundColor Cyan
