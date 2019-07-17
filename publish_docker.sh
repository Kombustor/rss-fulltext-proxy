#!/bin/sh
VERSION=$(node -p "require('./package.json').version")

docker build -t kombustor/rss-fulltext-proxy:${VERSION} .
docker push kombustor/rss-fulltext-proxy