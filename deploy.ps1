# Деплой AI Mindful Journal
# Использование: .\deploy.ps1 -All | -Frontend | -Backend

param(
    [switch]$Frontend,
    [switch]$Backend,
    [switch]$All,
    [switch]$SetupWebhook
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host "`n🚀 $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️ $message" -ForegroundColor Yellow
}

# Deploy Backend to Railway
function Deploy-Backend {
    Write-Step "Deploying Backend to Railway..."
    
    # Check if railway CLI is installed
    if (!(Get-Command railway -ErrorAction SilentlyContinue)) {
        Write-Warning "Railway CLI not found. Installing..."
        npm install -g @railway/cli
    }
    
    # Build TypeScript first
    Write-Step "Building TypeScript..."
    Set-Location server
    npm run build
    Set-Location ..
    
    # Deploy
    railway up
    
    Write-Success "Backend deployed to Railway!"
}

# Deploy Frontend to Vercel
function Deploy-Frontend {
    Write-Step "Deploying Frontend to Vercel..."
    
    # Check if vercel CLI is installed
    if (!(Get-Command vercel -ErrorAction SilentlyContinue)) {
        Write-Warning "Vercel CLI not found. Installing..."
        npm install -g vercel
    }
    
    Set-Location client
    vercel --prod
    Set-Location ..
    
    Write-Success "Frontend deployed to Vercel!"
}

# Setup Telegram Webhook
function Setup-Webhook {
    Write-Step "Setting up Telegram Webhook..."
    
    $botToken = Read-Host "Enter your Telegram Bot Token"
    $webhookUrl = Read-Host "Enter your Backend URL (e.g., https://your-api.railway.app)"
    
    $fullWebhookUrl = "$webhookUrl/bot/webhook"
    
    $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{url = $fullWebhookUrl} | ConvertTo-Json)
    
    if ($response.ok) {
        Write-Success "Webhook set successfully!"
        Write-Host "Webhook URL: $fullWebhookUrl"
    } else {
        Write-Warning "Failed to set webhook: $($response.description)"
    }
    
    # Verify
    $info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
    Write-Host "`nWebhook Info:" -ForegroundColor Cyan
    $info.result | Format-List
}

# Main
Write-Host @"

╔═══════════════════════════════════════════════════════╗
║          AI Mindful Journal - Deployment              ║
╚═══════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

if ($SetupWebhook) {
    Setup-Webhook
    exit
}

if ($All) {
    Deploy-Backend
    Deploy-Frontend
    
    Write-Host "`n" -NoNewline
    Write-Success "All deployments complete!"
    Write-Host @"

📋 Next steps:
1. Set WEBAPP_URL in Railway to your Vercel URL
2. Run: .\deploy.ps1 -SetupWebhook
3. Configure Menu Button in @BotFather

"@ -ForegroundColor White
}
elseif ($Backend) {
    Deploy-Backend
}
elseif ($Frontend) {
    Deploy-Frontend
}
else {
    Write-Host @"
Usage:
  .\deploy.ps1 -All          Deploy both frontend and backend
  .\deploy.ps1 -Frontend     Deploy only frontend to Vercel
  .\deploy.ps1 -Backend      Deploy only backend to Railway
  .\deploy.ps1 -SetupWebhook Configure Telegram webhook

"@ -ForegroundColor White
}
