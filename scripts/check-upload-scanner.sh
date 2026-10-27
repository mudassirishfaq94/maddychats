#!/bin/sh
# Docker does not restart a container whose daemon died while PID 1 remained alive.
set -eu
state=$(docker inspect --format '{{.State.Health.Status}}' circlo-clamav-1)
if [ "$state" = unhealthy ]; then
  logger -t circlo-scanner 'Upload scanner unhealthy; restarting scanner container. Upload safety checks remain required.'
  docker restart circlo-clamav-1 >/dev/null
fi
