#!/bin/bash

# magic options for bash to make scripts safer
set -Eeuxo pipefail

# check if we're running on a tag creation
if [[ $REF_TYPE == "tag" ]]; then
    # we're running on tag creation, set DOCKER_TAG to that tag
    # make sure that the tag specified is valid
    DOCKER_TAG=`echo $REF_NAME | sed 's/[^a-zA-Z0-9\._-]/-/g'`
else # we're running on a branch
    # create a valid docker tag name from the branch name
    VALID_BRANCH_NAME=`echo $REF_NAME | sed 's/[^a-zA-Z0-9\._-]/-/g'`
    # if the branch is master, create an image using 'latest', otherwise the valid branch name
    if [[ $VALID_BRANCH_NAME == "master" ]]; then
        DOCKER_TAG=latest
    else
        DOCKER_TAG="test-$VALID_BRANCH_NAME"
    fi
fi

# build the docker image with the configured registry and tag
docker build --file $DOCKERFILE --build-arg VCS_REF=`git rev-parse --short HEAD` --pull --tag "$CI_REGISTRY:$DOCKER_TAG" .
# push the built image to the registry
docker push "$CI_REGISTRY:$DOCKER_TAG"
