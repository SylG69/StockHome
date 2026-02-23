import os, boto3
from fastapi import FastAPI, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from boto3.dynamodb.conditions import Key, Attr
from jose import jwt

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

region = os.environ.get('AWS_REGION', 'eu-west-3')
db = boto3.resource('dynamodb', region_name=region)

t_products = db.Table(os.environ.get('PRODUCTS_TABLE', 'StockHome-Products'))
t_shopping = db.Table(os.environ.get('SHOPPING_TABLE', 'StockHome-ShoppingList'))
t_ref = db.Table(os.environ.get('REF_TABLE', 'StockHome-ReferenceData'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret')

@app.get("/api/dashboard/stats")
async def get_stats(authorization: str = Header(...)):
    uid = jwt.decode(authorization.replace("Bearer ", ""), JWT_SECRET, algorithms=["HS256"]).get("sub")

    # 1. Récupération des produits pour calculs stocks bas et récents
    prods_res = t_products.query(KeyConditionExpression=Key('user_id').eq(uid))
    products = prods_res.get('Items', [])

    low_stock = [p for p in products if float(p.get('current_stock', 0)) <= float(p.get('min_stock', 0))]

    # 2. Compte de la shopping list (non cochés)
    shop_res = t_shopping.query(
        KeyConditionExpression=Key('user_id').eq(uid),
        FilterExpression=Attr('is_checked').eq(False)
    )

    # 3. Compte des catégories et lieux
    ref_res = t_ref.query(KeyConditionExpression=Key('user_id').eq(uid))
    refs = ref_res.get('Items', [])

    # 4. Aggregation par catégorie
    by_cat = {}
    for p in products:
        cid = p.get('category_id', 'uncategorized')
        by_cat[cid] = by_cat.get(cid, 0) + 1

    return {
        "total_products": len(products),
        "low_stock_count": len(low_stock),
        "total_categories": len([r for r in refs if r['id'].startswith("CAT#")]),
        "total_locations": len([r for r in refs if r['id'].startswith("LOC#")]),
        "shopping_list_count": len(shop_res.get('Items', [])),
        "products_by_category": by_cat,
        "recent_products": sorted(products, key=lambda x: x.get('updated_at', ''), reverse=True)[:5]
    }

handler = Mangum(app)