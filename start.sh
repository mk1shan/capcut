#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "ClipLab Studio -> http://localhost:8765"
PHP_CLI_SERVER_WORKERS=4 php -d upload_max_filesize=4G -d post_max_size=4G -d memory_limit=1024M -d max_execution_time=0 -d max_input_time=0 -S localhost:8765
