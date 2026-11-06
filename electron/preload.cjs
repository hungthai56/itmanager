const {contextBridge, ipcRenderer} = require('electron');
const allowed = new Set(['app.info','auth.status','auth.setup','auth.login','auth.logout','auth.changePassword','sites.list','sites.save','users.list','users.save','users.password','records.list','records.save','records.batchStatus','records.delete','records.history','checklist.mark','roster.batch','project.tasks.list','project.tasks.save','project.tasks.delete','dashboard.get','audit.list','settings.get','settings.save','permissions.get','permissions.save','file.pick','file.open','file.save','reports.export','qr.print','backup.export','backup.import']);
contextBridge.exposeInMainWorld('lotus', Object.freeze({
  invoke: (action, payload = {}) => {
    if (!allowed.has(action)) return Promise.reject(new Error('Invalid action'));
    return ipcRenderer.invoke('lotus:invoke', action, payload);
  }
}));