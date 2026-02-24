# --- CONFIGURATION ---
$API_GATEWAY_URL = "https://a51zkfw33h.execute-api.eu-west-3.amazonaws.com"
$CLOUDFRONT_ID = "ELQ1HZHZSADDA" # <--- METTEZ VOTRE ID ICI
$FRONTEND_PATH = "./frontend"
$BACKEND_PATH = "./backend"
$S3_BUCKET = "s3://stockhome-front-storage-383842796189"

Write-Host "?? D�marrage du d�ploiement StockHome..." -ForegroundColor Cyan

# 1. Build du Frontend
Write-Host "?? Build du Frontend React..." -ForegroundColor Yellow
cd $FRONTEND_PATH
$env:VITE_API_URL=$API_GATEWAY_URL
npx run build

# 2. D�ploiement Backend + Frontend (S3/CloudFront)
Write-Host "?? D�ploiement sur AWS via Serverless..." -ForegroundColor Yellow
cd ..
cd $BACKEND_PATH
# Suppression du cache pour �viter l'erreur de stream/zip
if (Test-Path ".serverless") { Remove-Item -Recurse -Force .serverless }
serverless deploy --stage prod

# 3. Sync S3 et Invalidation CloudFront
Write-Host "📤 Mise à jour du site sur S3..." -ForegroundColor Yellow
cd ..
cd $FRONTEND_PATH
aws s3 sync dist/ $S3_BUCKET --delete --region eu-west-3

Write-Host "🧹 Invalidation du cache CloudFront (pour propager la nouvelle URL)..." -ForegroundColor Yellow
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

cd ..
Write-Host "✅ Déploiement terminé avec succès !" -ForegroundColor Green