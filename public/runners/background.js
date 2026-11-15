// Runs outside the web view, a few times a day while CutVid is closed (the OS picks the moments).
// It only checks whether a newer build was published and, if so, shows one local notification.

function kv(key) {
  var entry = CapacitorKV.get(key);
  return entry && entry.value ? entry.value : '';
}

// The app calls this on launch so the runner knows the installed build and the user's choice.
addEventListener('configure', function (resolve, reject, args) {
  try {
    CapacitorKV.set('version', String(args.version));
    CapacitorKV.set('enabled', args.enabled ? '1' : '0');
    resolve();
  } catch (err) {
    reject(err);
  }
});

addEventListener('checkUpdate', function (resolve, reject) {
  if (kv('enabled') === '0') return resolve();
  var installed = Number(kv('version') || 0);
  var told = Number(kv('notified') || 0);
  fetch('https://cutvid.vercel.app/version.json')
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var latest = Number(data.version);
      if (installed && latest > installed && latest > told) {
        CapacitorNotifications.schedule([{ id: 4100, title: 'CutVid', body: 'A new version of CutVid is available.' }]);
        CapacitorKV.set('notified', String(latest));
      }
      resolve();
    })
    .catch(function (err) {
      reject(err);
    });
});
