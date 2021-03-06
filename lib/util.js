var fs = require('fs');
var path = require('path');
var logger = require(path.join(__dirname, 'logger'));

/**
 * Try to create a directory if it doesn't already
 * exist (as a directory).
 * @param {String} dir Directory path
 * @return {Boolean} true if directory already existed
 *         or was successfully created, false if a non
 *         directory existed at the path or there was
 *         an error creating one at the path
 */
var tryCreateDirectorySync = function(dir) {
  var success = false;

  try {
    var res = fs.statSync(dir);
    if(res.isDirectory()) {
      logger.log('debug', 'Directory already exists', { path: dir });
      success = true;
    } else {
      logger.error('Unable to create directory, exists but isn\'t a directory', { path: dir });
      success = false;
    }
  } catch(err) {
    // Nothing exists, try to create
    try {
      fs.mkdirSync(dir);
      logger.log('debug', 'Directory created', { path: dir });
      success = true;
    } catch(err) {
      logger.error(err, { msg: 'Attempt to create directory failed', path: dir });
      success = false;
    }
  }

  return success;
};

module.exports = {
  tryCreateDirectorySync: tryCreateDirectorySync
};
