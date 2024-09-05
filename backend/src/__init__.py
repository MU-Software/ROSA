from __future__ import annotations

import contextlib
import os
import typing

import fastapi
import fastapi.middleware.cors
import fastapi.staticfiles
import playwright.async_api

from . import redis_client, routes


def create_app(**kwargs: dict) -> fastapi.FastAPI:
    @contextlib.asynccontextmanager
    async def app_lifespan(app: fastapi.FastAPI) -> typing.AsyncGenerator[None, None]:
        app.state.redis_client = redis_client.RedisClient(dsn=os.getenv("REDIS_DSN"))

        async with playwright.async_api.async_playwright() as p:
            app.state.browser = await p.chromium.launch()
            yield
            with contextlib.suppress(Exception):
                # If the browser is closed without opening any pages,
                # it will raise an error as the browser never started.
                # We can safely ignore this error.
                await app.state.browser.close()
        await app.state.redis_client.close()

    app = fastapi.FastAPI(
        **kwargs,
        lifespan=app_lifespan,
        middleware=[
            fastapi.middleware.Middleware(
                fastapi.middleware.cors.CORSMiddleware,
                allow_origins=["*"],
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["*"],
            ),
        ],
    )
    app.mount("/static", fastapi.staticfiles.StaticFiles(directory="src/static"), name="static")
    for route in routes.get_routes():
        app.include_router(route)

    return app
