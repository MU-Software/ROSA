# Frontend Builder
FROM node:22-alpine AS frontend-builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY ../frontend /app
RUN rm -rf /app/node_modules
WORKDIR /app
RUN pnpm fetch
RUN pnpm install -r --offline
RUN pnpm run build

# ==============================================================================
FROM python:3.12-slim-bookworm AS runtime
SHELL [ "/bin/bash", "-euxvc"]

ARG GIT_HASH
ENV TZ=Asia/Seoul \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONIOENCODING=UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_NO_INTERACTION=1 \
    DEPLOYMENT_GIT_HASH=$GIT_HASH \
    PATH="${PATH}:/root/.local/bin:"

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl gcc wget ca-certificates gnupg lsb-release supervisor usbutils udev \
    && apt-get autoremove -y \
    && apt-get autoclean -y \
    && apt-get clean -y \
    && rm -rf /var/cache/apt/archives /var/lib/apt/lists/* \
    && curl -sSL https://install.python-poetry.org | python3.12 -;

COPY ../backend/poetry.lock ../backend/pyproject.toml ./

# Install Python dependencies
RUN --mount=type=cache,target=/home/.cache/pypoetry poetry install --only main --no-interaction --no-ansi --no-root;

# Install playwright
# Actually, caching browser binaries is not recommended as described in https://playwright.dev/python/docs/ci#caching-browsers,
# but as we had to build image frequently for the fast development, we had to cache this to reduce build time.
RUN --mount=type=cache,target=/home/.cache/ms-playwright poetry run playwright install --with-deps --only-shell chromium

# Make docker to always copy app directory so that source code can be refreshed.
ARG IMAGE_BUILD_DATETIME=unknown
ENV DEPLOYMENT_IMAGE_BUILD_DATETIME=$IMAGE_BUILD_DATETIME

# Copy main app
COPY ../backend/src/ /src

# Copy supervisord configuration
COPY ../infra/supervisord.ini /etc/supervisord.conf

# Create directories for logs
RUN mkdir -p /var/log/supervisor
RUN mkdir -p /var/log/poca

# Copy frontend build
COPY --from=frontend-builder /app/dist /src/static

# Run the application
# ARG WORKERS=4
# CMD [ "python3.12", "-m", "src", "--host", "0.0.0.0", "--port", "8000" ]
CMD [ "/usr/bin/supervisord" ]
