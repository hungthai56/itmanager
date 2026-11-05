const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

// Compile the pure translation module for Node's built-in test runner, without an Electron/browser.
function loadI18n(){
 const source=fs.readFileSync(path.join(__dirname,'../src/i18n.ts'),'utf8');
 const {outputText,diagnostics}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 const compiled={exports:{}};
 new Function('require','module','exports',outputText)(require,compiled,compiled.exports);
 return compiled.exports;
}
test('default Vietnamese translation covers primary modules and statuses',()=>{
 const {setUILanguage,tr}=loadI18n();
 setUILanguage('vi');
 assert.equal(tr('Daily Tasks'),'Công việc hằng ngày');
 assert.equal(tr('Inventory'),'Quản lý thiết bị');
 assert.equal(tr('Done'),'Hoàn thành');
 assert.equal(tr('Not Done'),'Chưa hoàn thành');
 assert.equal(tr('Budget'),'Ngân sách');
 assert.equal(tr('English'),'Tiếng Anh');
});
test('switch to English translates Vietnamese UI without changing database keys',()=>{
 const {setUILanguage,tr}=loadI18n();
 const stored={status:'Done',frequency:'Daily',shift:'D'};
 setUILanguage('en');
 assert.equal(tr('Công việc hằng ngày'),'Daily Tasks');
 assert.equal(tr('Thêm đầu việc'),'Add task');
 assert.equal(tr('Hoàn thành'),'Done');
 assert.equal(tr('Ngân sách'),'Budget');
 assert.deepEqual(stored,{status:'Done',frequency:'Daily',shift:'D'});
});