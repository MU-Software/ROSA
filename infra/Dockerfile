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

RUN apt-get update; \
    apt-get install  -y --no-install-recommends curl openssh-client gcc git libpq-dev; \
    curl -sSL https://install.python-poetry.org | python3.12 -;

ENV PATH="${PATH}:/root/.local/bin:"

COPY ../backend/poetry.lock ../backend/pyproject.toml ./

RUN poetry config experimental.system-git-client true; \
    poetry config virtualenvs.create false; \
    poetry install --only main --no-interaction --no-ansi --no-root;

ARG GIT_HASH
ENV TZ=Asia/Seoul \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONIOENCODING=UTF-8 \
    DEPLOYMENT_GIT_HASH=$GIT_HASH

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl wget ca-certificates gnupg lsb-release supervisor usbutils udev \
    && apt-get autoremove -y \
    && apt-get autoclean -y \
    && apt-get clean -y \
    && rm -rf /var/cache/apt/archives /var/lib/apt/lists/*;

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

# Install playwright
RUN playwright install-deps chromium
RUN playwright install chromium

# Copy frontend build
COPY --from=frontend-builder /app/dist /src/static

# Run the application
# ARG WORKERS=4
# CMD [ "python3.12", "-m", "src", "--host", "0.0.0.0", "--port", "8000" ]
CMD [ "/usr/bin/supervisord" ]
