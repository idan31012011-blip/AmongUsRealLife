const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit 0/O, 1/I for readability

function generateCode(existingCodes) {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return existingCodes.has(code) ? generateCode(existingCodes) : code;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Default task descriptions pool per room; falls back to generic list
const GENERIC_TASKS = [
  'Fix the wiring',
  'Empty the trash',
  'Clean the vents',
  'Calibrate equipment',
  'Submit a report',
  'Replace the filter',
  'Check the connections',
  'Reboot the system',
  'Refuel the generator',
  'Align the telescope',
  'Upload the data',
  'Inspect the manifold',
];

function getTaskDescription(room, index) {
  return GENERIC_TASKS[index % GENERIC_TASKS.length];
}

module.exports = { generateCode, shuffle, getTaskDescription };
