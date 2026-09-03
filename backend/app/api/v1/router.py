"""Aggregate router for API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routes import admin, assets, audit, auth, health, incidents, trash

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(assets.router)
api_router.include_router(incidents.router)
api_router.include_router(audit.router)
api_router.include_router(trash.router)
api_router.include_router(admin.router)
