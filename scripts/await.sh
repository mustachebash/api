#!/bin/sh
while [ ! -d "$1" ] && [ ! -f "$1" ]; do

echo "Waiting for '$1' to exist..."
sleep 1

done
shift
eval "$@"
