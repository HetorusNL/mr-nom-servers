FROM python:3.14-alpine

RUN \
    # mount uv as it doesn't need to be baked into the image
    --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
    # add the src code to be moved into the src/ directory
    --mount=type=bind,source=mr-nom-server/,target=src-mount/,rw \
    # mount the project file, it also don't need to be in the image
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    \
    # make the script crash on errors and such
    set -eou; \
    \
    # use the system python, as we don't need a venv in the image
    export UV_PROJECT_ENVIRONMENT=/usr/local; \
    export UV_NO_EDITABLE=1; \
    # install the dependencies
    uv sync --no-dev; \
    \
    # make the src/ directory and move everything there
    mkdir -p /src/; \
    mv src-mount/* /src/;

ARG VCS_REF
LABEL org.label-schema.vcs-ref=$VCS_REF
LABEL org.label-schema.vcs-url=https://github.com/HetorusNL/mr_nom_servers
LABEL org.opencontainers.image.authors=tim@hetorus.nl
LABEL org.opencontainers.image.source=https://github.com/HetorusNL/mr_nom_servers
LABEL org.opencontainers.image.description="Mr. Nom Server"
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /src

ENTRYPOINT ["python3", "app.py"]
