const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const filePath = () => path.join(app.getPath('userData'), 'preferences.json');

const defaults = {
  mode: 'original',
  bounds: null,
};

function loadPrefs() {
  try {
    if (!fs.existsSync(filePath())) return { ...defaults };
    return { ...defaults, ...JSON.parse(fs.readFileSync(filePath(), 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

function savePrefs(partial) {
  const next = { ...loadPrefs(), ...partial };
  try {
    fs.writeFileSync(filePath(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
  return next;
}

module.exports = { loadPrefs, savePrefs };
