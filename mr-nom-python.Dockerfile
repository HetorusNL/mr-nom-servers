FROM node:16-bookworm

# add the mr-nom-server-python files to the docker
COPY mr-nom-server-python/ /code

# install the requirements to run the mr-nom server
RUN cd /code && \
    corepack enable && \
    yarn set version stable && \
    yarn install

# set the environment default
ENV FCM_TOKEN=

# add/update the container labels
LABEL org.label-schema.vcs-ref=$VCS_REF
LABEL org.label-schema.vcs-url=https://github.com/HetorusNL/mr_nom_servers
LABEL org.opencontainers.image.authors=tim@hetorus.nl
LABEL org.opencontainers.image.source=https://github.com/HetorusNL/mr_nom_servers
LABEL org.opencontainers.image.description="Mr. Nom Servers"
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /code
ENTRYPOINT ["yarn", "start"]
