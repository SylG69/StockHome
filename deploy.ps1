# --- CONFIGURATION ---
$API_GATEWAY_URL = "https://5mfczcfffk.execute-api.eu-west-3.amazonaws.com"
$FRONTEND_PATH = "./frontend"
$BACKEND_PATH = "./backend"

Write-Host "?? D�marrage du d�ploiement StockHome..." -ForegroundColor Cyan

# 1. Build du Frontend
Write-Host "?? Build du Frontend React..." -ForegroundColor Yellow
cd $FRONTEND_PATH
$env:VITE_API_URL=$API_GATEWAY_URL
npm run build

# 2. D�ploiement Backend + Frontend (S3/CloudFront)
Write-Host "?? D�ploiement sur AWS via Serverless..." -ForegroundColor Yellow
cd ..
cd $BACKEND_PATH
# Suppression du cache pour �viter l'erreur de stream/zip
if (Test-Path ".serverless") { Remove-Item -Recurse -Force .serverless }
serverless deploy --stage prod

cd ..
cd $FRONTEND_PATH
aws s3 sync dist/ s3://stockhome-front-storage-383842796189 --region eu-west-3
cd ..

Write-Host "? D�ploiement termin� avec succ?s !" -ForegroundColor Green