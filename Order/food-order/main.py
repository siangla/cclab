from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from app.core.firebase import init_firebase
from app.api.v1.routes import auth, stores, orders, config, waitlist, uploads

init_firebase()

app = FastAPI(title="訂餐系統 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(auth.router, prefix="/api/v1")
app.include_router(stores.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(config.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")

# 靜態檔案服務
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

# 前端頁面路由（SPA fallback）
@app.get("/")
async def index():
    return FileResponse("frontend/pages/index.html")

@app.get("/merchant")
async def merchant_dashboard():
    return FileResponse("frontend/pages/merchant.html")

@app.get("/store/{store_id}")
async def store_page(store_id: str):
    return FileResponse("frontend/pages/store.html")

@app.get("/orders")
async def orders_page():
    return FileResponse("frontend/pages/orders.html")
