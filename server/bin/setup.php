<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/app/bootstrap.php';
if(!defined('PASSWORD_ARGON2ID')){fwrite(STDERR,"PHP must support Argon2id.\n");exit(1);}
$pdo=db();
$schema=file_get_contents(dirname(__DIR__).'/database/schema.sql');
if($schema===false){fwrite(STDERR,"Cannot read schema\n");exit(1);}
foreach(explode(';',$schema) as $statement){$statement=preg_replace('/^--.*$/m','',trim($statement));if(trim($statement)!=='')$pdo->exec($statement);}
$exists=(int)query('SELECT COUNT(*) n FROM users')->fetch()['n'];
if($exists){echo "Database initialized; an administrator already exists. No credentials changed.\n";exit(0);}
function ask(string $prompt):string {fwrite(STDOUT,$prompt);return trim((string)fgets(STDIN));}
$siteName=ask('Hotel name: ');$username=strtolower(ask('Initial SYS username: '));$full=ask('Full name: ');
if(!preg_match('/^[a-z0-9._-]{1,100}$/D',$username)||$siteName===''||$full===''){fwrite(STDERR,"Invalid input\n");exit(1);}
if(function_exists('shell_exec')&&DIRECTORY_SEPARATOR!=='\\')shell_exec('stty -echo 2>/dev/null');
$password=ask('Initial password (12+ chars, letters+digits): ');
if(function_exists('shell_exec')&&DIRECTORY_SEPARATOR!=='\\')shell_exec('stty echo 2>/dev/null');
echo "\n";
if(strlen($password)<12||!preg_match('/[A-Za-z]/',$password)||!preg_match('/\d/',$password)){fwrite(STDERR,"Password policy not met\n");exit(1);}
$site=uuid();$user=uuid();
transactional(function()use($site,$user,$siteName,$full,$username,$password){
 query('INSERT INTO sites(id,code,name,currency) VALUES(?,?,?,?)',[$site,'HQ',$siteName,'VND']);
 query("INSERT INTO users (id,username,full_name,role,password_hash,default_site_id) VALUES (?,?,?,'SYS',?,?)",[$user,$username,$full,password_hash($password,PASSWORD_ARGON2ID),$site]);
 query('INSERT INTO user_sites(user_id,site_id) VALUES (?,?)',[$user,$site]);
});
// Never print passwords to console or write them to files.
echo "Initial administrator created. Create a second SYS account immediately after login.\n";