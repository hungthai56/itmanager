<?php
// Copy to server/config.local.php OUTSIDE public/; never commit this file.
putenv('LOTUS_DB_HOST=127.0.0.1');
putenv('LOTUS_DB_PORT=3306');
putenv('LOTUS_DB_NAME=lotus_it');
putenv('LOTUS_DB_USER=lotus_api');
putenv('LOTUS_DB_PASSWORD=REPLACE_WITH_A_RANDOM_DATABASE_PASSWORD');