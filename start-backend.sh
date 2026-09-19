#!/bin/bash
set -a
source /opt/neurogrid/.env
set +a
exec node /opt/neurogrid/backend/dist/app.js
