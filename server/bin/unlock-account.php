<?php
declare(strict_types=1);
// Emergency recovery, only via trusted CLI and local database credentials. No HTTP endpoint exists.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/app/bootstrap.php';
fwrite(STDOUT,"Locked username to unlock: ");
$username=strtolower(trim((string)fgets(STDIN)));
if(!preg_match('/^[a-z0-9._-]{1,100}$/D',$username)){fwrite(STDERR,"Invalid username\n");exit(1);}
$u=query('SELECT id,role,account_locked FROM users WHERE username=?',[$username])->fetch();
if(!$u){fwrite(STDERR,"User not found\n");exit(1);}
fwrite(STDOUT,"This will reset failed login attempts for {$username} ({$u['role']}). Type UNLOCK to confirm: ");
if(trim((string)fgets(STDIN))!=='UNLOCK'){fwrite(STDERR,"Cancelled\n");exit(1);}
transactional(function()use($u,$username){
 query('UPDATE users SET account_locked=0,failed_attempts=0 WHERE id=?',[$u['id']]);
 audit(null,'CLI_ACCOUNT_UNLOCK',null,['userId'=>$u['id'],'username'=>$username]);
});
echo "Account unlocked. All existing tokens remain subject to their current expiry/revocation.\n";