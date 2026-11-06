<?php
// For localhost smoke tests ONLY: php -S 127.0.0.1:8787 -t server/public server/tests/router.php
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if (is_file(__DIR__.'/../public'.$path))return false;
require __DIR__.'/../public/index.php';