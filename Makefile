include .env
export $(shell sed 's/=.*//' .env)

HOST ?= 127.0.0.1
PORT ?= 8000
REDIS_DSN ?= redis://localhost:6379/0

MAKEFLAGS += -j2
MKFILE_PATH := $(abspath $(lastword $(MAKEFILE_LIST)))
PROJECT_DIR := $(dir $(MKFILE_PATH))
BACKEND_DIR := $(PROJECT_DIR)/backend
FRONTEND_DIR := $(PROJECT_DIR)/frontend

GIT_MAIN_BRANCH_HEAD_HASH := $(shell git rev-parse origin/main)
ifeq (prod-update,$(firstword $(MAKECMDGOALS)))
  UPDATE_TARGET_GIT_HASH := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(eval $(UPDATE_TARGET_GIT_HASH):;@:)
endif
UPDATE_TARGET_GIT_HASH := $(if $(UPDATE_TARGET_GIT_HASH),$(UPDATE_TARGET_GIT_HASH),$(GIT_MAIN_BRANCH_HEAD_HASH))

ifeq (docker-build,$(firstword $(MAKECMDGOALS)))
  IMAGE_NAME := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(eval $(IMAGE_NAME):;@:)
endif
IMAGE_NAME := $(if $(IMAGE_NAME),$(IMAGE_NAME),rosa_image)

ifeq ($(DOCKER_DEBUG),true)
	DOCKER_MID_BUILD_OPTIONS = --progress=plain --no-cache
	DOCKER_END_BUILD_OPTIONS = 2>&1 | tee docker-build.log
else
	DOCKER_MID_BUILD_OPTIONS =
	DOCKER_END_BUILD_OPTIONS =
endif

# Docker compose setup
docker-compose-up:
	docker compose -f ./infra/docker-compose.yaml up -d

docker-compose-down:
	docker compose -f ./infra/docker-compose.yaml down

docker-compose-rm: docker-compose-down
	docker compose -f ./infra/docker-compose.yaml rm

# Docker image build for production
# Usage: make docker-build <image-name:=ROSA_image>
# if you want to build with debug mode, set DOCKER_DEBUG=true
# ex) make docker-build rosa_image DOCKER_DEBUG=true
docker-build:
	docker build \
		-f ./infra/Dockerfile -t $(IMAGE_NAME) \
		--build-arg GIT_HASH=$(shell git rev-parse HEAD) \
		--build-arg IMAGE_BUILD_DATETIME=$(shell date +%Y-%m-%d_%H:%M:%S) \
		$(DOCKER_MID_BUILD_OPTIONS) $(PROJECT_DIR) $(DOCKER_END_BUILD_OPTIONS)

docker-api:
	docker run -dit --rm -p 8000:8000 -e REDIS_DSN=$(REDIS_DSN) $(IMAGE_NAME)

# Docker runner for Raspberry Pi
# --privileged is required for USB device access,
# /dev is required for USB device access,
# /var/lib/usbutils/usb.ids is required for lsusb,
# /run/udev is required for udevadm
docker-api-raspi:
	docker run \
		-dit --rm --privileged --net=host \
		-v /dev:/dev \
		-v /var/lib/usbutils/usb.ids:/var/lib/usbutils/usb.ids \
		-v /run/udev:/run/udev:ro \
		-e REDIS_DSN=$(REDIS_DSN) \
		$(IMAGE_NAME)

docker-cmd-raspi:
	docker run \
		-dit --rm --privileged --net=host \
		-v /dev:/dev \
		-v /var/lib/usbutils/usb.ids:/var/lib/usbutils/usb.ids \
		-v /run/udev:/run/udev:ro \
		$(IMAGE_NAME) python -m src.cli --redis-dsn=$(REDIS_DSN) --port=8000

# Server Execution
api-local: docker-compose-up
	@cd $(BACKEND_DIR) && poetry run python -m src --host $(HOST) --port $(PORT) --debug

api-prod: docker-compose-up
	@cd $(BACKEND_DIR) && poetry run python -m src --host $(HOST) --port $(PORT)

# Server Devtools
hooks-install:
	@cd $(BACKEND_DIR) && poetry run pre-commit install

hooks-upgrade:
	@cd $(BACKEND_DIR) && poetry run pre-commit autoupdate

hooks-lint:
	@cd $(BACKEND_DIR) && poetry run pre-commit run --all-files

lint: hooks-lint  # alias

hooks-mypy:
	@cd $(BACKEND_DIR) && poetry run pre-commit run mypy --all-files

mypy: hooks-mypy  # alias

# Server CLI tools
cli-%:
	@if [[ -z "$*" || "$*" == '.o' ]]; then echo "Usage: make cli-<command>"; exit 1; fi
	@cd $(BACKEND_DIR) && poetry run python -m app.cli $*

# Frontend
front-local:
	@cd $(FRONTEND_DIR) && pnpm run dev

# Run all
run-local: api-local front-local
