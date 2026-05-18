// Helper for mercenary timeout tests: outputs one line then sleeps forever.
// Killed by treeKill when the run() timeout fires.
process.stdout.write('SLOW_CHILD_STARTED\n');
setTimeout(function () {}, 60000);
