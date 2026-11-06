import {cpSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'../../');
const source=resolve(repo,'dist');
const output=resolve(repo,'server/public/app');
if(!existsSync(source))throw Error('dist missing: run npm run build first');
rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});cpSync(source,output,{recursive:true});
console.log('Web build ready:',output);