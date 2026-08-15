#!/bin/sh
exec /usr/bin/cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
