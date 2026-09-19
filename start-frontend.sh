#!/bin/bash
set -a
source /opt/neurogrid/.env
set +a
exec /opt/neurogrid/frontend/node_modules/.bin/next start --port 4000
