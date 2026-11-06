<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once dirname(__DIR__).'/app/bootstrap.php';
$checks=['PHP 8.3+'=>PHP_VERSION_ID>=80300,'PDO MySQL'=>extension_loaded('pdo_mysql'),'Argon2id'=>defined('PASSWORD_ARGON2ID'),
 'Secure randomness'=>function_exists('random_bytes'),'JSON'=>extension_loaded('json'),'OpenSSL'=>extension_loaded('openssl')];
foreach($checks as $name=>$ok)echo ($ok?'OK ':'FAIL ').$name."\n";
try{query('SELECT 1');echo "OK MySQL connection\n";}catch(Throwable){echo "FAIL MySQL connection\n";}