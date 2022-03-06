#!/bin/sh

version=${1:-dev}
base=$(dirname "$0")

docker build --build-arg BUILD_VERSION=$version --tag proximaone/services:dashboard-$version --file $base/../Dockerfile --target prod --progress=plain --secret id=npmrc,src=$HOME/.npmrc $base/..
